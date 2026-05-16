function sendJson(res, statusCode, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode).json(payload);
    return;
  }

  res.statusCode = statusCode;
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  if (typeof res.status === 'function' && typeof res.send === 'function') {
    res.status(statusCode).send(message);
    return;
  }

  res.statusCode = statusCode;
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  }
  res.end(String(message));
}

function redirect(res, location, statusCode) {
  const code = statusCode || 302;
  if (typeof res.status === 'function' && typeof res.setHeader === 'function' && typeof res.end === 'function') {
    res.status(code);
    res.setHeader('Location', location);
    res.end();
    return;
  }

  res.statusCode = code;
  res.setHeader('Location', location);
  res.end();
}

module.exports = {
  sendJson,
  sendText,
  redirect
};
