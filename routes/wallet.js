const express = require('express');
const router = express.Router();
const { authMiddleware, apiError } = require('../middleware');
const { db, save, generateId, seedNotifications } = require('../store');
const { initializeTransaction, verifyTransaction, isConfigured } = require('../lib/paystack');

router.get('/', authMiddleware, (req, res) => {
  const wallet = db.wallets[req.userId] || { balance: 0, currency: 'NGN' };
  res.json(wallet);
});

function makeReference() {
  return `ZP${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

function creditWalletFromPaystack(userId, amount, reference) {
  if (!db.wallets[userId]) {
    db.wallets[userId] = { balance: 0, currency: 'NGN' };
  }
  db.wallets[userId].balance += amount;

  const transaction = {
    id: generateId('tx'),
    reference: generateId('ZP'),
    userId,
    service: 'WALLET',
    serviceName: 'Wallet Funding',
    amount,
    fee: 0,
    total: amount,
    currency: 'NGN',
    paymentMethod: 'card',
    status: 'successful',
    providerReference: reference,
    customerIdentifier: null,
    metadata: { fundingChannel: 'paystack', paystackReference: reference },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.transactions.unshift(transaction);

  if (!db.notifications[userId]) db.notifications[userId] = [];
  db.notifications[userId].unshift({
    id: generateId('ntf'),
    type: 'funding',
    title: 'Wallet funded',
    message: `Your wallet was funded with NGN ${amount}.`,
    readAt: null,
    createdAt: new Date().toISOString(),
  });

  return transaction;
}

router.post('/fund', authMiddleware, async (req, res, next) => {
  try {
    const user = db.users[req.userId];
    if (!user) {
      throw apiError('ACCOUNT_NOT_FOUND', 'Account not found. Please log in again.', 'authentication', { statusCode: 401 });
    }
    const { amount, method } = req.body;
    if (!amount || amount <= 0) {
      throw apiError('INVALID_AMOUNT', 'Enter an amount greater than zero.', 'validation', { statusCode: 400 });
    }
    if (!isConfigured()) {
      throw apiError(
        'PAYSTACK_NOT_CONFIGURED',
        'Paystack is not configured yet. Funding will be enabled once the payment gateway is set up.',
        'unexpected',
        { statusCode: 503 }
      );
    }

    const reference = makeReference();
    db.fundPayments[reference] = {
      userId: req.userId,
      amount,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    save();

    const channel = String(method || '').toLowerCase().includes('bank') ? 'bank_transfer' : 'card';

    let initialized;
    try {
      initialized = await initializeTransaction({
        email: user.email,
        amount,
        reference,
        channel,
        metadata: { userId: req.userId, amount },
      });
    } catch (err) {
      delete db.fundPayments[reference];
      save();
      throw err;
    }

    res.json({ reference: initialized.reference, authorizationUrl: initialized.authorizationUrl });
  } catch (err) {
    next(err);
  }
});

router.post('/fund/verify', authMiddleware, async (req, res, next) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      throw apiError('VALIDATION_ERROR', 'Payment reference is required.', 'validation', { statusCode: 400 });
    }
    const pending = db.fundPayments[reference];
    if (!pending || pending.userId !== req.userId) {
      throw apiError('PAYMENT_NOT_FOUND', 'Payment record not found. Please try funding again.', 'validation', { statusCode: 404 });
    }
    if (pending.status === 'successful') {
      const existing = db.transactions.find(t => t.userId === req.userId && t.providerReference === reference);
      return res.json({
        wallet: db.wallets[req.userId] || { balance: 0, currency: 'NGN' },
        transaction: existing || null,
      });
    }

    const verified = await verifyTransaction(reference);
    if (verified.status === 'success' && verified.amountKobo !== null) {
      const verifiedAmount = verified.amountKobo / 100;
      if (verifiedAmount === pending.amount) {
        const transaction = creditWalletFromPaystack(req.userId, pending.amount, reference);
        pending.status = 'successful';
        seedNotifications(req.userId);
        save();
        return res.json({ wallet: db.wallets[req.userId], transaction });
      }
      pending.status = 'failed';
      save();
      throw apiError('AMOUNT_MISMATCH', 'The payment amount does not match what was requested.', 'unexpected', { statusCode: 400 });
    }
    throw apiError('PAYMENT_PENDING', verified.gatewayResponse || 'Payment has not completed yet. Try again.', 'unexpected', { retryable: true, statusCode: 400 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;