function normalizeWebhookPath(pathname) {
  const trimmed = String(pathname || '').trim();
  if (!trimmed) return '/github/webhook';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function writePlainResponse(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

module.exports = {
  normalizeWebhookPath,
  readRequestBody,
  writePlainResponse,
};
