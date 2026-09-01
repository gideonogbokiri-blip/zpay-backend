require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { load, save, db } = require('./store');
const { errorHandler } = require('./middleware');

const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const serviceRoutes = require('./routes/services');
const transactionRoutes = require('./routes/transactions');
const notificationRoutes = require('./routes/notifications');
const kycRoutes = require('./routes/kyc');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const adminPage = require('./api/admin-page');

function createApp() {
  const app = express();
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['https://zpay-seven.vercel.app', 'https://zpay-frontend-nine.vercel.app', 'https://zpay.vercel.app', 'https://zpay-frontend.vercel.app', 'http://localhost:8081', 'http://localhost:19006'];
  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  };
  app.use(cors(corsOptions));
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', storage: process.env.DATABASE_URL ? 'postgres' : 'json', users: Object.keys(db.users).length, timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/kyc', kycRoutes);
  app.use('/api/chat', chatRoutes);
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

