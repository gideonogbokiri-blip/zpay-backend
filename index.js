require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { load, save, db, ensureDemoUser } = require('./store');
const { errorHandler } = require('./middleware');

const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const serviceRoutes = require('./routes/services');
const transactionRoutes = require('./routes/transactions');
const notificationRoutes = require('./routes/notifications');
const kycRoutes = require('./routes/kyc');
const adminRoutes = require('./routes/admin');
const adminPage = require('./api/admin-page');

function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', storage: process.env.DATABASE_URL ? 'postgres' : 'json', users: Object.keys(db.users).length, timestamp: new Date().toISOString() });
  });

  app.post('/api/debug/reseed-demo', async (req, res) => {
    const seeded = ensureDemoUser();
    await save();
    res.json({ seeded, users: Object.keys(db.users).length, demoExists: !!Object.values(db.users).find(u => u.email === 'demo@zpay.com') });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/kyc', kycRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('/admin', adminPage);
  app.get('/admin/', adminPage);
  try {
    app.use('/admin', express.static(__dirname + '/admin'));
  } catch (_) {}

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

if (require.main === module) {
  (async () => {
    await load();
    const app = createApp();
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`ZPAY Backend running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`Storage: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'JSON file'}`);
    });
  })();
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await save();
    process.exit(0);
  });
}