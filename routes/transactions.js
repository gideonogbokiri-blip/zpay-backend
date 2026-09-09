const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authMiddleware, apiError } = require('../middleware');
const {
  db, save, generateId, SERVICE_NAMES, PROVIDERS,
} = require('../store');
const { requireVendor } = require('../lib/vendor');
const { isConfigured, pay: vtpassPay, requery: vtpassRequery } = require('../lib/vtpass');
const { vtpassServiceID, getVariations, resolveVariationAmount } = require('../lib/vendor-catalog');

function providerFee(providerId) {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  return provider ? provider.fee : 0;
}

function makeRequestId() {
  const lagos = new Date(Date.now() + 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const base = `${lagos.getUTCFullYear()}${p(lagos.getUTCMonth() + 1)}${p(lagos.getUTCDate())}${p(lagos.getUTCHours())}${p(lagos.getUTCMinutes())}`;
  return `${base}${crypto.randomBytes(4).toString('hex')}`;
}

const PENDING_RETRY_MS = [4000, 8000, 15000, 25000, 45000];
const requerying = new Set();

function classifyVtpass(result) {
  if (!result) return 'failed';
  const code = String(result.code || '');
  const status = result.content && result.content.transactions ? result.content.transactions.status : undefined;
  if (status === 'delivered') return 'delivered';
  if (status === 'pending' || status === 'initiated') return 'pending';
  if (['000', '001', '020', '099', '089'].includes(code)) return 'pending';
  return 'failed';
}

function notify(userId, type, title, message) {
  if (!db.notifications[userId]) db.notifications[userId] = [];
  db.notifications[userId].unshift({
    id: generateId('ntf'),
    type,
    title,
    message,
    readAt: null,
    createdAt: new Date().toISOString(),
  });
}

function pickPurchasedCode(t, content) {
  if (!t) return null;
  const candidates = [t.purchased_code, t.pin, content && (content.Pin || content.pin), content && content.token];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  if (Array.isArray(t.tokens) && t.tokens.length) {
    return t.tokens.map((x) => (typeof x === 'object' ? x.Pin || x.pin || x.name || '' : x)).filter(Boolean).join(', ');
  }
  if (Array.isArray(t.cards) && t.cards.length) {
    return t.cards.map((c) => c.Pin || c.pin || c.SN || c.serial || '').filter(Boolean).join(', ');
  }
  return null;
}

function applyDelivered(tx, result) {
  const t = result.content && result.content.transactions;
  const wallet = db.wallets[tx.userId];
  if (wallet) wallet.balance = Math.max(0, (wallet.balance || 0) - tx.total);
  tx.status = 'successful';
  tx.providerReference = (t && (t.transactionId || t.reference || t.requestId)) || tx.vendorRequestId || generateId('PRV');
  tx.purchasedCode = pickPurchasedCode(t, result.content);
  tx.updatedAt = new Date().toISOString();
  tx.metadata = {
    ...(tx.metadata || {}),
    vendor: {
      transactionId: t && t.transactionId,
      description: (t && t.description) || (result.content && result.content.transactions && result.content.transactions.description) || result.response_description || null,
    },
  };
  notify(tx.userId, 'payment', 'Payment successful', `Your ${SERVICE_NAMES[tx.service]} payment of NGN ${tx.total} was successful.`);
  save();
}

function applyFailed(tx) {
  tx.status = 'failed';
  tx.updatedAt = new Date().toISOString();
  notify(tx.userId, 'payment', 'Payment failed', `Your ${SERVICE_NAMES[tx.service]} payment could not be completed. No funds were charged.`);
  save();
}

function scheduleRequery(txId, attempt) {
  if (attempt >= PENDING_RETRY_MS.length || requerying.has(txId)) return;
  requerying.add(txId);
  setTimeout(async () => {
    try {
      const tx = db.transactions.find((t) => t.id === txId);
      if (!tx || tx.status !== 'pending' || !tx.vendorRequestId) return;
      const result = await vtpassRequery(tx.vendorRequestId);
      const outcome = classifyVtpass(result);
      if (outcome === 'delivered') {
        applyDelivered(tx, result);
      } else if (outcome === 'failed') {
        applyFailed(tx);
      } else {
        scheduleRequery(txId, attempt + 1);
      }
    } catch (e) {
      scheduleRequery(txId, attempt + 1);
    } finally {
      requerying.delete(txId);
    }
  }, PENDING_RETRY_MS[attempt]);
}

function handleVendorError(tx, err) {
  const code = String((err && err.code) || '');
  const ambiguous = ['000', '001', '020', '099', '089', 'VENDOR_UNREACHABLE'];
  const definiteFail = code && /^\d{3}$/.test(code) && !ambiguous.includes(code) && !err.retryable;
  if (definiteFail) {
    applyFailed(tx);
    return;
  }
  tx.status = 'pending';
  tx.updatedAt = new Date().toISOString();
  save();
  scheduleRequery(tx.id, 0);
}

function maybeReconcile(tx) {
  if (!isConfigured()) return;
  if (tx.status !== 'pending' || !tx.vendorRequestId) return;
  if (Date.now() - new Date(tx.createdAt || Date.now()).getTime() < 15000) return;
  scheduleRequery(tx.id, 0);
}

function buildPayPayload(service, args) {
  const base = { request_id: args.requestId, serviceID: args.serviceID };
  switch (service) {
    case 'AIRTIME':
      return { ...base, amount: args.amount, phone: args.customerIdentifier };
    case 'DATA':
      return {
        ...base,
        billersCode: args.customerIdentifier,
        variation_code: args.variation,
        amount: args.amount,
        phone: args.customerIdentifier,
      };
    case 'TV': {
      const payload = {
        ...base,
        billersCode: args.customerIdentifier,
        variation_code: args.variation,
        amount: args.amount,
        phone: args.phone || args.customerIdentifier,
      };
      if (args.serviceID === 'dstv' || args.serviceID === 'gotv') {
        payload.subscription_type = 'change';
        payload.quantity = 1;
      }
      return payload;
    }
    case 'ELECTRICITY':
      return {
        ...base,
        billersCode: args.customerIdentifier,
        variation_code: args.variation || 'prepaid',
        amount: args.amount,
        phone: args.phone || '',
      };
    default:
      return null;
  }
}

async function runVendorPurchase(tx, args, service) {
  const result = await vtpassPay(buildPayPayload(service, args));
  const outcome = classifyVtpass(result);
  if (outcome === 'delivered') {
    applyDelivered(tx, result);
  } else if (outcome === 'pending') {
    tx.status = 'pending';
    tx.updatedAt = new Date().toISOString();
    save();
    scheduleRequery(tx.id, 0);
  } else {
    applyFailed(tx);
  }
}

router.get('/', authMiddleware, (req, res) => {
  const { service, status, page = 1 } = req.query;
  const pageNum = parseInt(page) || 1;
  const pageSize = 20;

  const all = db.transactions.filter((tx) => tx.userId === req.userId);
  const filtered = all.filter((tx) => {
    const matchService = !service || service === 'ALL' || tx.service === service;
    const matchStatus = !status || status === 'ALL' || tx.status === status;
    return matchService && matchStatus;
  });

  const start = (pageNum - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  res.json({ items, page: pageNum, hasMore: start + pageSize < filtered.length });
});

router.get('/:id', authMiddleware, (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id && t.userId === req.userId);
  if (!tx) {
    throw apiError('NOT_FOUND', 'Transaction not found.', 'validation', { statusCode: 404 });
  }
  maybeReconcile(tx);
  res.json(tx);
});

router.post('/pay', authMiddleware, async (req, res, next) => {
  try {
    const user = db.users[req.userId];
    if (!user) {
      throw apiError('UNAUTHENTICATED', 'Your session has expired. Please log in again.', 'authentication', { statusCode: 401 });
    }
    if (!user.pinSet || !/^\d{4}$/.test(String(req.body.pin || '')) || user.pin !== String(req.body.pin)) {
      throw apiError('PIN_INVALID', 'Enter your correct 4-digit transaction PIN.', 'validation', { statusCode: 400 });
    }

    const { service, providerId, customerIdentifier, amount, variationCode, pin, idempotencyKey, metadata } = req.body;

    requireVendor();

    if (idempotencyKey) {
      const key = `${req.userId}:${idempotencyKey}`;
      if (db.idempotency[key]) {
        return res.json(db.idempotency[key]);
      }
    }

    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider) {
      throw apiError('INVALID_SERVICE', 'Invalid provider selected.', 'validation', { statusCode: 400 });
    }

    const fee = providerFee(providerId);
    const phone = req.body.phone || user.phone || '';
    let charge = Number(amount) || 0;
    let variation = variationCode || null;

    if (isConfigured()) {
      if (service === 'DATA' || service === 'TV') {
        if (!variation) {
          throw apiError('INVALID_PLAN', 'Select a data or TV plan.', 'validation', { statusCode: 400 });
        }
        const serviceID = vtpassServiceID(providerId);
        if (!serviceID) {
          throw apiError('INVALID_SERVICE', 'This provider is not available through our service provider yet.', 'unexpected', { statusCode: 503 });
        }
        const resolved = await resolveVariationAmount(serviceID, variation);
        if (resolved === null) {
          throw apiError('INVALID_PLAN', 'The selected plan is no longer available. Please pick another.', 'validation', { statusCode: 400 });
        }
        charge = resolved;
      } else if (service === 'ELECTRICITY') {
        variation = variation === 'postpaid' ? 'postpaid' : 'prepaid';
      }
    }

    const total = charge + fee;
    const wallet = db.wallets[req.userId] || { balance: 0, currency: 'NGN' };

    if (wallet.balance < total) {
      throw apiError('INSUFFICIENT_FUNDS', 'Insufficient wallet balance.', 'insufficient_funds', {
        retryable: false,
        data: { balance: wallet.balance, required: total, needed: total - wallet.balance },
        statusCode: 400,
      });
    }

    const now = new Date().toISOString();
    const transaction = {
      id: generateId('tx'),
      reference: generateId('ZP'),
      userId: req.userId,
      service,
      serviceName: SERVICE_NAMES[service] || service,
      amount: charge,
      fee,
      total,
      currency: 'NGN',
      paymentMethod: 'wallet',
      status: 'pending',
      providerReference: null,
      customerIdentifier: customerIdentifier || null,
      variationCode: variation,
      vendorRequestId: null,
      purchasedCode: null,
      metadata: metadata || null,
      createdAt: now,
      updatedAt: now,
    };
    db.transactions.unshift(transaction);

    if (idempotencyKey) {
      db.idempotency[`${req.userId}:${idempotencyKey}`] = transaction;
    }

    if (!isConfigured()) {
      const providerFailed = metadata && metadata.simulateProviderFailure === true;
      if (providerFailed) {
        transaction.status = 'failed';
        transaction.updatedAt = new Date().toISOString();
        notify(req.userId, 'payment', 'Payment failed', `Your ${SERVICE_NAMES[service]} payment could not be completed. No funds were charged.`);
        save();
        return res.json(transaction);
      }

      wallet.balance -= total;
      transaction.status = 'successful';
      transaction.providerReference = generateId('PRV');
      transaction.variationCode = variation;
      transaction.updatedAt = new Date().toISOString();
      notify(req.userId, 'payment', 'Payment successful', `Your ${SERVICE_NAMES[service]} payment of NGN ${total} was successful.`);
      save();
      return res.json(transaction);
    }

    const requestId = makeRequestId();
    transaction.vendorRequestId = requestId;
    const serviceID = vtpassServiceID(providerId);
    await runVendorPurchase(
      transaction,
      {
        requestId,
        serviceID,
        customerIdentifier: customerIdentifier || '',
        amount: charge,
        variation,
        phone,
      },
      service
    );
    res.json(transaction);
  } catch (err) {
    next(err);
  }
});

router.post('/register', authMiddleware, async (req, res, next) => {
  try {
    const user = db.users[req.userId];
    if (!user) {
      throw apiError('UNAUTHENTICATED', 'Your session has expired. Please log in again.', 'authentication', { statusCode: 401 });
    }
    if (!user.pinSet || !/^\d{4}$/.test(String(req.body.pin || '')) || user.pin !== String(req.body.pin)) {
      throw apiError('PIN_INVALID', 'Enter your correct 4-digit transaction PIN.', 'validation', { statusCode: 400 });
    }

    const { service, pin, idempotencyKey, payload, metadata } = req.body;

    if (service === 'NECO') {
      throw apiError('SERVICE_NOT_CONFIGURED', 'NECO registration is not available yet. Please check back soon.', 'unexpected', { statusCode: 503 });
    }
    if (service !== 'WAEC' && service !== 'JAMB') {
      throw apiError('INVALID_SERVICE', 'Unsupported registration service.', 'validation', { statusCode: 400 });
    }

    requireVendor();

    if (idempotencyKey) {
      const key = `${req.userId}:${idempotencyKey}`;
      if (db.idempotency[key]) {
        const existing = db.idempotency[key];
        return res.json({
          transaction: existing,
          application: {
            id: generateId('app'),
            reference: existing.reference,
            service,
            paymentStatus: existing.status,
            registrationStatus: existing.status === 'successful' ? 'registered' : existing.status === 'failed' ? 'failed' : 'payment_pending',
            fee: 0,
            metadata: payload,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          },
        });
      }
    }

    const serviceID = vtpassServiceID(service);
    let charge = Number(req.body.amount) || 0;
    let variationCode = null;

    if (!isConfigured()) {
      charge = Number(req.body.amount) || 0;
    } else {
      let selected = null;
      try {
        const variations = await getVariations(serviceID);
        if (Array.isArray(variations)) {
          if (service === 'WAEC') {
            selected = variations.find((v) => /registr/i.test(v.variation_code || '')) || variations[0];
          } else {
            selected = variations.find((v) => (v.variation_code || '') === 'utme-no-mock') || variations.find((v) => (v.variation_code || '').includes('utme')) || variations[0];
          }
        }
      } catch (e) {
        selected = null;
      }
      if (!selected) {
        throw apiError('VENDOR_UNAVAILABLE', 'This exam registration is temporarily unavailable. Please try again later.', 'unexpected', { statusCode: 503 });
      }
      variationCode = selected.variation_code;
      const variationAmount = Number(selected.variation_amount);
      if (Number.isFinite(variationAmount) && variationAmount > 0) {
        charge = variationAmount;
      }
    }

    const total = charge;
    const wallet = db.wallets[req.userId] || { balance: 0, currency: 'NGN' };
    if (wallet.balance < total) {
      throw apiError('INSUFFICIENT_FUNDS', 'Insufficient wallet balance.', 'insufficient_funds', {
        retryable: false,
        data: { balance: wallet.balance, required: total, needed: total - wallet.balance },
        statusCode: 400,
      });
    }

    const now = new Date().toISOString();
    const transaction = {
      id: generateId('tx'),
      reference: generateId('ZP'),
      userId: req.userId,
      service,
      serviceName: SERVICE_NAMES[service] || service,
      amount: total,
      fee: 0,
      total,
      currency: 'NGN',
      paymentMethod: 'wallet',
      status: 'pending',
      providerReference: null,
      customerIdentifier: null,
      variationCode: variationCode,
      vendorRequestId: null,
      purchasedCode: null,
      metadata: metadata || null,
      createdAt: now,
      updatedAt: now,
    };
    db.transactions.unshift(transaction);

    if (idempotencyKey) {
      db.idempotency[`${req.userId}:${idempotencyKey}`] = transaction;
    }

    if (!isConfigured()) {
      wallet.balance -= total;
      transaction.status = 'successful';
      transaction.providerReference = generateId('PRV');
      transaction.updatedAt = new Date().toISOString();
      notify(req.userId, 'registration', 'Registration paid', `Payment for your ${SERVICE_NAMES[service]} registration was successful.`);
      save();
      return res.json({
        transaction,
        application: {
          id: generateId('app'),
          reference: transaction.reference,
          service,
          paymentStatus: transaction.status,
          registrationStatus: 'registered',
          fee: 0,
          metadata: payload || null,
          createdAt: now,
          updatedAt: transaction.updatedAt,
        },
      });
    }

    const requestId = makeRequestId();
    transaction.vendorRequestId = requestId;
    const payPayload = {
      request_id: requestId,
      serviceID,
      variation_code: variationCode,
      amount: total,
      phone: req.body.phone || user.phone || '',
      quantity: 1,
    };
    if (service === 'JAMB' && payload && payload.profileId) {
      payPayload.billersCode = String(payload.profileId);
    }

    try {
      const result = await vtpassPay(payPayload);
      const outcome = classifyVtpass(result);
      if (outcome === 'delivered') {
        applyDelivered(transaction, result);
      } else if (outcome === 'pending') {
        transaction.status = 'pending';
        transaction.updatedAt = new Date().toISOString();
        save();
        scheduleRequery(transaction.id, 0);
      } else {
        applyFailed(transaction);
      }
    } catch (err) {
      handleVendorError(transaction, err);
    }

    res.json({
      transaction,
      application: {
        id: generateId('app'),
        reference: transaction.reference,
        service,
        paymentStatus: transaction.status,
        registrationStatus: transaction.status === 'successful' ? 'registered' : transaction.status === 'failed' ? 'failed' : 'payment_pending',
        fee: 0,
        metadata: payload || null,
        createdAt: now,
        updatedAt: transaction.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;