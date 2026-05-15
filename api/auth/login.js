const crypto = require('crypto');
const { getBaseUrl, setOauthStateCookie, setOauthNextCookie } = require('../_auth');

module.exports = async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId) {
    res.status(500).send('Missing GOOGLE_CLIENT_ID');
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  setOauthStateCookie(res, state);
  const next = typeof req.query.next === 'string' && req.query.next ? req.query.next : '/';
  setOauthNextCookie(res, next);

  const baseUrl = getBaseUrl(req);
  const callback = `${baseUrl}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'offline',
    include_granted_scopes: 'true'
  });

  res.statusCode = 302;
  res.setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.end();
};
