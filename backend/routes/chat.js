const express = require('express');
const router = express.Router();
const retellService = require('../services/retell');
const ragService = require('../services/rag');

// In-memory conversation store (per session - use Redis/DB in production)
const conversations = new Map();

/**
 * POST /api/chat/message
 * Send a message to the AI chat agent via Retell LLM
 */
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const resolvedSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const agentId = process.env.RETELL_CHAT_AGENT_ID;
    if (!agentId) {
      return res.status(500).json({ success: false, error: 'Chat agent not configured' });
    }

    // Get or create conversation history
    if (!conversations.has(resolvedSessionId)) {
      conversations.set(resolvedSessionId, []);
    }
    const history = conversations.get(resolvedSessionId);

    // Fetch agent config from Retell to get base prompt + LLM id
    let basePrompt = 'You are the EnlightLab AI assistant. You help users with AI services, pricing, case studies, and booking consultations. Be helpful, professional, and concise.';
    let retellLlmId = null;

    try {
      const agentConfig = await retellService.getAgent(agentId);
      if (agentConfig?.general_prompt) {
        basePrompt = agentConfig.general_prompt;
      }
      // Retell agent stores llm_id inside response_engine
      if (agentConfig?.response_engine?.llm_id) {
        retellLlmId = agentConfig.response_engine.llm_id;
      }
    } catch (err) {
      console.warn('[CHAT] Could not fetch agent config, using defaults:', err.message);
    }

    // Retrieve relevant knowledge from RAG
    const { context, sources } = await ragService.retrieveContext(message.trim(), 3);

    // Build RAG-enhanced system prompt
    let systemPrompt = basePrompt;
    if (context) {
      systemPrompt += `\n\nUse the following company knowledge to answer accurately. If the answer is not in the knowledge base, use your general understanding but clearly state when information is from the knowledge base versus general knowledge.\n\nKNOWLEDGE BASE:\n${context}`;
    }

    // Add user message to history
    history.push({ role: 'user', content: message.trim() });

    // Keep only last 10 messages for context
    const recentHistory = history.slice(-10);

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
    ];

    // Generate response via Retell LLM API
    let reply = '';

    try {
      reply = await callRetellLLM(retellLlmId, messages);
    } catch (err) {
      console.warn('[CHAT] Retell LLM call failed, using fallback:', err.message);
      reply = context
        ? generateRAGResponse(message.trim(), context, sources)
        : getFallbackResponse(message.trim());
    }

    // Add assistant reply to history
    history.push({ role: 'assistant', content: reply });

    return res.json({
      success: true,
      reply,
      sessionId: resolvedSessionId,
      usedRAG: !!context,
      sources: sources || [],
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
 * Call Retell's LLM API directly.
 *
 * Retell exposes a chat-completion-compatible endpoint:
 *   POST https://api.retellai.com/v2/retell-llm/{llm_id}/chat
 *
 * If no llm_id is available, falls back to the generic Retell LLM endpoint
 * which uses the API key's associated default model.
 */
async function callRetellLLM(llmId, messages) {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) throw new Error('RETELL_API_KEY not set');

  const url = llmId
    ? `https://api.retellai.com/v2/retell-llm/${llmId}/chat`
    : 'https://api.retellai.com/v2/retell-llm/chat';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Retell LLM API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();

  // Retell LLM response mirrors OpenAI format:
  // { choices: [{ message: { content: '...' } }] }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Retell LLM returned no content');

  return content;
}

/**
 * POST /api/chat/reset
 * Clear conversation history
 */
router.post('/reset', (req, res) => {
  const { sessionId = 'default' } = req.body;
  conversations.delete(sessionId);
  res.json({ success: true, message: 'Conversation reset' });
});

// Generate response from RAG context (fallback when LLM is unavailable)
function generateRAGResponse(message, context, sources) {
  const lower = message.toLowerCase();

  const sentences = context.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
  const relevant = sentences.filter(s => {
    const words = lower.split(/\s+/);
    return words.some(w => s.toLowerCase().includes(w) && w.length > 3);
  });

  if (relevant.length > 0) {
    let response = relevant.slice(0, 3).join('. ') + '.';
    response = response.replace(/---\s*[^-]+\s*---/g, '').trim();
    response = response.replace(/\n+/g, ' ').trim();
    if (response.length > 50) return response;
  }

  return getFallbackResponse(message);
}

// Keyword-based fallback (last resort)
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