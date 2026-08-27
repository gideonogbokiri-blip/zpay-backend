const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'zpay-dev-secret-2024';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 'UNAUTHENTICATED',
      message: 'Your session has expired. Please log in again.',
      retryable: false,
    });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    req.token = token;
    next();
  } catch {
    return res.status(401).json({
      code: 'UNAUTHENTICATED',
      message: 'Your session has expired. Please log in again.',
      retryable: false,
    });
  }
}

function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (err.code && err.kind) {
    return res.status(err.statusCode || 400).json({
      code: err.code,
      message: err.message,
      retryable: err.retryable || false,
      data: err.data,
    });
  }
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
    retryable: false,
  });
}

function apiError(code, message, kind, opts = {}) {
  const err = new Error(message);
  err.code = code;
  err.kind = kind;
  err.retryable = opts.retryable || false;
  err.data = opts.data;
  err.statusCode = opts.statusCode || 400;
  return err;
}

module.exports = { signToken, verifyToken, authMiddleware, errorHandler, apiError };