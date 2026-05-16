const { getOdooConfig } = require('./_config');
const { readRequestBody, callUpstreamVerifyOtp } = require('./_service');
const { getEncryptedCookie, setEncryptedCookie, clearEncryptedCookie } = require('./_cookies');
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

  const otp = String(body.otp || body.otp_code || '').trim();
  const pendingTokenFromBody = String(body.pending_token || body.pendingToken || '').trim();
  if (!otp) {
    sendJson(res, 400, {
      ok: false,
      error: 'ODOO_BAD_REQUEST',
      message: 'otp is required'
    });
    return;
  }

  let pendingToken = '';
  try {
    pendingToken = getEncryptedCookie(req, config.pendingCookieName, config.authSecret);
  } catch (error) {
    pendingToken = '';
  }

  if (!pendingToken && pendingTokenFromBody) {
    pendingToken = pendingTokenFromBody;
  }

  if (!pendingToken) {
    sendJson(res, 401, {
      ok: false,
      error: 'ODOO_NOT_AUTHENTICATED',
      message: 'Odoo login session is missing'
    });
    return;
  }

  try {
    const otpResult = await callUpstreamVerifyOtp(config, pendingToken, otp);

    setEncryptedCookie(
      res,
      config.cookieName,
      otpResult.token,
      config.authSecret,
      config.sessionAgeSeconds
    );
    clearEncryptedCookie(res, config.pendingCookieName);

    sendJson(res, 200, {
      ok: true,
      authenticated: true,
      token: otpResult.token
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
