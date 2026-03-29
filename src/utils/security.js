const crypto = require('crypto');

function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyGitHubSignature(body, signatureHeader, secret) {
  if (!secret) return false;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const digest = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  const expected = `sha256=${digest}`;
  return timingSafeEqualString(expected, signatureHeader);
}

module.exports = {
  verifyGitHubSignature,
};
