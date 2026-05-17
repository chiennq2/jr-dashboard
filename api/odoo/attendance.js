const { getOdooConfig } = require('./_config');
const { getEncryptedCookie, clearEncryptedCookie } = require('./_cookies');
const { callUpstreamAttendances } = require('./_service');
const { sendJson } = require('./_response');

function getBearerToken(req) {
  const headers = (req && req.headers) || {};
  const rawAuth = headers.authorization || headers.Authorization || '';
  const value = String(rawAuth || '').trim();
  if (!value) {
    return '';
  }

  const parts = value.split(/\s+/);
  if (parts.length < 2) {
    return '';
  }

  if (parts[0].toLowerCase() !== 'bearer') {
    return '';
  }

  return parts.slice(1).join(' ').trim();
}

module.exports = async (req, res) => {
  let config;
  try {
    config = getOdooConfig();
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.code || 'ODOO_CONFIG_ERROR',
      message: error.message
    });
    return;
  }

  const requestUrl = new URL((req && req.url) || '/', 'http://localhost');
  const year = String(requestUrl.searchParams.get('year') || '').trim();
  if (!year) {
    sendJson(res, 400, {
      ok: false,
      error: 'ODOO_BAD_REQUEST',
      message: 'year is required'
    });
    return;
  }

  const bearerToken = getBearerToken(req);
  const cookieToken = !bearerToken ? (() => {
    try {
      return getEncryptedCookie(req, config.cookieName, config.authSecret);
    } catch (error) {
      clearEncryptedCookie(res, config.cookieName);
      return '';
    }
  })() : '';
  const token = bearerToken || cookieToken;

  if (!token) {
    sendJson(res, 401, {
      ok: false,
      error: 'ODOO_NOT_AUTHENTICATED',
      message: 'Odoo session is missing'
    });
    return;
  }

  try {
    const result = await callUpstreamAttendances(config, token, year);
    sendJson(res, 200, {
      ok: true,
      authenticated: true,
      year: result.year,
      records: result.records
    });
  } catch (error) {
    if (error.statusCode === 401) {
      clearEncryptedCookie(res, config.cookieName);
    }
    sendJson(res, error.statusCode || 502, {
      ok: false,
      error: error.code || 'ODOO_ATTENDANCE_ERROR',
      message: error.message
    });
  }
};
