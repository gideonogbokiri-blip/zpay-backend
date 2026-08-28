const otpStore = {};

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function saveCode(verificationId, phone, code, ttlMs = 10 * 60 * 1000) {
  const record = { code, phone, expiresAt: Date.now() + ttlMs };
  otpStore[verificationId] = record;
  setTimeout(() => {
    delete otpStore[verificationId];
  }, ttlMs).unref?.();
}

function readCode(verificationId) {
  const record = otpStore[verificationId];
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    delete otpStore[verificationId];
    return null;
  }
  return record;
}

function consumeCode(verificationId) {
  const record = otpStore[verificationId];
  delete otpStore[verificationId];
  return record;
}

module.exports = { generateCode, saveCode, readCode, consumeCode };
