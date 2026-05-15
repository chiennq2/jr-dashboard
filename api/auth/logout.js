const { clearAuthCookies } = require('../_auth');

module.exports = async (_req, res) => {
  clearAuthCookies(res);
  res.statusCode = 302;
  res.setHeader('Location', '/login.html');
  res.end();
};

