const { db, save, generateUserReference, seedNotifications } = require('./store');

const DEMO_PHONE = '08012345678';
const DEMO_EMAIL = 'demo@zpay.com';
const DEMO_PASSWORD = 'password123';

function seed() {
  const existing = Object.values(db.users).find(u => u.email === DEMO_EMAIL);
  if (existing) {
    console.log('Demo user already exists:');
    console.log('  Email:    demo@zpay.com');
    console.log('  Phone:    08012345678');
    console.log('  Password: password123');
    return;
  }

  const userId = generateUserReference();
  db.users[userId] = {
    id: userId,
    fullName: 'Demo User',
    phone: DEMO_PHONE,
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    pinSet: true,
    verificationTier: 'tier1',
    createdAt: new Date().toISOString(),
  };

  db.wallets[userId] = { balance: 50000, currency: 'NGN', createdAt: new Date().toISOString() };
  seedNotifications(userId);
  save();

  console.log('Demo user created successfully!');
  console.log('');
  console.log('  Email:    demo@zpay.com');
  console.log('  Phone:    08012345678');
  console.log('  Password: password123');
  console.log('  Balance:  ₦50,000');
}

seed();
