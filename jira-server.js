// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const odooLoginHandler = require('./api/odoo/login');
const odooVerifyOtpHandler = require('./api/odoo/verify-otp');
const odooMeHandler = require('./api/odoo/me');
const odooLogoutHandler = require('./api/odoo/logout');

const JIRA_BASE = process.env.JIRA_BASE || 'https://20.84.97.109:3033';
const JIRA_TOKEN = process.env.JIRA_TOKEN || '';
const PORT = process.env.PORT || 3456;
const ROOT_DIR = __dirname;

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

function sendNotFound(res, message) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message || 'Not found');
}

async function handleOdooApi(req, res, requestPath) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

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

  if (requestPath === '/api/odoo/logout') {
    await odooLogoutHandler(req, res);
    return true;
  }

  return false;
}

async function handleRequest(req, res) {
  applyCorsHeaders(req, res);
  const requestPath = req.url.split('?')[0];

  if (requestPath.startsWith('/api/odoo/')) {
    const handled = await handleOdooApi(req, res, requestPath);
    if (!handled) {
      sendNotFound(res, `Not found: ${req.url}`);
    }
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Proxy Jira API (/jira/*)
  if (req.url.startsWith('/jira/')) {
    const target = JIRA_BASE + req.url.replace('/jira', '');
    const options = {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + JIRA_TOKEN, 'Content-Type': 'application/json' }
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
    return;
  }

  // Serve static files
  const relativePath = requestPath === '/' ? 'jira-dashboard.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.join(ROOT_DIR, relativePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json'
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendNotFound(res, 'Not found: ' + req.url);
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(data);
    }
  });
}

const server = http.createServer((req, res) => {
  Promise.resolve(handleRequest(req, res)).catch((error) => {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal server error: ' + (error && error.message ? error.message : 'Unknown error'));
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('🚀 Jira Dashboard: http://localhost:' + PORT);
    console.log('   Press Ctrl+C to stop');
  });
}

module.exports = {
  applyCorsHeaders,
  handleRequest,
  server
};
