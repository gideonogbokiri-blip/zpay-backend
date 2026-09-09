const express = require('express');
const router = express.Router();
const { apiError } = require('../middleware');
const { SERVICES, PROVIDERS, DATA_BUNDLES, TV_PACKAGES, ELEC_QUICK_AMOUNTS, REGISTRATION_FEE } = require('../store');
const { isConfigured, merchantVerify } = require('../lib/vtpass');
const { vtpassServiceID, getVariations } = require('../lib/vendor-catalog');

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

function normalizeVariation(v, service, providerId) {
  const price = Number(v.variation_amount) || 0;
  if (service === 'DATA') {
    return {
      id: v.variation_code,
      providerId,
      name: v.name,
      size: v.name,
      price,
      validity: v.validity || '—',
    };
  }
  return {
    id: v.variation_code,
    providerId,
    name: v.name,
    price,
    duration: '1 month',
  };
}

router.get('/products/:service/:providerId', async (req, res, next) => {
  try {
    const { service, providerId } = req.params;
    if (service !== 'DATA' && service !== 'TV') return res.json([]);

    if (isConfigured()) {
      const serviceID = vtpassServiceID(providerId);
      if (serviceID) {
        try {
          const variations = await getVariations(serviceID);
          const items = variations
            .filter((v) => v && typeof v.variation_amount !== 'undefined' && v.variation_code)
            .map((v) => normalizeVariation(v, service, providerId));
          if (items.length) return res.json(items);
        } catch (e) {
          // vendor unreachable — fall back to the static catalog
        }
      }
    }

    if (service === 'DATA') {
      return res.json(DATA_BUNDLES.filter((b) => b.providerId === providerId));
    }
    return res.json(TV_PACKAGES.filter((p) => p.providerId === providerId));
  } catch (err) {
    next(err);
  }
});

router.get('/electricity/quick-amounts', (req, res) => {
  res.json(ELEC_QUICK_AMOUNTS);
});

function preferredRegistrationVariation(service, variations) {
  if (!Array.isArray(variations) || variations.length === 0) return null;
  if (service === 'WAEC') {
    return (
      variations.find((v) => /registr/i.test(v.variation_code || '')) ||
      variations.find((v) => /registr/i.test(v.name || '')) ||
      variations[0]
    );
  }
  if (service === 'JAMB') {
    return (
      variations.find((v) => (v.variation_code || '') === 'utme-no-mock') ||
      variations.find((v) => (v.variation_code || '').includes('utme')) ||
      variations[0]
    );
  }
  return variations[0];
}

router.get('/registration-fee/:service', async (req, res, next) => {
  try {
    const { service } = req.params;
    if (!(service in REGISTRATION_FEE)) {
      throw apiError('INVALID_SERVICE', 'Service not found.', 'validation', { statusCode: 404 });
    }

    if (service !== 'NECO' && isConfigured()) {
      const serviceID = vtpassServiceID(service);
      if (serviceID) {
        try {
          const variations = await getVariations(serviceID);
          const preferred = preferredRegistrationVariation(service, variations);
          const fee = preferred ? Number(preferred.variation_amount) : undefined;
          if (preferred && Number.isFinite(fee)) {
            return res.json({ fee, variationCode: preferred.variation_code });
          }
        } catch (e) {
          // fall through to static fee
        }
      }
    }
    res.json({ fee: REGISTRATION_FEE[service] });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-meter', async (req, res, next) => {
  try {
    const { providerId, meterNumber, type } = req.body;
    if (!meterNumber || !/^\d{6,}$/.test(meterNumber)) {
      throw apiError('INVALID_METER', 'Enter a valid meter number.', 'validation', { statusCode: 400 });
    }

    if (isConfigured()) {
      const serviceID = vtpassServiceID(providerId);
      if (serviceID) {
        try {
          const result = await merchantVerify({
            serviceID,
            billersCode: meterNumber,
            type: type === 'postpaid' ? 'postpaid' : 'prepaid',
          });
          const content = (result && result.content) || {};
          const name = content.Customer_Name || content.customer_name || content.Name;
          if (!name) {
            throw new Error('no customer');
          }
          return res.json({
            customerName: name,
            customerAddress: content.Customer_Address || content.customer_address || undefined,
            meterType: content.Meter_Type || content.meter_type || type || 'prepaid',
          });
        } catch (e) {
          const err = new Error('We could not verify this meter number. Please check the number and try again.');
          err.code = 'VERIFY_FAILED';
          err.kind = 'validation';
          err.statusCode = 400;
          err.cause = e;
          throw err;
        }
      }
    }

    res.json({ customerName: mockCustomerName(meterNumber), meterType: type === 'postpaid' ? 'postpaid' : 'prepaid' });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-customer', async (req, res, next) => {
  try {
    const { providerId, smartcardNumber } = req.body;
    if (!smartcardNumber || !/^\d{6,}$/.test(smartcardNumber)) {
      throw apiError('INVALID_SMARTCARD', 'Enter a valid smartcard / IUC number.', 'validation', { statusCode: 400 });
    }

    if (isConfigured()) {
      const serviceID = vtpassServiceID(providerId);
      if (serviceID) {
        try {
          const result = await merchantVerify({
            serviceID,
            billersCode: smartcardNumber,
          });
          const content = (result && result.content) || {};
          const name = content.Customer_Name || content.customer_name || content.Name;
          if (!name) {
            throw new Error('no customer');
          }
          return res.json({
            customerName: name,
            customerAddress: content.Customer_Address || content.customer_address || undefined,
          });
        } catch (e) {
          const err = new Error('We could not verify this smartcard / IUC number. Please check it and try again.');
          err.code = 'VERIFY_FAILED';
          err.kind = 'validation';
          err.statusCode = 400;
          err.cause = e;
          throw err;
        }
      }
    }

    res.json({ customerName: mockCustomerName(smartcardNumber) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;