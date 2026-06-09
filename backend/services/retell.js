/**
 * retell.js
 * Wrapper around the Retell AI REST API
 * Docs: https://docs.retellai.com/api-references/
 */

const RETELL_BASE = 'https://api.retellai.com';

function getHeaders() {
  return {
    'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Schedule an outbound phone call
 * POST /v2/create-phone-call
 */
async function scheduleOutboundCall({ toNumber, fromNumber, agentId, metadata, dynamicVariables }) {
  const body = {
    from_number: fromNumber,
    to_number: toNumber,
    agent_id: agentId,  // FIXED: was override_agent_id, which is wrong for v2
    metadata,
    retell_llm_dynamic_variables: dynamicVariables || {},
  };

  const res = await fetch(`${RETELL_BASE}/v2/create-phone-call`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[RETELL] create-phone-call error:', data);
    throw new Error(data?.detail || data?.message || `Retell API error ${res.status}`);
  }

  console.log(`[RETELL] Call created: ${data.call_id} → ${toNumber}`);
  return data;
}

/**
 * Get live call status
 * GET /v2/get-call/:call_id
 */
async function getCallStatus(callId) {
  const res = await fetch(`${RETELL_BASE}/v2/get-call/${callId}`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Retell API error ${res.status}`);
  return {
    callId: data.call_id,
    status: data.call_status,
    duration: data.duration_ms,
    recordingUrl: data.recording_url,
    disconnectionReason: data.disconnection_reason,
    sentiment: data.call_analysis?.user_sentiment,
    summary: data.call_analysis?.call_summary,
  };
}

/**
 * List all agents
 * GET /list-agents
 */
async function listAgents() {
  const res = await fetch(`${RETELL_BASE}/v2/list-agents`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Retell API error ${res.status}`);
  return data;
}

/**
 * Get a specific agent config
 * GET /get-agent/:agent_id
 */
async function getAgent(agentId) {
  const res = await fetch(`${RETELL_BASE}/v2/get-agent/${agentId}`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Retell API error ${res.status}`);
  return data;
}

/**
 * Update agent prompt dynamically
 * PATCH /update-agent/:agent_id
 */
async function updateAgentPrompt(agentId, promptOverride) {
  const res = await fetch(`${RETELL_BASE}/v2/update-agent/${agentId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ general_prompt: promptOverride }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Retell API error ${res.status}`);
  return data;
}

/**
 * List all phone numbers on the account
 */
async function listPhoneNumbers() {
  const res = await fetch(`${RETELL_BASE}/v2/list-phone-numbers`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Retell API error ${res.status}`);
  return data;
}

module.exports = {
  scheduleOutboundCall,
  getCallStatus,
  listAgents,
  getAgent,
  updateAgentPrompt,
  listPhoneNumbers,
};