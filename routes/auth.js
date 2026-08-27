const express = require('express');
const router = express.Router();
const { signToken, authMiddleware, apiError } = require('../middleware');
const { db, save, generateUserReference, seedNotifications } = require('../store');

router.post('/signup', (req, res) => {
  const { fullName, phone, email, password } = req.body;
  if (!fullName || !phone || !email || !password) {
    throw apiError('VALIDATION_ERROR', 'All fields are required.', 'validation', { statusCode: 400 });
  }
  const existing = Object.values(db.users).find(
    (u) => u.email.toLowerCase() === email.toLowerCase() || u.phone === phone
  );
  if (existing) {
    throw apiError('ACCOUNT_EXISTS', 'An account already exists for this email or phone number.', 'validation', { statusCode: 409 });
  }
  const userId = generateUserReference();
  const verificationId = generateUserReference();
  const code = String(Math.floor(100000 + Math.random() * 900000));

  db.users[userId] = {
    id: userId,
    fullName,
    phone,
    email,
    password,
    pinSet: false,
    verificationTier: 'unverified',
  };
  db.verifications[verificationId] = { phone, email, code, userId };

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[mock-auth] OTP for ${phone}: ${code}`);
  }

  save();
  res.json({ verificationId });
});

router.post('/verify-otp', (req, res) => {
  const { verificationId, code } = req.body;
  const pending = db.verifications[verificationId];
  if (!pending) {
    throw apiError('OTP_EXPIRED', 'This verification code has expired. Request a new one.', 'validation', { statusCode: 400 });
  }
  if (code !== pending.code) {
    throw apiError('OTP_INVALID', 'The code you entered is incorrect. Try again.', 'validation', { retryable: true, statusCode: 400 });
  }
  const user = db.users[pending.userId];
  delete db.verifications[verificationId];
  if (!user) {
    throw apiError('ACCOUNT_NOT_FOUND', 'Account not found. Please sign up again.', 'validation', { statusCode: 404 });
  }

  if (!db.wallets[user.id]) {
    db.wallets[user.id] = { balance: 25000, currency: 'NGN' };
    seedNotifications(user.id);
  }

  const token = signToken({ userId: user.id });
  save();
  res.json({ token, user: sanitizeUser(user) });
});

router.post('/resend-otp', (req, res) => {
  const { verificationId } = req.body;
  const pending = db.verifications[verificationId];
  if (!pending) {
    throw apiError('OTP_EXPIRED', 'This verification session has expired. Please sign up again.', 'validation', { statusCode: 400 });
  }
  pending.code = String(Math.floor(100000 + Math.random() * 900000));
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[mock-auth] New OTP for ${pending.phone}: ${pending.code}`);
  }
  save();
  res.json({ verificationId });
});

router.post('/login', (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    throw apiError('VALIDATION_ERROR', 'All fields are required.', 'validation', { statusCode: 400 });
  }
  const id = identifier.trim().toLowerCase();
  const record = Object.values(db.users).find(
    (u) => u.email.toLowerCase() === id || u.phone === id
  );
  if (!record || record.password !== password) {
    throw apiError('INVALID_CREDENTIALS', 'Incorrect phone/email or password.', 'authentication', { retryable: true, statusCode: 401 });
  }

  if (!db.wallets[record.id]) {
    db.wallets[record.id] = { balance: 25000, currency: 'NGN' };
    seedNotifications(record.id);
  }

  const token = signToken({ userId: record.id });
  save();
  res.json({ token, user: sanitizeUser(record) });
});

router.post('/create-pin', authMiddleware, (req, res) => {
  const user = requireUser(req);
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    throw apiError('PIN_INVALID', 'Enter a valid 4-digit PIN.', 'validation', { statusCode: 400 });
  }
  db.users[user.id].pinSet = true;
  save();
  res.json({ user: sanitizeUser(db.users[user.id]) });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = requireUser(req);
  res.json(sanitizeUser(user));
});

function sanitizeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

function requireUser(req) {
  const user = db.users[req.userId];
  if (!user) {
    throw apiError('UNAUTHENTICATED', 'Your session has expired. Please log in again.', 'authentication', { statusCode: 401 });
  }
  return user;
}

module.exports = router;