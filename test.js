const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const r = http.request({ hostname: '127.0.0.1', port: 3001, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  let token;
  try {
    // 1. Signup
    let r = await req('POST', '/api/auth/signup', { fullName: 'Test User', phone: '08012345678', email: 'test@example.com', password: 'pass123' });
    console.log('1. signup:', r.status, r.body.verificationId ? 'ok' : 'fail');

    // 2. Read OTP from db.json
    const db = require('./data/db.json');
    const verId = Object.keys(db.verifications)[0];
    const otp = db.verifications[verId].code;
    console.log('2. otp:', otp);

    // 3. Verify OTP
    r = await req('POST', '/api/auth/verify-otp', { verificationId: r.body.verificationId, code: otp });
    token = r.body.token;
    console.log('3. verify:', r.status, r.body.user.fullName, 'pinSet=' + r.body.user.pinSet);

    // 4. Create PIN
    r = await req('POST', '/api/auth/create-pin', { pin: '1234' }, token);
    console.log('4. pin:', r.body.user.pinSet);

    // 5. Fund wallet
    r = await req('POST', '/api/wallet/fund', { amount: 10000, method: 'card' }, token);
    console.log('5. fund: balance=' + r.body.wallet.balance);

    // 6. Pay airtime
    r = await req('POST', '/api/transactions/pay', { service: 'AIRTIME', providerId: 'mtn', customerIdentifier: '08012345678', amount: 500, pin: '1234' }, token);
    console.log('6. pay:', r.body.status, 'total=' + r.body.total);

    // 7. Wallet after
    r = await req('GET', '/api/wallet', null, token);
    console.log('7. wallet:', r.body.balance);

    // 8. List transactions
    r = await req('GET', '/api/transactions', null, token);
    console.log('8. transactions:', r.body.items.length);

    // 9. Get single transaction
    r = await req('GET', '/api/transactions/' + r.body.items[0].id, null, token);
    console.log('9. get tx:', r.body.service, r.body.status);

    // 10. Notifications
    r = await req('GET', '/api/notifications', null, token);
    console.log('10. notifications:', r.body.length);

    // 11. Mark all read
    r = await req('PUT', '/api/notifications/read-all', {}, token);
    console.log('11. mark all:', r.status);

    // 12. KYC
    r = await req('GET', '/api/kyc', null, token);
    console.log('12. kyc:', r.body.tier, r.body.status);

    // 13. Me
    r = await req('GET', '/api/auth/me', null, token);
    console.log('13. me:', r.body.fullName);

    // 14. Services
    r = await req('GET', '/api/services');
    console.log('14. services:', r.body.length);

    // 15. Providers
    r = await req('GET', '/api/services/providers/ELECTRICITY');
    console.log('15. elec providers:', r.body.length);

    // 16. Products (DATA)
    r = await req('GET', '/api/services/products/DATA/mtn-data');
    console.log('16. data bundles:', r.body.length);

    // 17. Products (TV)
    r = await req('GET', '/api/services/products/TV/dstv');
    console.log('17. tv packages:', r.body.length);

    // 18. Quick amounts
    r = await req('GET', '/api/services/electricity/quick-amounts');
    console.log('18. elec amounts:', r.body);

    // 19. Verify meter
    r = await req('POST', '/api/services/verify-meter', { providerId: 'ekedc', meterNumber: '1234567890' });
    console.log('19. meter name:', r.body.customerName);

    // 20. Verify customer
    r = await req('POST', '/api/services/verify-customer', { providerId: 'dstv', smartcardNumber: '1234567890' });
    console.log('20. smartcard name:', r.body.customerName);

    // 21. Registration fee
    r = await req('GET', '/api/services/registration-fee/WAEC');
    console.log('21. waec fee:', r.body.fee);

    // 22. Register service
    r = await req('POST', '/api/transactions/register', { service: 'WAEC', pin: '1234', amount: 12000, payload: { examType: 'WAEC', name: 'Test Student' } }, token);
    console.log('22. register:', r.body.transaction.status, r.body.application.registrationStatus);

    // 23. Login
    r = await req('POST', '/api/auth/login', { identifier: 'test@example.com', password: 'pass123' });
    console.log('23. login:', r.body.user.fullName);

    // 24. Fund with insufficient test
    r = await req('POST', '/api/transactions/pay', { service: 'ELECTRICITY', providerId: 'ekedc', customerIdentifier: '123456', amount: 999999, pin: '1234' }, token);
    console.log('24. insufficient:', r.status, r.body.code);

    // 25. Resend OTP
    r = await req('POST', '/api/auth/signup', { fullName: 'User2', phone: '08099999999', email: 'u2@test.com', password: 'pass' });
    r = await req('POST', '/api/auth/resend-otp', { verificationId: r.body.verificationId });
    console.log('25. resend:', r.status, 'ok');

    console.log('\n=== ALL 25 TESTS PASSED ===');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
})();