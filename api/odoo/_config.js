const DEFAULT_COOKIE_NAME = 'jr_odoo_session';
const DEFAULT_SESSION_AGE_SECONDS = 7 * 24 * 60 * 60;

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function getOdooConfig() {
  const apiBase = trimTrailingSlash(process.env.ODOO_API_BASE || '');
  const authSecret = String(process.env.ODOO_AUTH_SECRET || '');
  const errors = [];

  if (!apiBase) {
    errors.push('Missing ODOO_API_BASE');
  }

  if (!authSecret) {
    errors.push('Missing ODOO_AUTH_SECRET');
  }

  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.statusCode = 500;
    err.code = 'ODOO_CONFIG_ERROR';
    throw err;
  }

  return {
    apiBase,
    authSecret,
    cookieName: DEFAULT_COOKIE_NAME,
    pendingCookieName: 'jr_odoo_pending',
    sessionAgeSeconds: DEFAULT_SESSION_AGE_SECONDS
  };
}

function buildOdooUrl(config, path) {
  return new URL(path, `${config.apiBase}/`).toString();
}

module.exports = {
  DEFAULT_COOKIE_NAME,
  DEFAULT_SESSION_AGE_SECONDS,
  getOdooConfig,
  buildOdooUrl,
  trimTrailingSlash
};
