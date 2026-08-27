const express = require('express');
const router = express.Router();
const { authMiddleware, apiError } = require('../middleware');
const {
  db, save, generateId, SERVICE_NAMES, PROVIDERS,
} = require('../store');

function providerFee(providerId) {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  return provider ? provider.fee : 0;
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
  res.json(tx);
});

router.post('/pay', authMiddleware, (req, res) => {
  const user = db.users[req.userId];
  if (!user) {
    throw apiError('UNAUTHENTICATED', 'Your session has expired. Please log in again.', 'authentication', { statusCode: 401 });
  }
  if (!user.pinSet || !/^\d{4}$/.test(req.body.pin)) {
    throw apiError('PIN_INVALID', 'Enter your 4-digit transaction PIN.', 'validation', { statusCode: 400 });
  }

  const { service, providerId, customerIdentifier, amount, pin, idempotencyKey, metadata } = req.body;

  if (idempotencyKey) {
    const key = `${req.userId}:${idempotencyKey}`;
    if (db.idempotency[key]) {
      return res.json(db.idempotency[key]);
    }
  }

  const fee = providerFee(providerId);
  const total = amount + fee;
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
    amount,
    fee,
    total,
    currency: 'NGN',
    paymentMethod: 'wallet',
    status: 'pending',
    providerReference: null,
    customerIdentifier: customerIdentifier || null,
    metadata: metadata || null,
    createdAt: now,
    updatedAt: now,
  };
  db.transactions.unshift(transaction);

  if (idempotencyKey) {
    db.idempotency[`${req.userId}:${idempotencyKey}`] = transaction;
  }

  const providerFailed = metadata && metadata.simulateProviderFailure === true;
  if (providerFailed) {
    transaction.status = 'failed';
    transaction.updatedAt = new Date().toISOString();
    if (!db.notifications[req.userId]) db.notifications[req.userId] = [];
    db.notifications[req.userId].unshift({
      id: generateId('ntf'),
      type: 'payment',
      title: 'Payment failed',
      message: `Your ${SERVICE_NAMES[service]} payment could not be completed. No funds were charged.`,
      readAt: null,
      createdAt: new Date().toISOString(),
    });
    save();
    return res.json(transaction);
  }

  wallet.balance -= total;
  transaction.status = 'successful';
  transaction.providerReference = generateId('PRV');
  transaction.updatedAt = new Date().toISOString();

  if (!db.notifications[req.userId]) db.notifications[req.userId] = [];
  db.notifications[req.userId].unshift({
    id: generateId('ntf'),
    type: 'payment',
    title: 'Payment successful',
    message: `Your ${SERVICE_NAMES[service]} payment of NGN ${total} was successful.`,
    readAt: null,
    createdAt: new Date().toISOString(),
  });

  save();
  res.json(transaction);
});

router.post('/register', authMiddleware, (req, res) => {
  const user = db.users[req.userId];
  if (!user) {
    throw apiError('UNAUTHENTICATED', 'Your session has expired. Please log in again.', 'authentication', { statusCode: 401 });
  }
  if (!user.pinSet || !/^\d{4}$/.test(req.body.pin)) {
    throw apiError('PIN_INVALID', 'Enter your 4-digit transaction PIN.', 'validation', { statusCode: 400 });
  }

  const { service, pin, idempotencyKey, amount, payload, metadata } = req.body;

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
          registrationStatus: existing.status === 'successful' ? 'registered' : 'payment_pending',
          fee: 0,
          metadata: payload,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        },
      });
    }
  }

  const total = amount || 0;
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
    metadata: metadata || null,
    createdAt: now,
    updatedAt: now,
  };
  db.transactions.unshift(transaction);

  if (idempotencyKey) {
    db.idempotency[`${req.userId}:${idempotencyKey}`] = transaction;
  }

  wallet.balance -= total;
  transaction.status = 'successful';
  transaction.providerReference = generateId('PRV');
  transaction.updatedAt = new Date().toISOString();

  if (!db.notifications[req.userId]) db.notifications[req.userId] = [];
  db.notifications[req.userId].unshift({
    id: generateId('ntf'),
    type: 'registration',
    title: 'Registration paid',
    message: `Payment for your ${SERVICE_NAMES[service]} registration was successful.`,
    readAt: null,
    createdAt: new Date().toISOString(),
  });

  const application = {
    id: generateId('app'),
    reference: transaction.reference,
    service,
    paymentStatus: transaction.status,
    registrationStatus: 'registered',
    fee: 0,
    metadata: payload || null,
    createdAt: now,
    updatedAt: transaction.updatedAt,
  };

  save();
  res.json({ transaction, application });
});

module.exports = router;