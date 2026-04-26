'use strict';

const crypto = require('crypto');

const LAUNCH_TOKEN = crypto.randomBytes(32).toString('hex');

const ALLOWED_HOSTS = new Set([
  `localhost:${process.env.VORDBESTE_PORT || 3456}`,
  `127.0.0.1:${process.env.VORDBESTE_PORT || 3456}`,
  // Vite dev server proxies to us with its own host header; it forwards original
  `localhost:5173`,
  `127.0.0.1:5173`,
]);

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function hostGuard(req, res, next) {
  const host = (req.headers.host || '').toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return res.status(403).json({ error: 'Forbidden host' });
  }
  next();
}

function tokenGuard(req, res, next) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const provided = m ? m[1].trim() : (req.headers['x-vordbeste-token'] || '');
  if (!timingSafeEqualStr(provided, LAUNCH_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function getLaunchToken() {
  return LAUNCH_TOKEN;
}

module.exports = { hostGuard, tokenGuard, getLaunchToken };
