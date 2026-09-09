const VTPASS_BASE = (process.env.VTPASS_BASE_URL || 'https://vtpass.com/api').replace(/\/+$/, '');
const API_KEY = process.env.VTPASS_API_KEY || '';
const PUBLIC_KEY = process.env.VTPASS_PUBLIC_KEY || '';
const SECRET_KEY = process.env.VTPASS_SECRET_KEY || '';

function isConfigured() {
  return Boolean(API_KEY && PUBLIC_KEY && SECRET_KEY);
}

function notConfiguredError() {
  const err = new Error(
    'Service payments are not configured yet. Set VTPASS_API_KEY, VTPASS_PUBLIC_KEY and VTPASS_SECRET_KEY to enable them.'
  );
  err.code = 'SERVICE_NOT_CONFIGURED';
  err.kind = 'unexpected';
  err.statusCode = 503;
  err.retryable = false;
  return err;
}

async function vtpassRequest(path, options = {}) {
  if (!isConfigured()) throw notConfiguredError();
  const method = options.method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...(method === 'GET'
      ? { 'api-key': API_KEY, 'public-key': PUBLIC_KEY }
      : { 'api-key': API_KEY, 'secret-key': SECRET_KEY }),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(`${VTPASS_BASE}${path}`, {
      ...options,
      method,
      headers,
    });
  } catch (e) {
    const err = new Error('Could not reach the service provider. Please try again.');
    err.code = 'VENDOR_UNREACHABLE';
    err.kind = 'unexpected';
    err.statusCode = 502;
    err.retryable = true;
    err.cause = e;
    throw err;
  }

  const text = await response.text().catch(() => '');
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    body = {};
  }

  if (!response.ok) {
    const err = new Error(body && body.response_description ? body.response_description : `VTpass request failed with status ${response.status}`);
    err.code = body && body.code !== undefined ? String(body.code) : 'VTPASS_ERROR';
    err.kind = 'unexpected';
    err.statusCode = response.status >= 500 ? 502 : 400;
    err.retryable = response.status >= 500;
    err.data = body;
    throw err;
  }
  return body;
}

async function walletBalance() {
  const body = await vtpassRequest('/balance');
  const balance = body && body.contents ? body.contents.balance : null;
  return typeof balance === 'number' ? balance : Number(balance) || 0;
}

async function serviceVariations(serviceID) {
  const body = await vtpassRequest(`/service-variations?serviceID=${encodeURIComponent(serviceID)}`);
  const content = (body && body.content) || {};
  const list = Array.isArray(content.varations)
    ? content.varations
    : Array.isArray(content.variations)
      ? content.variations
      : [];
  return list;
}

async function merchantVerify({ serviceID, billersCode, type }) {
  const payload = { serviceID, billersCode };
  if (type) payload.type = type;
  return vtpassRequest('/merchant-verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function pay(payload) {
  return vtpassRequest('/pay', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function requery(request_id) {
  return vtpassRequest('/requery', {
    method: 'POST',
    body: JSON.stringify({ request_id }),
  });
}

module.exports = {
  isConfigured,
  walletBalance,
  serviceVariations,
  merchantVerify,
  pay,
  requery,
  notConfiguredError,
  VTPASS_BASE,
};