const express = require('express');
const router = express.Router();
const { apiError } = require('../middleware');
const { SERVICES, PROVIDERS, DATA_BUNDLES, TV_PACKAGES, ELEC_QUICK_AMOUNTS, REGISTRATION_FEE } = require('../store');

function shaStable(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function mockCustomerName(identifier) {
  const names = ['OKEKE MARY', 'ADEWALE K. P.', 'MUSA IBRAHIM', 'NGOZI CHIDI', 'BALOGUN TUNDE'];
  return names[shaStable(identifier) % names.length];
}

router.get('/', (req, res) => {
  res.json(SERVICES);
});

router.get('/providers/:service', (req, res) => {
  const { service } = req.params;
  const providers = PROVIDERS.filter((p) => p.service === service);
  res.json(providers);
});

router.get('/products/:service/:providerId', (req, res) => {
  const { service, providerId } = req.params;
  if (service === 'DATA') {
    return res.json(DATA_BUNDLES.filter((b) => b.providerId === providerId));
  }
  if (service === 'TV') {
    return res.json(TV_PACKAGES.filter((p) => p.providerId === providerId));
  }
  res.json([]);
});

router.get('/electricity/quick-amounts', (req, res) => {
  res.json(ELEC_QUICK_AMOUNTS);
});

router.get('/registration-fee/:service', (req, res) => {
  const { service } = req.params;
  const fee = REGISTRATION_FEE[service];
  if (fee === undefined) {
    throw apiError('INVALID_SERVICE', 'Service not found.', 'validation', { statusCode: 404 });
  }
  res.json({ fee });
});

router.post('/verify-meter', (req, res) => {
  const { providerId, meterNumber } = req.body;
  if (!meterNumber || !/^\d{6,}$/.test(meterNumber)) {
    throw apiError('INVALID_METER', 'Enter a valid meter number.', 'validation', { statusCode: 400 });
  }
  res.json({ customerName: mockCustomerName(meterNumber) });
});

router.post('/verify-customer', (req, res) => {
  const { providerId, smartcardNumber } = req.body;
  if (!smartcardNumber || !/^\d{6,}$/.test(smartcardNumber)) {
    throw apiError('INVALID_SMARTCARD', 'Enter a valid smartcard / IUC number.', 'validation', { statusCode: 400 });
  }
  res.json({ customerName: mockCustomerName(smartcardNumber) });
});

module.exports = router;