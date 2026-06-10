const express = require('express');
const router = express.Router();
const ragService = require('../services/rag');

// In-memory chat session store: sessionId -> retell chat_id
// On Vercel (serverless), this resets between cold starts — acceptable for demos.
// For production persistence, swap this Map for Redis or a DB.
const sessionToChatId = new Map();

const RETELL_BASE = 'https://api.retellai.com';

/**
 * Create a new Retell chat session for the given agent.
 * Returns the chat_id to be reused for all subsequent messages.
 */
async function createRetellChat(agentId, apiKey) {
  const res = await fetch(`${RETELL_BASE}/v2/create-chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ agent_id: agentId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create Retell chat (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.chat_id) throw new Error('Retell did not return a chat_id');
  return data.chat_id;
}

/**
 * Send a message to an existing Retell chat session.
 * Returns the agent's reply string.
 */
async function sendRetellMessage(chatId, content, apiKey) {
  const res = await fetch(`${RETELL_BASE}/v2/create-chat-completion`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chat_id: chatId, content }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Retell chat completion failed (${res.status}): ${body}`);
  }

  const data = await res.json();

  // Response shape: { messages: [{ role: 'agent', content: '...' }, ...] }
  // The last message from the agent is the reply.
  const messages = data?.messages || [];
  const agentMessages = messages.filter(m => m.role === 'agent');
  const reply = agentMessages[agentMessages.length - 1]?.content;

  if (!reply) throw new Error('Retell returned no agent message');
  return reply;
}

/**
 * POST /api/chat/message
 */
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const resolvedSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const agentId = process.env.RETELL_CHAT_AGENT_ID;
    const apiKey = process.env.RETELL_API_KEY;

    if (!agentId || !apiKey) {
      return res.status(500).json({ success: false, error: 'Chat agent not configured' });
    }

    // Get or create a Retell chat session for this browser session
    let chatId = sessionToChatId.get(resolvedSessionId);
    if (!chatId) {
      chatId = await createRetellChat(agentId, apiKey);
      sessionToChatId.set(resolvedSessionId, chatId);
      console.log(`[CHAT] New Retell chat created: ${chatId} for session: ${resolvedSessionId}`);
    }

    // Optional: enrich the message with RAG context
    let enrichedMessage = message.trim();
    let usedRAG = false;
    let sources = [];

    try {
      const { context, sources: ragSources } = await ragService.retrieveContext(message.trim(), 3);
      if (context) {
        enrichedMessage = `${message.trim()}\n\n[Context from knowledge base for your reference: ${context}]`;
        usedRAG = true;
        sources = ragSources;
      }
    } catch (ragErr) {
      console.warn('[CHAT] RAG unavailable:', ragErr.message);
    }

    // Send message to Retell
    const reply = await sendRetellMessage(chatId, enrichedMessage, apiKey);

    return res.json({
      success: true,
      reply,
      sessionId: resolvedSessionId,
      usedRAG,
      sources,
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
 * End the Retell chat session and clear local mapping.
 */
router.post('/reset', async (req, res) => {
  const { sessionId = 'default' } = req.body;
  const chatId = sessionToChatId.get(sessionId);

  if (chatId) {
    try {
      await fetch(`${RETELL_BASE}/v2/end-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chat_id: chatId }),
      });
    } catch (err) {
      console.warn('[CHAT] Could not end Retell chat:', err.message);
    }
    sessionToChatId.delete(sessionId);
  }

  res.json({ success: true, message: 'Conversation reset' });
});

module.exports = router;
