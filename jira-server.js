// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Auth helpers (same as api/_auth.js) ──────────────────────────────────
const SESSION_COOKIE = 'jr_session';
const OAUTH_STATE_COOKIE = 'jr_oauth_state';
const OAUTH_NEXT_COOKIE = 'jr_oauth_next';
const SESSION_AGE_SECONDS = 7 * 24 * 60 * 60;
const JIRA_BASE = process.env.JIRA_BASE || 'https://20.84.97.109:3033';
const JIRA_TOKEN = process.env.JIRA_TOKEN || '';
const PORT = process.env.PORT || 3456;

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

function requireSession(req) {
  const cookies = parseCookies(req);
  const secret = getAuthSecret();
  const token = cookies[SESSION_COOKIE];
  return verifySessionToken(token, secret);
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

function getOauthNext(req) {
  const cookies = parseCookies(req);
  return cookies[OAUTH_NEXT_COOKIE] || '/';
}

function setOauthNextCookie(res, nextPath) {
  appendSetCookie(res, makeCookie(OAUTH_NEXT_COOKIE, nextPath || '/', 10 * 60));
}

function clearAuthCookies(res) {
  res.setHeader('Set-Cookie', [clearCookie(SESSION_COOKIE), clearCookie(OAUTH_STATE_COOKIE), clearCookie(OAUTH_NEXT_COOKIE)]);
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
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

// ── Response helpers ─────────────────────────────────────────────────────
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject({ statusCode: 400, code: 'BAD_REQUEST', message: 'Invalid JSON body' });
      }
    });
    req.on('error', reject);
  });
}

// ── CORS ─────────────────────────────────────────────────────────────────
function applyCorsHeaders(req, res) {
  const origin = req.headers && req.headers.origin ? String(req.headers.origin) : '';
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With, Accept');
  if (origin) {
    res.setHeader('Vary', 'Origin');
  }
}

// ── Static file serving ──────────────────────────────────────────────────
const ROOT_DIR = __dirname;
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + filePath);
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
}

function resolveStaticFile(requestPath) {
  const relativePath = requestPath === '/' ? 'jira-dashboard.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.join(ROOT_DIR, relativePath);
  if (!filePath.startsWith(ROOT_DIR)) return null;
  return filePath;
}

// ── Auth routes (mirrors Vercel /api/auth/*) ─────────────────────────────
async function handleAuthLogin(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Missing GOOGLE_CLIENT_ID');
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  setOauthStateCookie(res, state);

  const parsedUrl = new URL(req.url, 'http://localhost');
  const next = parsedUrl.searchParams.get('next') || '/';
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

  res.writeHead(302, { 'Location': `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
}

async function handleAuthCallback(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const code = parsedUrl.searchParams.get('code') || '';
  const state = parsedUrl.searchParams.get('state') || '';
  const storedState = getOauthState(req);

  if (!code || !state || !storedState || state !== storedState) {
    clearAuthCookies(res);
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid OAuth state');
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
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
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Google token exchange failed: ${text}`);
      return;
    }
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Google token response missing access_token');
      return;
    }

    const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!userResp.ok) {
      const text = await userResp.text();
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Google userinfo failed: ${text}`);
      return;
    }
    const profile = await userResp.json();
    const email = String(profile.email || '').toLowerCase();
    if (!email || !isAllowedEmail(email)) {
      clearAuthCookies(res);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Email is not allowed');
      return;
    }

    const nextPath = getOauthNext(req);
    clearAuthCookies(res);
    setSessionCookie(res, {
      email,
      name: profile.name || email,
      picture: profile.picture || ''
    });
    res.writeHead(302, { 'Location': nextPath || '/' });
    res.end();
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Auth callback error: ${err.message}`);
  }
}

async function handleAuthSession(req, res) {
  const session = requireSession(req);
  if (!session) {
    sendJson(res, 401, { authenticated: false });
    return;
  }
  sendJson(res, 200, {
    authenticated: true,
    user: {
      email: session.email,
      name: session.name || session.email,
      picture: session.picture || ''
    },
    exp: session.exp
  });
}

async function handleAuthLogout(req, res) {
  clearAuthCookies(res);
  res.writeHead(302, { 'Location': '/login.html' });
  res.end();
}

// ── Dashboard app route (mirrors Vercel /api/app) ────────────────────────
async function handleApp(req, res) {
  const session = requireSession(req);
  if (!session) {
    const next = encodeURIComponent(req.url || '/');
    res.writeHead(302, { 'Location': `/login.html?next=${next}` });
    res.end();
    return;
  }

  const filePath = resolveStaticFile('jira-dashboard.html');
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  serveStatic(res, filePath);
}

// ── Jira API proxy (mirrors Vercel /api/jira) ───────────────────────────
function normalizeJiraPath(pathValue) {
  return String(pathValue || '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

function joinUrl(base, pathPart, query) {
  const cleanBase = String(base || '').replace(/\/+$/, '');
  const cleanPath = normalizeJiraPath(pathPart);
  return `${cleanBase}/${cleanPath}${query ? `?${query}` : ''}`;
}

function avoidDuplicateRestPrefix(base, pathPart) {
  const baseHasRest = /\/rest\/api\/2\/?$/i.test(base);
  const normalizedPath = normalizeJiraPath(pathPart);
  if (!baseHasRest) return normalizedPath;
  if (normalizedPath.toLowerCase().startsWith('rest/api/2/')) {
    return normalizedPath.slice('rest/api/2/'.length);
  }
  if (normalizedPath.toLowerCase() === 'rest/api/2') {
    return '';
  }
  return normalizedPath;
}

async function handleJiraProxy(req, res) {
  const session = requireSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const jiraBase = process.env.JIRA_BASE || '';
  const jiraToken = process.env.JIRA_TOKEN || '';
  const allowSelfSigned = String(process.env.JIRA_ALLOW_SELF_SIGNED || '').toLowerCase() === 'true';

  if (!jiraBase || !jiraToken) {
    sendJson(res, 500, { error: 'Missing JIRA_BASE or JIRA_TOKEN environment variables' });
    return;
  }

  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathPart = parsedUrl.pathname.replace(/^\/api\/jira\/?/, '');
  const safePath = avoidDuplicateRestPrefix(jiraBase, pathPart);
  const targetUrl = joinUrl(jiraBase, safePath, parsedUrl.searchParams.toString());

  const httpsAgent = allowSelfSigned ? new https.Agent({ rejectUnauthorized: false }) : undefined;
  const proxyReq = https.request(targetUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${jiraToken}`,
      'Content-Type': 'application/json'
    },
    rejectUnauthorized: !allowSelfSigned,
    agent: httpsAgent
  }, (proxyRes) => {
    let body = '';
    proxyRes.on('data', chunk => body += chunk);
    proxyRes.on('end', () => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json'
      });
      res.end(body);
    });
  });

  proxyReq.on('error', (e) => {
    sendJson(res, 502, { error: `Proxy error: ${e.message}`, targetUrl });
  });
  proxyReq.end();
}

// ── Odoo API routes ──────────────────────────────────────────────────────
const odooLoginHandler = require('./api/odoo/login');
const odooVerifyOtpHandler = require('./api/odoo/verify-otp');
const odooMeHandler = require('./api/odoo/me');
const odooAttendanceHandler = require('./api/odoo/attendance');
const odooLogoutHandler = require('./api/odoo/logout');

async function handleOdooApi(req, res, requestPath) {
  if (requestPath === '/api/odoo/login') {
    await odooLoginHandler(req, res);
    return true;
  }
  if (requestPath === '/api/odoo/verify-otp') {
    await odooVerifyOtpHandler(req, res);
    return true;
  }
  if (requestPath === '/api/odoo/me') {
    await odooMeHandler(req, res);
    return true;
  }
  if (requestPath === '/api/odoo/attendance') {
    await odooAttendanceHandler(req, res);
    return true;
  }
  if (requestPath === '/api/odoo/logout') {
    await odooLogoutHandler(req, res);
    return true;
  }
  return false;
}

// ── Legacy /jira/* proxy (backward compat, no session check) ─────────────
async function handleLegacyJiraProxy(req, res) {
  const jiraBase = process.env.JIRA_BASE || 'https://20.84.97.109:3033';
  const jiraToken = process.env.JIRA_TOKEN || '';
  const target = jiraBase + req.url.replace('/jira', '');
  const options = {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + jiraToken, 'Content-Type': 'application/json' }
  };
  const proxyReq = (target.startsWith('https') ? https : http).request(target, { ...options, rejectUnauthorized: false }, (proxyRes) => {
    let body = '';
    proxyRes.on('data', chunk => body += chunk);
    proxyRes.on('end', () => {
      res.writeHead(proxyRes.statusCode, { 'Content-Type': proxyRes.headers['content-type'] || 'application/json' });
      res.end(body);
    });
  });
  proxyReq.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy error: ' + e.message);
  });
  proxyReq.end();
}

// ── Main request router ──────────────────────────────────────────────────
async function handleRequest(req, res) {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, 'http://localhost');
  const requestPath = parsedUrl.pathname;

  // Auth routes (mirrors Vercel)
  if (requestPath === '/api/auth/login') {
    await handleAuthLogin(req, res);
    return;
  }
  if (requestPath === '/api/auth/callback') {
    await handleAuthCallback(req, res);
    return;
  }
  if (requestPath === '/api/auth/session') {
    await handleAuthSession(req, res);
    return;
  }
  if (requestPath === '/api/auth/logout') {
    await handleAuthLogout(req, res);
    return;
  }

  // Dashboard app (mirrors Vercel /api/app → requires session)
  if (requestPath === '/api/app') {
    await handleApp(req, res);
    return;
  }

  // Jira API proxy (mirrors Vercel /api/jira → requires session)
  if (requestPath.startsWith('/api/jira')) {
    await handleJiraProxy(req, res);
    return;
  }

  // Odoo API routes
  if (requestPath.startsWith('/api/odoo/')) {
    const handled = await handleOdooApi(req, res, requestPath);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Not found: ${req.url}`);
    }
    return;
  }

  // Legacy /jira/* proxy (backward compat)
  if (requestPath.startsWith('/jira/')) {
    await handleLegacyJiraProxy(req, res);
    return;
  }

  // Root — redirect to login if not authenticated, otherwise serve dashboard
  if (requestPath === '/' || requestPath === '/jira-dashboard.html') {
    const session = requireSession(req);
    if (!session) {
      res.writeHead(302, { 'Location': '/login.html' });
      res.end();
      return;
    }
    const filePath = resolveStaticFile('jira-dashboard.html');
    if (filePath) { serveStatic(res, filePath); return; }
  }
  if (requestPath === '/odoo' || requestPath === '/odoo-login') {
    const filePath = resolveStaticFile('odoo-auth.html');
    if (filePath) { serveStatic(res, filePath); return; }
  }

  // Serve static files
  const filePath = resolveStaticFile(requestPath);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // If requesting a protected HTML page, check session (mirrors catch-all rewrite to /api/app)
  const isHtmlFile = path.extname(filePath) === '.html';
  const isLoginPage = requestPath === '/login.html';
  const isOdooAuthPage = requestPath === '/odoo-auth.html';

  if (isHtmlFile && !isLoginPage && !isOdooAuthPage && requestPath !== '/') {
    const session = requireSession(req);
    if (!session) {
      const next = encodeURIComponent(requestPath);
      res.writeHead(302, { 'Location': `/login.html?next=${next}` });
      res.end();
      return;
    }
  }

  serveStatic(res, filePath);
}

const server = http.createServer((req, res) => {
  Promise.resolve(handleRequest(req, res)).catch((error) => {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal server error: ' + (error && error.message ? error.message : 'Unknown error'));
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    const interfaces = require('os').networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push('http://' + iface.address + ':' + PORT);
        }
      }
    }
    console.log('🚀 Jira Dashboard listening on:');
    addresses.forEach(a => console.log('   ' + a));
    console.log('   Press Ctrl+C to stop');
  });
}

module.exports = {
  applyCorsHeaders,
  handleRequest,
  server
};
