const { load, save, db, generateId, generateUserReference, seedNotifications } = require('./store');

load();

const userId = generateUserReference();
db.users[userId] = {
  id: userId,
  fullName: 'Demo User',
  phone: '08012345678',
  email: 'demo@zpay.com',
  password: 'password123',
  pinSet: true,
  verificationTier: 'tier1',
};

db.wallets[userId] = { balance: 50000, currency: 'NGN' };
seedNotifications(userId);

const now = new Date();
const transactions = [
  { service: 'AIRTIME', serviceName: 'Airtime', amount: 500, fee: 0, status: 'successful', providerId: 'mtn', customer: '08098765432' },
  { service: 'DATA', serviceName: 'Data', amount: 1500, fee: 0, status: 'successful', providerId: 'mtn-data', customer: '08098765432' },
  { service: 'ELECTRICITY', serviceName: 'Electricity', amount: 5000, fee: 100, status: 'successful', providerId: 'ekedc', customer: '45678901234' },
  { service: 'TV', serviceName: 'TV', amount: 6500, fee: 200, status: 'successful', providerId: 'dstv', customer: '70123456789' },
  { service: 'AIRTIME', serviceName: 'Airtime', amount: 1000, fee: 0, status: 'failed', providerId: 'airtel', customer: '08011112222' },
];

transactions.forEach((t, i) => {
  const d = new Date(now);
  d.setHours(d.getHours() - (i * 24 + 6));
  db.transactions.push({
    id: generateId('tx'),
    reference: generateId('ZP'),
    userId,
    service: t.service,
    serviceName: t.serviceName,
    amount: t.amount,
    fee: t.fee,
    total: t.amount + t.fee,
    currency: 'NGN',
    paymentMethod: 'wallet',
    status: t.status,
    providerReference: t.status === 'successful' ? generateId('PRV') : null,
    customerIdentifier: t.customer,
    metadata: null,
    createdAt: d.toISOString(),
    updatedAt: d.toISOString(),
  });
});

db.notifications[userId].push(
  { id: generateId('ntf'), type: 'payment', title: 'Airtime purchase', message: 'NGN 500 MTN airtime was successful.', readAt: null, createdAt: db.transactions[0].createdAt },
  { id: generateId('ntf'), type: 'payment', title: 'Data purchase', message: 'NGN 1,500 MTN data bundle was successful.', readAt: null, createdAt: db.transactions[1].createdAt },
  { id: generateId('ntf'), type: 'payment', title: 'Electricity token', message: 'NGN 5,100 EKEDC payment was successful.', readAt: null, createdAt: db.transactions[2].createdAt },
);

save();

console.log('');
console.log('=== TEST ACCOUNT SEEDED ===');
console.log('Email:    demo@zpay.com');
console.log('Phone:    08012345678');
console.log('Password: password123');
console.log('PIN:      1234');
console.log('Balance:  NGN 50,000');
console.log('Transactions: 5');
console.log('===========================');