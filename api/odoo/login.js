const { getOdooConfig } = require('./_config');
const { readRequestBody, callUpstreamLogin } = require('./_service');
const { setEncryptedCookie, clearEncryptedCookie } = require('./_cookies');
const { sendJson } = require('./_response');

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

  let body;
  try {
    body = await readRequestBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, {
      ok: false,
      error: error.code || 'ODOO_BAD_REQUEST',
      message: error.message
    });
    return;
  }

  const account = String(body.account || '').trim();
  const password = String(body.password || '');
  const deviceId = String(body.device_id || '').trim();
  const platformType = String(body.platform_type || '').trim().toLowerCase();

  if (!account || !password || !deviceId || !platformType) {
    sendJson(res, 400, {
      ok: false,
      error: 'ODOO_BAD_REQUEST',
      message: 'account, password, device_id, and platform_type are required'
    });
    return;
  }

  if (!['android', 'ios'].includes(platformType)) {
    sendJson(res, 400, {
      ok: false,
      error: 'ODOO_BAD_REQUEST',
      message: 'platform_type must be android or ios'
    });
    return;
  }

  try {
    const loginResult = await callUpstreamLogin(config, {
      account,
      password,
      device_id: deviceId,
      platform_type: platformType,
      type: platformType,
      company_type: body.company_type ? String(body.company_type).trim() : ''
    });

    setEncryptedCookie(
      res,
      config.pendingCookieName,
      loginResult.token,
      config.authSecret,
      15 * 60
    );

    sendJson(res, 200, {
      ok: true,
      authenticated: false,
      requiresTwoFactor: true,
      pending: true,
      pendingToken: loginResult.token
    });
  } catch (error) {
    clearEncryptedCookie(res, config.pendingCookieName);
    clearEncryptedCookie(res, config.cookieName);
    sendJson(res, error.statusCode || 502, {
      ok: false,
      error: error.code || 'ODOO_UPSTREAM_ERROR',
      message: error.message
    });
  }
};
