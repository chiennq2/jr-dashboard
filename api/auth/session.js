const { requireSession } = require('../_auth');

module.exports = async (req, res) => {
  const session = requireSession(req);
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.status(200).json({
    authenticated: true,
    user: {
      email: session.email,
      name: session.name || session.email,
      picture: session.picture || ''
    },
    exp: session.exp
  });
};

