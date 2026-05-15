const {
  getBaseUrl,
  getOauthState,
  getOauthNext,
  isAllowedEmail,
  setSessionCookie,
  clearAuthCookies
} = require('../_auth');

module.exports = async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const storedState = getOauthState(req);

  if (!code || !state || !storedState || state !== storedState) {
    clearAuthCookies(res);
    res.status(400).send('Invalid OAuth state');
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) {
    res.status(500).send('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    return;
  }

  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/callback`;

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      res.status(502).send(`Google token exchange failed: ${text}`);
      return;
    }
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      res.status(502).send('Google token response missing access_token');
      return;
    }

    const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!userResp.ok) {
      const text = await userResp.text();
      res.status(502).send(`Google userinfo failed: ${text}`);
      return;
    }
    const profile = await userResp.json();
    const email = String(profile.email || '').toLowerCase();
    if (!email || !isAllowedEmail(email)) {
      clearAuthCookies(res);
      res.status(403).send('Email is not allowed');
      return;
    }

    const nextPath = getOauthNext(req);
    clearAuthCookies(res);
    setSessionCookie(res, {
      email,
      name: profile.name || email,
      picture: profile.picture || ''
    });
    res.statusCode = 302;
    res.setHeader('Location', nextPath || '/');
    res.end();
  } catch (err) {
    res.status(500).send(`Auth callback error: ${err.message}`);
  }
};
