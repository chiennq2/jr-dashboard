const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const JIRA_BASE = 'https://20.84.97.109:3033';
const JIRA_TOKEN = process.env.JIRA_TOKEN || '';
const PORT = 3456;
const ROOT_DIR = __dirname;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

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
  const requestPath = req.url.split('?')[0];
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
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + req.url);
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log('🚀 Jira Dashboard: http://localhost:' + PORT);
  console.log('   Press Ctrl+C to stop');
});
