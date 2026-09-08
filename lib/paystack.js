const crypto = require('crypto');

const PAYSTACK_BASE = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';

function isConfigured() {
  return Boolean(SECRET_KEY);
}

async function paystackRequest(path, options = {}) {
  if (!isConfigured()) {
    const err = new Error('Paystack is not configured yet. Set PAYSTACK_SECRET_KEY to accept payments.');
    err.code = 'PAYSTACK_NOT_CONFIGURED';
    err.kind = 'unexpected';
    err.statusCode = 503;
    err.retryable = false;
    throw err;
  }
  const response = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status === false) {
    const err = new Error(body.message || `Paystack request failed with status ${response.status}`);
    err.code = body.code || 'PAYSTACK_ERROR';
    err.kind = 'unexpected';
    err.statusCode = response.status === 400 || response.status === 422 ? 400 : 502;
    err.retryable = response.status >= 500;
    err.data = body;
    throw err;
  }
  return body;
}

async function initializeTransaction({ email, amount, reference, channel, callbackUrl, metadata }) {
  const payload = {
    email,
    amount: Math.round(amount * 100),
    currency: 'NGN',
    reference,
    channels: channel === 'bank_transfer' ? ['bank_transfer'] : ['card'],
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    ...(metadata ? { metadata } : {}),
  };
  const result = await paystackRequest('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    reference: result.data.reference,
    authorizationUrl: result.data.authorization_url,
    accessCode: result.data.access_code,
  };
}

async function verifyTransaction(reference) {
  const result = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
  const d = result.data || {};
  return {
    status: d.status,
    gatewayResponse: d.gateway_response,
    amountKobo: typeof d.amount === 'number' ? d.amount : null,
    paidAt: d.paid_at || null,
    channel: d.channel || null,
  };
}

function verifyWebhook(body, signature) {
  if (!isConfigured() || !signature) return false;
  const expected = crypto.createHmac('sha512', SECRET_KEY).update(body).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  isConfigured,
  initializeTransaction,
  verifyTransaction,
  verifyWebhook,
  PAYSTACK_BASE,
};