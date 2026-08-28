let twilioClient = null;
let twilioReady = false;

function initTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (sid && token) {
    try {
      const twilio = require('twilio');
      twilioClient = twilio(sid, token);
      twilioReady = true;
      console.log('[sms] Twilio SMS enabled');
      return;
    } catch (err) {
      console.error('[sms] Failed to init Twilio:', err.message);
    }
  }
  twilioClient = null;
  twilioReady = false;
}

initTwilio();

function isSmsEnabled() {
  return twilioReady && !!process.env.TWILIO_FROM_NUMBER;
}

async function sendOtp(phone, code) {
  const from = process.env.TWILIO_FROM_NUMBER;
  const message = `Your ZPAY verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`;

  if (isSmsEnabled() && twilioClient) {
    try {
      await twilioClient.messages.create({ to: phone, from, body: message });
      console.log(`[sms] OTP sent to ${phone}`);
      return { delivered: true, channel: 'twilio' };
    } catch (err) {
      // Do not fail the request; fall back to console so verification still works.
      console.error(`[sms] Twilio send failed for ${phone}:`, err.message);
    }
  }

  console.log(`[mock-auth] OTP for ${phone}: ${code}`);
  return { delivered: false, channel: 'console' };
}

module.exports = { sendOtp, isSmsEnabled, initTwilio };
