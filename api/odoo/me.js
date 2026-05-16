const { getOdooConfig } = require('./_config');
const { getEncryptedCookie, clearEncryptedCookie } = require('./_cookies');
const { callUpstreamMe } = require('./_service');
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

  const bearerToken = getBearerToken(req);
  if (bearerToken) {
    try {
      const result = await callUpstreamMe(config, bearerToken);
      const overTimeHours = result.normalizedProfile.stats.totalOverTime ?? 0;
      sendJson(res, 200, {
        ok: true,
        authenticated: true,
        profile: result.normalizedProfile,
        over_time: overTimeHours,
        total_over_time: overTimeHours
      });
      return;
    } catch (error) {
      if (error.statusCode === 401) {
        clearEncryptedCookie(res, config.cookieName);
      }
      sendJson(res, error.statusCode || 502, {
        ok: false,
        error: error.code || 'ODOO_PROFILE_ERROR',
        message: error.message
      });
      return;
    }
  }

  let token = '';
  try {
    token = getEncryptedCookie(req, config.cookieName, config.authSecret);
  } catch (error) {
    clearEncryptedCookie(res, config.cookieName);
    sendJson(res, 401, {
      ok: false,
      error: 'ODOO_SESSION_INVALID',
      message: 'Odoo session is invalid or expired'
    });
    return;
  }

  if (!token) {
    sendJson(res, 401, {
      ok: false,
      error: 'ODOO_NOT_AUTHENTICATED',
      message: 'Odoo session is missing'
    });
    return;
  }

  try {
    const result = await callUpstreamMe(config, token);
    const overTimeHours = result.normalizedProfile.stats.totalOverTime ?? 0;
    sendJson(res, 200, {
      ok: true,
      authenticated: true,
      profile: result.normalizedProfile,
      over_time: overTimeHours,
      total_over_time: overTimeHours
    });
  } catch (error) {
    if (error.statusCode === 401) {
      clearEncryptedCookie(res, config.cookieName);
    }
    sendJson(res, error.statusCode || 502, {
      ok: false,
      error: error.code || 'ODOO_PROFILE_ERROR',
      message: error.message
    });
  }
};
