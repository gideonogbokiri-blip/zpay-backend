require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { load, save } = require('./store');
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

  load();

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
  const app = createApp();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`ZPAY Backend running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    save();
    process.exit(0);
  });
}