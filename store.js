const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'db.json');

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

function load() {
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
}

function save() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Failed to save DB:', e.message);
  }
}

function resetDb() {
  Object.keys(db).forEach(k => delete db[k]);
  Object.assign(db, defaultDb());
  save();
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