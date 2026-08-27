const express = require('express');
const router = express.Router();
const { authMiddleware, apiError } = require('../middleware');
const { db, save } = require('../store');

router.get('/', authMiddleware, (req, res) => {
  const list = db.notifications[req.userId] || [];
  res.json(list);
});

router.put('/:id/read', authMiddleware, (req, res) => {
  const list = db.notifications[req.userId] || [];
  const notification = list.find((n) => n.id === req.params.id);
  if (!notification) {
    throw apiError('NOT_FOUND', 'Notification not found.', 'validation', { statusCode: 404 });
  }
  notification.readAt = notification.readAt || new Date().toISOString();
  save();
  res.json(notification);
});

router.put('/read-all', authMiddleware, (req, res) => {
  const list = db.notifications[req.userId] || [];
  const now = new Date().toISOString();
  for (const n of list) {
    n.readAt = n.readAt || now;
  }
  save();
  res.json({ success: true });
});

module.exports = router;