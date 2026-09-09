const { serviceVariations } = require('./vtpass');

const VTPASS_SERVICE_MAP = {
  aedc: 'abuja-electric',
  bedc: 'benin-electric',
  eedc: 'enugu-electric',
  ekedc: 'eko-electric',
  ibedc: 'ibadan-electric',
  ikedc: 'ikeja-electric',
  jedc: 'jos-electric',
  kaedco: 'kaduna-electric',
  kedco: 'kano-electric',
  phedc: 'portharcourt-electric',
  yedc: 'yola-electric',
  mtn: 'mtn',
  airtel: 'airtel',
  glo: 'glo',
  '9mobile': 'etisalat',
  'mtn-data': 'mtn-data',
  'airtel-data': 'airtel-data',
  'glo-data': 'glo-data',
  '9mobile-data': 'etisalat-data',
  dstv: 'dstv',
  gotv: 'gotv',
  startimes: 'startimes',
  WAEC: 'waec-registration',
  JAMB: 'jamb',
};

function vtpassServiceID(key) {
  return VTPASS_SERVICE_MAP[key] || null;
}

const variationsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getVariations(serviceID) {
  const hit = variationsCache.get(serviceID);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.items;
  }
  const items = await serviceVariations(serviceID);
  variationsCache.set(serviceID, { at: Date.now(), items });
  return items;
}

async function resolveVariationAmount(serviceID, variationCode) {
  let variations;
  try {
    variations = await getVariations(serviceID);
  } catch (e) {
    return null;
  }
  const found = variations.find((v) => v && v.variation_code === variationCode);
  if (!found) return null;
  const amount = Number(found.variation_amount);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

module.exports = {
  VTPASS_SERVICE_MAP,
  vtpassServiceID,
  getVariations,
  resolveVariationAmount,
};