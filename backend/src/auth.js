import crypto from 'node:crypto';

// One shared access code (SUMIKA_ACCESS_TOKEN) gates everything that can reach
// into the owner's real browser. Unset means that feature is simply off, so a
// deployment that forgot to configure it fails closed instead of open.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

export function tokenMatches(candidate) {
  const expected = process.env.SUMIKA_ACCESS_TOKEN;
  if (!expected || !candidate) return false;
  return crypto.timingSafeEqual(digest(candidate), digest(expected));
}

// Running on your own machine and reached from your own machine: no code
// needed. Both checks matter - Render sets RENDER, and a tunnel forwarding to
// localhost still arrives with its public Host header, so it isn't "local".
export function isLocalDev(req) {
  if (process.env.RENDER) return false;
  if (!LOOPBACK.has(req.socket?.remoteAddress)) return false;
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  return LOCAL_HOSTS.has(host);
}

export function isTrusted(req) {
  return isLocalDev(req) || tokenMatches(req.headers['x-sumika-token']);
}
