const express = require('express');
const router = express.Router();
const { signToken, authMiddleware, apiError } = require('../middleware');
const { db, save, generateUserReference, seedNotifications } = require('../store');
const { generateCode, saveCode } = require('../lib/otp');
const { sendOtp } = require('../lib/sms');

router.post('/request-otp', async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      throw apiError('VALIDATION_ERROR', 'Phone number is required.', 'validation', { statusCode: 400 });
    }
    const record = Object.values(db.users).find((u) => u.phone === phone);
    if (!record) {
      throw apiError('ACCOUNT_NOT_FOUND', 'No account found with this phone number. Please sign up first.', 'validation', { statusCode: 404 });
    }
    const verificationId = generateUserReference();
    const code = generateCode();

    db.verifications[verificationId] = { phone, email: record.email, code, userId: record.id };
    saveCode(verificationId, phone, code);

    const smsResult = await sendOtp(phone, code);

    save();
    res.json({ verificationId, ...(smsResult.delivered ? {} : { otp: code }) });
  } catch (err) {
    next(err);
  }
});

router.post('/signup', async (req, res, next) => {
  try {
    const { fullName, phone, email, password, referralCode } = req.body;
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
    const code = generateCode();

    let referredBy = null;
    if (referralCode && String(referralCode).trim()) {
      const referrer = Object.values(db.users).find(
        (u) => u.referralCode && u.referralCode.toUpperCase() === String(referralCode).trim().toUpperCase()
      );
      if (referrer) referredBy = referrer.id;
    }

    db.users[userId] = {
      id: userId,
      fullName,
      phone,
      email,
      password,
      pinSet: false,
      verificationTier: 'unverified',
      referralCode: generateUserReference(),
      referredBy,
    };
    db.verifications[verificationId] = { phone, email, code, userId };
    saveCode(verificationId, phone, code);

    const smsResult = await sendOtp(phone, code);

    save();
    res.json({ verificationId, ...(smsResult.delivered ? {} : { otp: code }) });
  } catch (err) {
    next(err);
  }
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

router.post('/resend-otp', async (req, res, next) => {
  try {
    const { verificationId } = req.body;
    const pending = db.verifications[verificationId];
    if (!pending) {
      throw apiError('OTP_EXPIRED', 'This verification session has expired. Please sign up again.', 'validation', { statusCode: 400 });
    }
    pending.code = generateCode();
    saveCode(verificationId, pending.phone, pending.code);
    const smsResult = await sendOtp(pending.phone, pending.code);
    save();
    res.json({ verificationId, ...(smsResult.delivered ? {} : { otp: pending.code }) });
  } catch (err) {
    next(err);
  }
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

router.post('/avatar', authMiddleware, (req, res) => {
  const user = requireUser(req);
  const { avatarUrl } = req.body;
  if (!avatarUrl || typeof avatarUrl !== 'string') {
    throw apiError('VALIDATION_ERROR', 'Avatar URL is required.', 'validation', { statusCode: 400 });
  }
  db.users[user.id].avatarUrl = avatarUrl;
  save();
  res.json({ user: sanitizeUser(db.users[user.id]) });
});

function sanitizeUser(user) {
  if (user && !user.referralCode) user.referralCode = generateUserReference();
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