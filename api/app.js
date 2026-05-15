const fs = require('fs');
const path = require('path');
const { requireSession } = require('./_auth');

module.exports = async (req, res) => {
  const session = requireSession(req);
  if (!session) {
    const next = encodeURIComponent(req.url || '/');
    res.statusCode = 302;
    res.setHeader('Location', `/login.html?next=${next}`);
    res.end();
    return;
  }

  const htmlPath = path.join(process.cwd(), 'jira-dashboard.html');
  fs.readFile(htmlPath, (err, data) => {
    if (err) {
      res.status(500).send('Unable to load dashboard');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(data);
  });
};

