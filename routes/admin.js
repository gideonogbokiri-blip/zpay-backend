const express = require('express');
const router = express.Router();
const { signToken, authMiddleware, apiError } = require('../middleware');
const { db, save, generateId } = require('../store');

const ADMIN_EMAIL = 'admin@zpay.com';
const ADMIN_PASSWORD = 'admin123';
const ADMIN_USER = {
  id: 'admin-001',
  fullName: 'Super Admin',
  email: ADMIN_EMAIL,
  role: 'superadmin',
};

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = signToken({ userId: ADMIN_USER.id, role: 'superadmin' });
    return res.json({ token, user: ADMIN_USER });
  }
  throw apiError('INVALID_CREDENTIALS', 'Incorrect admin credentials.', 'authentication', { retryable: true, statusCode: 401 });
});

router.get('/stats', authMiddleware, (req, res) => {
  const users = Object.values(db.users);
  const wallets = Object.values(db.wallets);
  const txs = db.transactions;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayTxs = txs.filter(t => t.createdAt >= todayStart);
  const successfulTxs = txs.filter(t => t.status === 'successful');
  const totalVolume = successfulTxs.reduce((sum, t) => sum + t.amount, 0);
  const totalFees = successfulTxs.reduce((sum, t) => sum + t.fee, 0);
  const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);

  const serviceBreakdown = {};
  successfulTxs.forEach(t => {
    if (!serviceBreakdown[t.service]) serviceBreakdown[t.service] = { count: 0, volume: 0 };
    serviceBreakdown[t.service].count++;
    serviceBreakdown[t.service].volume += t.amount;
  });

  res.json({
    totalUsers: users.length,
    verifiedUsers: users.filter(u => u.verificationTier !== 'unverified').length,
    totalTransactions: txs.length,
    successfulTransactions: successfulTxs.length,
    failedTransactions: txs.filter(t => t.status === 'failed').length,
    pendingTransactions: txs.filter(t => t.status === 'pending').length,
    todayTransactions: todayTxs.length,
    totalVolume,
    totalFees,
    totalBalanceHeld: totalBalance,
    serviceBreakdown,
  });
});

router.get('/users', authMiddleware, (req, res) => {
  const { page = 1, search } = req.query;
  const pageNum = parseInt(page) || 1;
  const pageSize = 20;
  let users = Object.values(db.users).map(u => {
    const { password, ...safe } = u;
    const wallet = db.wallets[u.id] || { balance: 0, currency: 'NGN' };
    const txCount = db.transactions.filter(t => t.userId === u.id).length;
    return { ...safe, walletBalance: wallet.balance, transactionCount: txCount };
  });
  if (search) {
    const q = search.toLowerCase();
    users = users.filter(u =>
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone.includes(q)
    );
  }
  users.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const start = (pageNum - 1) * pageSize;
  const items = users.slice(start, start + pageSize);
  res.json({ items, page: pageNum, hasMore: start + pageSize < users.length, total: users.length });
});

router.get('/users/:id', authMiddleware, (req, res) => {
  const user = db.users[req.params.id];
  if (!user) throw apiError('NOT_FOUND', 'User not found.', 'validation', { statusCode: 404 });
  const { password, ...safe } = user;
  const wallet = db.wallets[user.id] || { balance: 0, currency: 'NGN' };
  const txs = db.transactions.filter(t => t.userId === user.id).slice(0, 50);
  const notifications = (db.notifications[user.id] || []).slice(0, 20);
  res.json({ user: safe, wallet, transactions: txs, notifications });
});

router.get('/transactions', authMiddleware, (req, res) => {
  const { page = 1, service, status } = req.query;
  const pageNum = parseInt(page) || 1;
  const pageSize = 30;
  let txs = [...db.transactions];
  if (service && service !== 'ALL') txs = txs.filter(t => t.service === service);
  if (status && status !== 'ALL') txs = txs.filter(t => t.status === status);
  txs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const start = (pageNum - 1) * pageSize;
  const items = txs.slice(start, start + pageSize);
  res.json({ items, page: pageNum, hasMore: start + pageSize < txs.length, total: txs.length });
});

router.get('/wallets', authMiddleware, (req, res) => {
  const wallets = Object.entries(db.wallets).map(([userId, w]) => {
    const user = db.users[userId];
    return {
      userId,
      userName: user?.fullName || 'Unknown',
      email: user?.email || '',
      balance: w.balance,
      currency: w.currency,
    };
  });
  wallets.sort((a, b) => b.balance - a.balance);
  res.json(wallets);
});

module.exports = router;