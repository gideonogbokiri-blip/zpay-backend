const express = require('express');
const { db, save, generateId, seedNotifications } = require('../store');
const { verifyWebhook } = require('../lib/paystack');

const router = express.Router();

function creditWalletFromPaystack(userId, amount, reference, channel = 'card') {
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
    paymentMethod: channel === 'bank_transfer' ? 'bank_transfer' : 'card',
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

router.post('/paystack', (req, res) => {
  const rawBody = req.rawBody || '';
  const signature = req.headers['x-paystack-signature'];
  if (!verifyWebhook(rawBody, signature)) {
    return res.status(401).json({ status: 'forbidden' });
  }

  const event = req.body;
  if (!event || !event.event) {
    return res.status(400).json({ status: 'bad request' });
  }

  if (event.event === 'charge.success') {
    const data = event.data || {};
    const reference = data.reference;
    const amountNaira = typeof data.amount === 'number' ? data.amount / 100 : null;
    const channel = data.channel || 'card';
    const pending = reference ? db.fundPayments[reference] : null;

    if (pending && pending.status === 'pending' && amountNaira !== null) {
      if (amountNaira === pending.amount) {
        creditWalletFromPaystack(pending.userId, pending.amount, reference, channel);
        pending.status = 'successful';
        seedNotifications(pending.userId);
        save();
      } else {
        pending.status = 'failed';
        save();
      }
    } else if (pending && pending.status === 'successful') {
      // Idempotent — already credited.
    }
  }

  res.json({ status: 'received' });
});

module.exports = router;