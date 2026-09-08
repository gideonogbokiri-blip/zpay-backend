const { SMTPClient } = require('emailjs');

function makeClient() {
  const user = process.env.EMAIL_USER;
  const password = process.env.EMAIL_PASS;
  if (!user || !password) return null;
  try {
    const secure = (process.env.EMAIL_SECURE || 'ssl').toLowerCase();
    return new SMTPClient({
      user,
      password,
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_PORT || 465),
      ssl: secure === 'ssl',
      tls: secure === 'tls',
      timeout: 15000,
      authentication: ['PLAIN', 'LOGIN'],
    });
  } catch (err) {
    console.error('[email] Failed to init SMTP:', err.message);
    return null;
  }
}

function isEmailEnabled() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

async function sendOtpEmail({ email, fullName = 'there', otp }) {
  if (isEmailEnabled() && email) {
    const client = makeClient();
    if (client) {
      const from = process.env.EMAIL_FROM || `ZPAY <${process.env.EMAIL_USER}>`;
      const subject = 'Your ZPAY verification code';
      const text = [
        `Hi ${fullName},`,
        '',
        `Your ZPAY verification code is ${otp}.`,
        'It expires in 10 minutes. Do not share this code with anyone.',
        '',
        '- The ZPAY Team',
      ].join('\n');
      try {
        await client.sendAsync({ from, to: email, subject, text });
        console.log(`[email] OTP emailed to ${email}`);
        return { delivered: true, channel: 'smtp' };
      } catch (err) {
        // Do not fail the request; fall back to console so verification still works.
        console.error(`[email] SMTP send failed for ${email}:`, err.message);
      }
    }
  }

  console.log(`[mock-auth] Email OTP for ${email}: ${otp}`);
  return { delivered: false, channel: 'console' };
}

module.exports = { sendOtpEmail, isEmailEnabled };