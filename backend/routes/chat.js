const express = require('express');
const router = express.Router();
const retellService = require('../services/retell');

// In-memory conversation store (per session - use Redis/DB in production)
const conversations = new Map();

/**
 * POST /api/chat/message
 * Send a message to the AI chat agent
 */
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const agentId = process.env.RETELL_CHAT_AGENT_ID;
    if (!agentId) {
      return res.status(500).json({ success: false, error: 'Chat agent not configured' });
    }

    // Get or create conversation history
    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, []);
    }
    const history = conversations.get(sessionId);

    // Fetch agent config from Retell to get the system prompt
    let systemPrompt = 'You are the EnlightLab AI assistant. You help users with AI services, pricing, case studies, and booking consultations. Be helpful, professional, and concise.';
    try {
      const agentConfig = await retellService.getAgent(agentId);
      if (agentConfig && agentConfig.general_prompt) {
        systemPrompt = agentConfig.general_prompt;
      }
    } catch (err) {
      console.warn('[CHAT] Could not fetch agent config, using default prompt:', err.message);
    }

    // Add user message to history
    history.push({ role: 'user', content: message.trim() });

    // Keep only last 10 messages for context
    const recentHistory = history.slice(-10);

    // Build messages array for LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory
    ];

    // Call OpenAI for the response (our voice platform handles the agent config)
    let reply = '';
    const openaiKey = process.env.OPENAI_API_KEY;

    if (openaiKey) {
      try {
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: messages,
            temperature: 0.7,
            max_tokens: 500,
          }),
        });
        const openaiData = await openaiRes.json();
        if (openaiData.choices && openaiData.choices[0]) {
          reply = openaiData.choices[0].message.content;
        } else {
          throw new Error(openaiData.error?.message || 'OpenAI returned no response');
        }
      } catch (err) {
        console.error('[CHAT] OpenAI error:', err.message);
        reply = getFallbackResponse(message.trim());
      }
    } else {
      // No OpenAI key - use smart fallback
      reply = getFallbackResponse(message.trim());
    }

    // Add assistant reply to history
    history.push({ role: 'assistant', content: reply });

    return res.json({
      success: true,
      reply,
      sessionId,
      usedOpenAI: !!openaiKey,
    });

  } catch (err) {
    console.error('[CHAT] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to process message',
      reply: 'I apologize, but I am having trouble responding right now. Please try again or contact us directly.',
    });
  }
});

/**
 * POST /api/chat/reset
 * Clear conversation history
 */
router.post('/reset', (req, res) => {
  const { sessionId = 'default' } = req.body;
  conversations.delete(sessionId);
  res.json({ success: true, message: 'Conversation reset' });
});

// Smart fallback responses based on keywords
function getFallbackResponse(message) {
  const lower = message.toLowerCase();

  if (lower.includes('price') || lower.includes('cost') || lower.includes('pricing') || lower.includes('how much')) {
    return "Pricing depends on your specific needs. Our AI agent projects typically start at $15,000-$30,000. For a detailed quote, please schedule a free consultation through our contact form or outbound call demo.";
  }
  if (lower.includes('service') || lower.includes('what do you do') || lower.includes('offer')) {
    return "We offer AI Agent Development, AI Consulting, Web & Mobile Development, MVP Development, DevOps Consulting, and Staff Augmentation. Which service are you interested in learning more about?";
  }
  if (lower.includes('case study') || lower.includes('client') || lower.includes('portfolio')) {
    return "We've worked with Mozilla Foundation, Huma, Emblazer.ai, MAERSK, and many others. You can view our case studies in the Case Studies section of this page. Would you like me to tell you about a specific project?";
  }
  if (lower.includes('contact') || lower.includes('call') || lower.includes('book') || lower.includes('schedule')) {
    return "You can schedule a free consultation by filling out the contact form below, or try our Outbound Call Demo where our AI agent will call you at your preferred time. Would you like me to guide you to either option?";
  }
  if (lower.includes('time') || lower.includes('hour') || lower.includes('location') || lower.includes('where')) {
    return "We are a remote-first company with team members across multiple time zones. We operate 24/7 and can schedule calls at your convenience. What time works best for you?";
  }
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return "Hello! Welcome to EnlightLab. I'm your AI assistant. I can help you learn about our AI services, pricing, case studies, or book a consultation. What would you like to know?";
  }
  if (lower.includes('thank')) {
    return "You're welcome! I'm here if you need anything else. Feel free to ask about our services or book a consultation anytime.";
  }
  if (lower.includes('ai agent') || lower.includes('voice agent') || lower.includes('chatbot')) {
    return "Our AI Agent Development service creates custom voice and chat agents for businesses. We handle everything from use-case discovery to deployment. Typical delivery is 4-6 weeks. Would you like to schedule a demo call to experience one?";
  }

  return "That's a great question. To give you the most accurate information, I'd recommend scheduling a free consultation with our team. You can use the contact form below or try our AI Outbound Call Demo. Is there anything specific about our services you'd like to know in the meantime?";
}

module.exports = router;