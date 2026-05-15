const https = require('https');
const { requireSession } = require('./_auth');

function normalizePath(pathValue) {
  return String(pathValue || '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

function joinUrl(base, path, query) {
  const cleanBase = String(base || '').replace(/\/+$/, '');
  const cleanPath = normalizePath(path);
  return `${cleanBase}/${cleanPath}${query ? `?${query}` : ''}`;
}

function avoidDuplicateRestPrefix(base, path) {
  const baseHasRest = /\/rest\/api\/2\/?$/i.test(base);
  const normalizedPath = normalizePath(path);
  if (!baseHasRest) return normalizedPath;
  if (normalizedPath.toLowerCase().startsWith('rest/api/2/')) {
    return normalizedPath.slice('rest/api/2/'.length);
  }
  if (normalizedPath.toLowerCase() === 'rest/api/2') {
    return '';
  }
  return normalizedPath;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = requireSession(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const jiraBase = process.env.JIRA_BASE || '';
  const jiraToken = process.env.JIRA_TOKEN || '';
  const allowSelfSigned = String(process.env.JIRA_ALLOW_SELF_SIGNED || '').toLowerCase() === 'true';
  const httpsAgent = allowSelfSigned ? new https.Agent({ rejectUnauthorized: false }) : undefined;

  if (!jiraBase || !jiraToken) {
    res.status(500).json({ error: 'Missing JIRA_BASE or JIRA_TOKEN environment variables' });
    return;
  }

  const { path, ...restQuery } = req.query || {};
  const rawPath = Array.isArray(path) ? path.join('/') : path;
  const safePath = avoidDuplicateRestPrefix(jiraBase, rawPath);
  const targetUrl = joinUrl(jiraBase, safePath, new URLSearchParams(restQuery).toString());

  const upstream = https.request(
    targetUrl,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jiraToken}`,
        'Content-Type': 'application/json'
      },
      rejectUnauthorized: !allowSelfSigned,
      agent: httpsAgent
    },
    (upstreamRes) => {
      let body = '';
      upstreamRes.on('data', (chunk) => {
        body += chunk;
      });
      upstreamRes.on('end', () => {
        res.status(upstreamRes.statusCode || 502);
        res.setHeader('Content-Type', upstreamRes.headers['content-type'] || 'application/json');
        res.send(body);
      });
    }
  );

  upstream.on('error', (err) => {
    res.status(502).json({ error: `Proxy error: ${err.message}`, targetUrl });
  });

  upstream.end();
};
