const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware');
const { db } = require('../store');

router.get('/', authMiddleware, (req, res) => {
  const user = db.users[req.userId];
  if (!user) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Session expired.' });
  }
  const completed = user.verificationTier !== 'unverified';
  res.json({
    tier: user.verificationTier,
    status: completed ? 'completed' : 'not_started',
    verifiedAt: completed ? new Date().toISOString() : null,
  });
});

module.exports = router;