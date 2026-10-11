import { randomBytes } from 'node:crypto';

// sid -> { csrfToken, email }
export const sessions = new Map();

export function newToken() { return randomBytes(16).toString('hex'); }

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function getSession(req) {
  const sid = parseCookies(req).sid;
  return sid ? sessions.get(sid) : undefined;
}

export function createSession(email) {
  const sid = newToken();
  const csrfToken = newToken();
  sessions.set(sid, { csrfToken, email });
  return { sid, csrfToken };
}
