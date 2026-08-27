const express = require('express');
const router = express.Router();
const { authMiddleware, apiError } = require('../middleware');
const { db, save, generateId, seedNotifications } = require('../store');

router.get('/', authMiddleware, (req, res) => {
  const wallet = db.wallets[req.userId] || { balance: 0, currency: 'NGN' };
  res.json(wallet);
});

router.post('/fund', authMiddleware, (req, res) => {
  const { amount, method, idempotencyKey } = req.body;
  if (!amount || amount <= 0) {
    throw apiError('INVALID_AMOUNT', 'Enter an amount greater than zero.', 'validation', { statusCode: 400 });
  }
  if (!db.wallets[req.userId]) {
    db.wallets[req.userId] = { balance: 0, currency: 'NGN' };
  }
  db.wallets[req.userId].balance += amount;

  const transaction = {
    id: generateId('tx'),
    reference: generateId('ZP'),
    userId: req.userId,
    service: 'WALLET',
    serviceName: 'Wallet Funding',
    amount,
    fee: 0,
    total: amount,
    currency: 'NGN',
    paymentMethod: 'wallet',
    status: 'successful',
    providerReference: generateId('GTW'),
    customerIdentifier: null,
    metadata: { fundingMethod: method || 'card' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.transactions.unshift(transaction);

  if (!db.notifications[req.userId]) db.notifications[req.userId] = [];
  db.notifications[req.userId].unshift({
    id: generateId('ntf'),
    type: 'funding',
    title: 'Wallet funded',
    message: `Your wallet was funded with NGN ${amount}.`,
    readAt: null,
    createdAt: new Date().toISOString(),
  });

  save();
  res.json({ wallet: { ...db.wallets[req.userId] }, transaction });
});

module.exports = router;