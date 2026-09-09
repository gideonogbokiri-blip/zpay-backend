const { isConfigured } = require('./vtpass');

function isServiceDemoAllowed() {
  if (process.env.SERVICES_DEMO_ENABLED === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

function requireVendor() {
  if (isConfigured() || isServiceDemoAllowed()) return;
  const err = new Error(
    'This service is not connected to a payment provider yet. It will be enabled once the provider is set up.'
  );
  err.code = 'SERVICE_NOT_CONFIGURED';
  err.kind = 'unexpected';
  err.statusCode = 503;
  err.retryable = false;
  throw err;
}

module.exports = { isServiceDemoAllowed, requireVendor };