const https = require('https');

function buildTargetUrl(base, pathSegments, query) {
  const cleanBase = String(base || '').replace(/\/+$/, '');
  const safePath = (pathSegments || []).map(encodeURIComponent).join('/');
  return `${cleanBase}/${safePath}${query ? `?${query}` : ''}`;
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

  const jiraBase = process.env.JIRA_BASE || '';
  const jiraToken = process.env.JIRA_TOKEN || '';
  if (!jiraBase || !jiraToken) {
    res.status(500).json({ error: 'Missing JIRA_BASE or JIRA_TOKEN environment variables' });
    return;
  }

  const pathSegments = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
  const query = new URLSearchParams({ ...req.query });
  query.delete('path');
  const targetUrl = buildTargetUrl(jiraBase, pathSegments, query.toString());

  const upstream = https.request(
    targetUrl,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jiraToken}`,
        'Content-Type': 'application/json'
      }
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
    res.status(502).json({ error: `Proxy error: ${err.message}` });
  });

  upstream.end();
};

