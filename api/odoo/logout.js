const { DEFAULT_COOKIE_NAME } = require('./_config');
const { clearEncryptedCookie } = require('./_cookies');
const { sendJson } = require('./_response');

module.exports = async (_req, res) => {
  clearEncryptedCookie(res, DEFAULT_COOKIE_NAME);
  clearEncryptedCookie(res, 'jr_odoo_pending');
  sendJson(res, 200, {
    ok: true
  });
};
