const express = require('express');
const router = express.Router();
const { authMiddleware, apiError } = require('../middleware');
const { db, save, generateId } = require('../store');

function ensureConversation(userId) {
  if (!db.chats[userId]) {
    const user = db.users[userId] || {};
    db.chats[userId] = {
      id: generateId('chat'),
      userId,
      userName: user.fullName || 'User',
      email: user.email || '',
      messages: [],
      unreadAdmin: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  return db.chats[userId];
}

const FAQ_RULES = [
  {
    keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
    reply: 'Hello! 👋 Welcome to ZPAY. I\'m your virtual assistant. I can help you with billing services, funding your wallet, airtime, data, cable TV, electricity and school payments. What can I do for you today?',
  },
  {
    keywords: ['fund', 'deposit', 'top up', 'topup', 'add money', 'wallet'],
    reply: 'To fund your wallet: go to the Home screen and tap the wallet card or "Fund Wallet". You can add money using a bank card or bank transfer. Funds are credited instantly. Is there anything else I can help with?',
  },
  {
    keywords: ['airtime', 'recharge', 'credit', 'mtn', 'airtel', 'glo', '9mobile', '9 mobile'],
    reply: 'You can buy airtime easily: Home → Services → Airtime. Select your network (MTN, Airtel, Glo, or 9mobile), enter the phone number, amount, and confirm. Your airtime is delivered instantly! 📱',
  },
  {
    keywords: ['data', 'bundle', 'internet'],
    reply: 'To buy data bundles: Home → Services → Data. Choose your network and pick a bundle plan (daily, weekly, or monthly). Enter the phone number and confirm. Data is activated within seconds. 🚀',
  },
  {
    keywords: ['electricity', 'prepaid', 'postpaid', 'power', 'light', 'ekedc', 'ikeja', 'abuja', 'ph', 'kano'],
    reply: 'For electricity tokens: Home → Services → Electricity. Select your distribution company (like EKEDC, Ikeja Electric, AEDC, PHEDC), enter your meter number, amount, and pay. Your token is generated instantly. 💡',
  },
  {
    keywords: ['tv', 'dstv', 'gotv', 'startimes', 'cable'],
    reply: 'To pay cable TV: Home → Services → TV. Choose DStv, GOtv, or StarTimes, pick a package, enter your smart card number, and confirm. Your subscription is renewed right away. 📺',
  },
  {
    keywords: ['waec', 'jamb', 'neco', 'exam', 'registration', 'school', 'utme', 'pin'],
    reply: 'ZPAY supports school payment registrations! Go to Home → Services and choose WAEC, JAMB, or NECO. Enter the required details and amount to complete your registration. 🎓',
  },
  {
    keywords: ['pin', 'password', 'forgot', 'reset', 'change'],
    reply: 'You can manage your 4-digit transaction PIN from Profile → Security & PIN. There you can create, change, or reset your PIN. For a password reset, use the "Forgot password" option on the login screen. 🔒',
  },
  {
    keywords: ['transaction', 'history', 'receipt', 'records'],
    reply: 'Your transaction history is in the History tab. Tap on any transaction to view its full details and download the receipt. ✅',
  },
  {
    keywords: ['kyc', 'verify', 'verification', 'identity', 'tier'],
    reply: 'To secure your account and unlock higher limits, complete your KYC verification from Profile → Verify Identity. It takes just a few minutes. 🛡️',
  },
  {
    keywords: ['withdraw', 'withdrawal', 'bank transfer', 'send money', 'cas', 'cash'],
    reply: 'Withdrawals and bank transfers are currently being rolled out. You can fund your wallet and pay bills now, and transfer features will be available soon. For urgent help, our admin can assist you. 💰',
  },
  {
    keywords: ['fee', 'charge', 'cost', 'price', 'how much'],
    reply: 'Transaction fees vary by service and are clearly shown before you confirm any payment. The fee is displayed on the review screen so there are no surprises. 💳',
  },
  {
    keywords: ['status', 'failed', 'pending', 'issue', 'problem', 'error', 'not work', 'refund'],
    reply: 'Sorry to hear you\'re having trouble. I\'ve flagged this to our support team — an admin will respond here shortly. Meanwhile, you can also check the transaction status in History. Your message has been sent to the admin. ⏳',
  },
  {
    keywords: ['human', 'agent', 'admin', 'support', 'representative', 'talk', 'person', 'someone'],
    reply: 'Of course! I\'ve notified a human agent. Our admin will join this chat shortly to assist you personally. In the meantime, is there anything I can answer for you? 🎧',
  },
  {
    keywords: ['thank', 'thanks', 'appreciate'],
    reply: 'You\'re very welcome! 😊 It\'s my pleasure to help. If you need anything else, just type here. Is there anything else I can do for you?',
  },
  {
    keywords: ['bye', 'goodbye', 'see you'],
    reply: 'Goodbye! 👋 Thanks for using ZPAY. Send a message anytime if you need help. Have a great day!',
  },
];

function autoReply(text) {
  const lower = text.toLowerCase();
  for (const rule of FAQ_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      return rule.reply;
    }
  }
  return 'Thanks for your message! I\'m not 100% sure about that one, so I\'ve sent it to our admin team who will help you shortly. You can also try asking about funding, airtime, data, electricity, cable TV, WAEC/JAMB/NECO, KYC, or transactions. 💬';
}

// User: mark own conversation read (clear unread indication handled client side)

// User: get own chat
router.get('/', authMiddleware, (req, res) => {
  const chat = db.chats[req.userId] || { messages: [] };
  res.json({ userId: req.userId, messages: chat.messages });
});

// User: send a message (gets auto bot reply)
router.post('/messages', authMiddleware, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    throw apiError('VALIDATION_ERROR', 'Message text is required.', 'validation');
  }
  const clean = text.trim();
  const now = new Date().toISOString();
  const chat = ensureConversation(req.userId);

  const userMsg = { id: generateId('m'), role: 'user', text: clean, createdAt: now };
  chat.messages.push(userMsg);
  chat.unreadAdmin = (chat.unreadAdmin || 0) + 1;
  chat.updatedAt = now;

  const botMsg = { id: generateId('m'), role: 'bot', text: autoReply(clean), createdAt: new Date().toISOString() };
  chat.messages.push(botMsg);

  save();
  res.json({ messages: chat.messages, reply: botMsg });
});

// Admin: list conversations
router.get('/admin/conversations', authMiddleware, (req, res) => {
  const convos = Object.values(db.chats)
    .map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: c.userName,
      email: c.email,
      lastMessage: c.messages[c.messages.length - 1]?.text || '',
      lastRole: c.messages[c.messages.length - 1]?.role || '',
      lastAt: c.updatedAt || c.createdAt,
      unreadAdmin: c.unreadAdmin || 0,
    }))
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  res.json({ items: convos });
});

// Admin: get a conversation by user id
router.get('/admin/conversations/:userId', authMiddleware, (req, res) => {
  const chat = db.chats[req.params.userId];
  if (!chat) throw apiError('NOT_FOUND', 'Conversation not found.', 'validation', { statusCode: 404 });
  res.json({ ...chat });
});

// Admin: reply to a conversation
router.post('/admin/conversations/:userId/reply', authMiddleware, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    throw apiError('VALIDATION_ERROR', 'Reply text is required.', 'validation');
  }
  const chat = db.chats[req.params.userId];
  if (!chat) throw apiError('NOT_FOUND', 'Conversation not found.', 'validation', { statusCode: 404 });
  const clean = text.trim();
  const now = new Date().toISOString();
  chat.messages.push({ id: generateId('m'), role: 'admin', text: clean, createdAt: now });
  chat.unreadAdmin = 0;
  chat.updatedAt = now;
  save();
  res.json({ messages: chat.messages });
});

module.exports = router;
