const { encryptAes256Cbc, decryptAes256Cbc } = require('./_crypto');

function getCookieHeader(req, name) {
  const raw = req.headers && req.headers.cookie ? String(req.headers.cookie) : '';
  if (!raw) {
    return '';
  }

  const parts = raw.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    if (key !== name) {
      continue;
    }
    return decodeURIComponent(part.slice(idx + 1).trim());
  }

  return '';
}

function makeCookie(name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax'
  ];

  if (typeof maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }

  return parts.join('; ');
}

function appendSetCookie(res, cookieValue) {
  const previous = res.getHeader ? res.getHeader('Set-Cookie') : null;
  if (!previous) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }
  if (Array.isArray(previous)) {
    res.setHeader('Set-Cookie', previous.concat(cookieValue));
    return;
  }
  res.setHeader('Set-Cookie', [previous, cookieValue]);
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function setEncryptedCookie(res, name, value, secret, maxAgeSeconds) {
  const encrypted = encryptAes256Cbc(value, secret);
  appendSetCookie(res, makeCookie(name, encrypted, maxAgeSeconds));
}

function getEncryptedCookie(req, name, secret) {
  const encrypted = getCookieHeader(req, name);
  if (!encrypted) {
    return '';
  }
  return decryptAes256Cbc(encrypted, secret);
}

function clearEncryptedCookie(res, name) {
  appendSetCookie(res, clearCookie(name));
}

module.exports = {
  getCookieHeader,
  makeCookie,
  appendSetCookie,
  clearCookie,
  setEncryptedCookie,
  getEncryptedCookie,
  clearEncryptedCookie
};
