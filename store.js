const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const DATABASE_URL = process.env.DATABASE_URL || '';

function generateId(prefix) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const time = Date.now().toString(36).toUpperCase();
  return `${prefix}-${random}${time}`;
}

function generateUserReference() {
  return `usr_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

const INITIAL_BALANCE = 25000;

const SERVICES = [
  { type: 'ELECTRICITY', name: 'Electricity', order: 1 },
  { type: 'AIRTIME', name: 'Airtime', order: 2 },
  { type: 'DATA', name: 'Data', order: 3 },
  { type: 'TV', name: 'TV', order: 4 },
  { type: 'WAEC', name: 'WAEC', order: 5 },
  { type: 'JAMB', name: 'JAMB', order: 6 },
  { type: 'NECO', name: 'NECO', order: 7 },
];

const SERVICE_NAMES = {
  ELECTRICITY: 'Electricity',
  AIRTIME: 'Airtime',
  DATA: 'Data',
  TV: 'TV',
  WAEC: 'WAEC',
  JAMB: 'JAMB',
  NECO: 'NECO',
};

const PROVIDERS = [
  { id: 'ekedc', service: 'ELECTRICITY', name: 'EKEDC', fee: 100 },
  { id: 'ikedc', service: 'ELECTRICITY', name: 'IKEDC', fee: 100 },
  { id: 'phedc', service: 'ELECTRICITY', name: 'PHEDC', fee: 100 },
  { id: 'aedc', service: 'ELECTRICITY', name: 'AEDC', fee: 100 },
  { id: 'mtn', service: 'AIRTIME', name: 'MTN', fee: 0 },
  { id: 'airtel', service: 'AIRTIME', name: 'Airtel', fee: 0 },
  { id: 'glo', service: 'AIRTIME', name: 'Glo', fee: 0 },
  { id: '9mobile', service: 'AIRTIME', name: '9mobile', fee: 0 },
  { id: 'mtn-data', service: 'DATA', name: 'MTN', fee: 0 },
  { id: 'airtel-data', service: 'DATA', name: 'Airtel', fee: 0 },
  { id: 'glo-data', service: 'DATA', name: 'Glo', fee: 0 },
  { id: '9mobile-data', service: 'DATA', name: '9mobile', fee: 0 },
  { id: 'dstv', service: 'TV', name: 'DSTV', fee: 200 },
  { id: 'gotv', service: 'TV', name: 'GOtv', fee: 150 },
  { id: 'startimes', service: 'TV', name: 'StarTimes', fee: 150 },
];

const DATA_BUNDLES = [
  { id: 'mtn-500mb', providerId: 'mtn-data', name: 'Daily 500MB', size: '500MB', price: 300, validity: '1 day' },
  { id: 'mtn-1gb', providerId: 'mtn-data', name: 'Weekly 1GB', size: '1GB', price: 500, validity: '7 days' },
  { id: 'mtn-2gb', providerId: 'mtn-data', name: 'Monthly 2GB', size: '2GB', price: 900, validity: '30 days' },
  { id: 'mtn-5gb', providerId: 'mtn-data', name: 'Monthly 5GB', size: '5GB', price: 2000, validity: '30 days' },
  { id: 'airtel-500mb', providerId: 'airtel-data', name: 'Daily 500MB', size: '500MB', price: 300, validity: '1 day' },
  { id: 'airtel-1gb', providerId: 'airtel-data', name: 'Weekly 1GB', size: '1GB', price: 500, validity: '7 days' },
  { id: 'airtel-2gb', providerId: 'airtel-data', name: 'Monthly 2GB', size: '2GB', price: 900, validity: '30 days' },
  { id: 'glo-500mb', providerId: 'glo-data', name: 'Daily 500MB', size: '500MB', price: 300, validity: '1 day' },
  { id: 'glo-1gb', providerId: 'glo-data', name: 'Weekly 1GB', size: '1GB', price: 500, validity: '7 days' },
  { id: 'glo-2gb', providerId: 'glo-data', name: 'Monthly 2GB', size: '2GB', price: 900, validity: '30 days' },
  { id: '9m-500mb', providerId: '9mobile-data', name: 'Daily 500MB', size: '500MB', price: 300, validity: '1 day' },
  { id: '9m-1gb', providerId: '9mobile-data', name: 'Weekly 1GB', size: '1GB', price: 500, validity: '7 days' },
  { id: '9m-2gb', providerId: '9mobile-data', name: 'Monthly 2GB', size: '2GB', price: 900, validity: '30 days' },
];

const TV_PACKAGES = [
  { id: 'dstv-padi', providerId: 'dstv', name: 'Padi', price: 2900, duration: '1 month' },
  { id: 'dstv-yanga', providerId: 'dstv', name: 'Yanga', price: 4500, duration: '1 month' },
  { id: 'dstv-confam', providerId: 'dstv', name: 'Confam', price: 6500, duration: '1 month' },
  { id: 'dstv-compact', providerId: 'dstv', name: 'Compact', price: 9600, duration: '1 month' },
  { id: 'gotv-smallie', providerId: 'gotv', name: 'Smallie', price: 1500, duration: '1 month' },
  { id: 'gotv-jinja', providerId: 'gotv', name: 'Jinja', price: 2500, duration: '1 month' },
  { id: 'gotv-max', providerId: 'gotv', name: 'Max', price: 4000, duration: '1 month' },
  { id: 'startimes-nova', providerId: 'startimes', name: 'Nova', price: 1200, duration: '1 month' },
  { id: 'startimes-basic', providerId: 'startimes', name: 'Basic', price: 1900, duration: '1 month' },
];

const ELEC_QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

const REGISTRATION_FEE = { WAEC: 12000, JAMB: 7500, NECO: 13500 };

function defaultDb() {
  return {
    users: {},
    sessions: {},
    verifications: {},
    wallets: {},
    transactions: [],
    notifications: {},
    idempotency: {},
    applications: {},
  };
}

let db = defaultDb();
let pool = null;
let saveQueue = Promise.resolve();

function ensureDemoUser() {
  const hasUser = Object.values(db.users).some(u => u.email === 'demo@zpay.com');
  if (hasUser) return;
  const user = {
    id: generateUserReference(),
    fullName: 'Demo User',
    phone: '08012345678',
    email: 'demo@zpay.com',
    password: 'password123',
    pinSet: true,
    verificationTier: 'tier1',
    createdAt: new Date().toISOString(),
  };
  db.users[user.id] = user;
  db.wallets[user.id] = { balance: 50000, currency: 'NGN', createdAt: new Date().toISOString() };
  seedNotifications(user.id);
  const now = new Date();
  [
    { service: 'AIRTIME', serviceName: 'Airtime', amount: 500, fee: 0, providerId: 'mtn', customer: '08098765432' },
    { service: 'DATA', serviceName: 'Data', amount: 1500, fee: 0, providerId: 'mtn-data', customer: '08098765432' },
    { service: 'ELECTRICITY', serviceName: 'Electricity', amount: 5000, fee: 100, providerId: 'ekedc', customer: '45678901234' },
    { service: 'TV', serviceName: 'TV', amount: 6500, fee: 200, providerId: 'dstv', customer: '70123456789' },
    { service: 'AIRTIME', serviceName: 'Airtime', amount: 1000, fee: 0, providerId: 'airtel', customer: '08011112222', status: 'failed' },
  ].forEach((t, i) => {
    const d = new Date(now);
    d.setHours(d.getHours() - (i * 24 + 6));
    db.transactions.push({
      id: generateId('tx'),
      reference: generateId('ZP'),
      userId: user.id,
      service: t.service,
      serviceName: t.serviceName,
      amount: t.amount,
      fee: t.fee,
      total: t.amount + t.fee,
      currency: 'NGN',
      paymentMethod: 'wallet',
      status: t.status || 'successful',
      providerReference: (t.status || 'successful') === 'successful' ? generateId('PRV') : null,
      customerIdentifier: t.customer,
      metadata: null,
      createdAt: d.toISOString(),
      updatedAt: d.toISOString(),
    });
  });
  save();
}

async function initPg() {
  pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS zpay_db (
        id INTEGER PRIMARY KEY,
        data JSONB NOT NULL
      )
    `);
  } finally {
    client.release();
  }
  const result = await pool.query('SELECT data FROM zpay_db WHERE id = 1');
  if (result.rows.length > 0) {
    db = result.rows[0].data;
  } else {
    db = defaultDb();
    ensureDemoUser();
    await persistToPg();
  }
}

async function persistToPg() {
  if (!pool) return;
  await pool.query('INSERT INTO zpay_db (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [JSON.stringify(db)]);
}

async function load() {
  if (DATABASE_URL) {
    try {
      await initPg();
      return;
    } catch (e) {
      console.error('PostgreSQL init failed, falling back to JSON file:', e.message);
    }
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const loaded = JSON.parse(raw);
      Object.keys(db).forEach(k => delete db[k]);
      Object.assign(db, loaded);
    }
  } catch (e) {
    console.error('Failed to load DB, using defaults:', e.message);
  }
  ensureDemoUser();
}

async function save() {
  if (pool) {
    saveQueue = saveQueue.then(() => persistToPg()).catch(e => console.error('Failed to persist to PostgreSQL:', e.message));
    return;
  }
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Failed to save DB:', e.message);
  }
}

async function resetDb() {
  Object.keys(db).forEach(k => delete db[k]);
  Object.assign(db, defaultDb());
  await save();
}

function seedNotifications(userId) {
  if (!db.notifications[userId]) db.notifications[userId] = [];
  if (db.notifications[userId].length === 0) {
    db.notifications[userId].push({
      id: generateId('ntf'),
      type: 'account',
      title: 'Welcome to ZPAY',
      message: 'Your wallet is ready. Fund it to start paying bills.',
      readAt: null,
      createdAt: new Date().toISOString(),
    });
  }
}

module.exports = {
  db,
  load,
  save,
  resetDb,
  generateId,
  generateUserReference,
  INITIAL_BALANCE,
  SERVICES,
  SERVICE_NAMES,
  PROVIDERS,
  DATA_BUNDLES,
  TV_PACKAGES,
  ELEC_QUICK_AMOUNTS,
  REGISTRATION_FEE,
  seedNotifications,
};