/**
 * retell.js
 * Thin wrapper around the Retell AI REST API v2
 * Docs: https://docs.retellai.com/api-references/
 */

const RETELL_BASE = 'https://api.retellai.com';

function getHeaders() {
  if (!process.env.RETELL_API_KEY) {
    throw new Error('RETELL_API_KEY environment variable is not set');
  }
  return {
    'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
    'Content-Type':  'application/json',
  };
}

// ─────────────────────────────────────────────────────────────
// Create a web call (browser-based) and return access_token
// ─────────────────────────────────────────────────────────────
async function createWebCall(agentId) {
  const res = await fetch(`${RETELL_BASE}/v2/create-web-call`, {
    method:  'POST',
    headers: getHeaders(),
    body:    JSON.stringify({ agent_id: agentId }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('[RETELL] create-web-call error:', data);
    throw new Error(data?.detail || data?.message || `Retell API error ${res.status}`);
  }
  if (!data.access_token) throw new Error('Retell did not return access_token');
  return data; // { call_id, access_token }
}

// ─────────────────────────────────────────────────────────────
// Schedule an outbound phone call
// POST /v2/create-phone-call
// ─────────────────────────────────────────────────────────────
async function scheduleOutboundCall({ toNumber, fromNumber, agentId, metadata, dynamicVariables }) {
  const body = {
    from_number:                  fromNumber,
    to_number:                    toNumber,
    agent_id:                     agentId,
    metadata:                     metadata || {},
    retell_llm_dynamic_variables: dynamicVariables || {},
  };

  const res = await fetch(`${RETELL_BASE}/v2/create-phone-call`, {
    method:  'POST',
    headers: getHeaders(),
    body:    JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[RETELL] create-phone-call error:', data);
    throw new Error(data?.detail || data?.message || `Retell API error ${res.status}`);
  }

  console.log(`[RETELL] Phone call created: ${data.call_id} → ${toNumber}`);
  return data;
}

// ─────────────────────────────────────────────────────────────
// Get live / post-call status
// GET /v2/get-call/:call_id
// ─────────────────────────────────────────────────────────────
async function getCallStatus(callId) {
  const res = await fetch(`${RETELL_BASE}/v2/get-call/${callId}`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Retell API error ${res.status}`);
  return {
    callId:               data.call_id,
    status:               data.call_status,
    duration:             data.duration_ms,
    recordingUrl:         data.recording_url,
    disconnectionReason:  data.disconnection_reason,
    sentiment:            data.call_analysis?.user_sentiment,
    summary:              data.call_analysis?.call_summary,
  };
}

// ─────────────────────────────────────────────────────────────
// List all agents on the account
// ─────────────────────────────────────────────────────────────
async function listAgents() {
  const res = await fetch(`${RETELL_BASE}/v2/list-agents`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Retell API error ${res.status}`);
  return data;
}

// ─────────────────────────────────────────────────────────────
// Get a specific agent config
// ─────────────────────────────────────────────────────────────
async function getAgent(agentId) {
  const res = await fetch(`${RETELL_BASE}/v2/get-agent/${agentId}`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Retell API error ${res.status}`);
  return data;
}

// ─────────────────────────────────────────────────────────────
// Update agent prompt dynamically
// ─────────────────────────────────────────────────────────────
async function updateAgentPrompt(agentId, promptOverride) {
  const res = await fetch(`${RETELL_BASE}/v2/update-agent/${agentId}`, {
    method:  'PATCH',
    headers: getHeaders(),
    body:    JSON.stringify({ general_prompt: promptOverride }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Retell API error ${res.status}`);
  return data;
}

// ─────────────────────────────────────────────────────────────
// List all phone numbers registered on the account
// ─────────────────────────────────────────────────────────────
async function listPhoneNumbers() {
  const res = await fetch(`${RETELL_BASE}/v2/list-phone-numbers`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `Retell API error ${res.status}`);
  return data;
}

module.exports = {
  createWebCall,
  scheduleOutboundCall,
  getCallStatus,
  listAgents,
  getAgent,
  updateAgentPrompt,
  listPhoneNumbers,
};
