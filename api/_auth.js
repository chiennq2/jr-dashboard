const crypto = require('crypto');

const SESSION_COOKIE = 'jr_session';
const OAUTH_STATE_COOKIE = 'jr_oauth_state';
const OAUTH_NEXT_COOKIE = 'jr_oauth_next';
const SESSION_AGE_SECONDS = 7 * 24 * 60 * 60;

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function toBase64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function fromBase64Url(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function signPayload(payloadJson, secret) {
  return crypto.createHmac('sha256', secret).update(payloadJson).digest('base64url');
}

function createSessionToken(payload, secret) {
  const json = JSON.stringify(payload);
  const encoded = toBase64Url(json);
  const sig = signPayload(json, secret);
  return `${encoded}.${sig}`;
}

function verifySessionToken(token, secret) {
  if (!token || !secret || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  try {
    const json = fromBase64Url(encoded);
    const expected = signPayload(json, secret);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(json);
    if (!data || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function makeCookie(name, value, maxAgeSec) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax'
  ];
  if (typeof maxAgeSec === 'number') parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join('; ');
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function appendSetCookie(res, cookieValue) {
  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }
  if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', prev.concat(cookieValue));
    return;
  }
  res.setHeader('Set-Cookie', [prev, cookieValue]);
}

function getAllowedEmails() {
  return String(process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedEmail(email) {
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(String(email || '').toLowerCase());
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

function requireSession(req) {
  const cookies = parseCookies(req);
  const secret = getAuthSecret();
  const token = cookies[SESSION_COOKIE];
  return verifySessionToken(token, secret);
}

function setSessionCookie(res, userPayload) {
  const secret = getAuthSecret();
  if (!secret) throw new Error('Missing AUTH_SECRET/NEXTAUTH_SECRET');
  const exp = Math.floor(Date.now() / 1000) + SESSION_AGE_SECONDS;
  const token = createSessionToken({ ...userPayload, exp }, secret);
  appendSetCookie(res, makeCookie(SESSION_COOKIE, token, SESSION_AGE_SECONDS));
}

function setOauthStateCookie(res, state) {
  appendSetCookie(res, makeCookie(OAUTH_STATE_COOKIE, state, 10 * 60));
}

function getOauthState(req) {
  const cookies = parseCookies(req);
  return cookies[OAUTH_STATE_COOKIE] || '';
}

function clearAuthCookies(res) {
  res.setHeader('Set-Cookie', [clearCookie(SESSION_COOKIE), clearCookie(OAUTH_STATE_COOKIE), clearCookie(OAUTH_NEXT_COOKIE)]);
}

function setOauthNextCookie(res, nextPath) {
  appendSetCookie(res, makeCookie(OAUTH_NEXT_COOKIE, nextPath || '/', 10 * 60));
}

function getOauthNext(req) {
  const cookies = parseCookies(req);
  return cookies[OAUTH_NEXT_COOKIE] || '/';
}

module.exports = {
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_NEXT_COOKIE,
  SESSION_AGE_SECONDS,
  parseCookies,
  getAuthSecret,
  getAllowedEmails,
  isAllowedEmail,
  getBaseUrl,
  requireSession,
  setSessionCookie,
  setOauthStateCookie,
  getOauthState,
  setOauthNextCookie,
  getOauthNext,
  clearAuthCookies
};
