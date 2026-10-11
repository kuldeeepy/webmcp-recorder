import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSession, createSession, sessions, parseCookies } from './lib/auth.js';
import { orders, findOrder, refunds, nextRefundId, resetState, customers, CITIES, REASONS, ui } from './lib/store.js';
import { loginPage, ordersPage, customerFormPage, customersPage } from './lib/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4791;

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
}
function json(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
}
function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
function parseUrlEncoded(str) {
  const out = {};
  for (const part of str.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

const MIME = { '.css': 'text/css', '.js': 'text/javascript' };
async function serveStatic(req, res, pathname) {
  const file = path.join(__dirname, 'public', pathname);
  try {
    const data = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
    return true;
  } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // Test-only endpoints: no auth, reset/inspect in-memory state for fixture runs.
  if (pathname === '/api/_redesign' && method === 'POST') { // test-only: rename the refund button
    ui.redesigned = url.searchParams.get('on') !== '0';
    return json(res, 200, { redesigned: ui.redesigned });
  }
  if (pathname === '/api/_reset' && method === 'POST') {
    resetState();
    return json(res, 200, { ok: true });
  }
  if (pathname === '/api/_state' && method === 'GET') {
    return json(res, 200, { refunds: Array.from(refunds.values()), customers });
  }

  if ((pathname === '/app.css' || pathname === '/orders.js') && method === 'GET') {
    if (await serveStatic(req, res, pathname)) return;
  }

  const session = getSession(req);
  const isApi = pathname.startsWith('/api/');

  if (pathname === '/login' && method === 'GET') {
    if (session) return redirect(res, '/orders');
    return send(res, 200, loginPage());
  }
  if (pathname === '/login' && method === 'POST') {
    const form = parseUrlEncoded(await readBody(req));
    if (form.password !== 'demo' || !form.email) {
      return send(res, 401, loginPage({ error: 'Invalid email or password' }));
    }
    const { sid, csrfToken } = createSession(form.email);
    void csrfToken;
    res.writeHead(303, { Location: '/orders', 'Set-Cookie': `sid=${sid}; HttpOnly; Path=/; SameSite=Lax` });
    return res.end();
  }
  if (pathname === '/logout' && method === 'POST') {
    const sid = parseCookies(req).sid;
    if (sid) sessions.delete(sid);
    res.writeHead(303, { Location: '/login', 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' });
    return res.end();
  }

  // Everything below requires a valid session cookie.
  if (!session) {
    return isApi ? json(res, 401, { error: 'Not signed in' }) : redirect(res, '/login');
  }

  if (pathname === '/orders' && method === 'GET') {
    return send(res, 200, ordersPage({ csrfToken: session.csrfToken }));
  }

  if (pathname === '/api/orders' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const matches = orders
      .filter((o) => !q || o.orderNumber.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q))
      .map((o) => ({ ...o, refunded: refunds.has(o.orderNumber) }));
    return json(res, 200, { orders: matches });
  }

  if (pathname === '/api/refunds' && method === 'POST') {
    let data;
    try { data = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
    if (data.csrfToken !== session.csrfToken) return json(res, 403, { error: 'Invalid security token' });
    const order = findOrder(data.orderNumber);
    if (!order) return json(res, 404, { error: `Order ${data.orderNumber} not found` });
    if (refunds.has(order.orderNumber)) return json(res, 409, { error: `Order ${order.orderNumber} was already refunded` });
    const amount = Number(data.amount);
    if (!(amount > 0) || amount > order.total) {
      return json(res, 422, { errors: [`Refund can't be more than the order total (₹${order.total})`] });
    }
    if (!REASONS[data.reason]) return json(res, 422, { errors: ['Invalid reason'] });
    const refundId = nextRefundId();
    refunds.set(order.orderNumber, { refundId, orderNumber: order.orderNumber, amount, reason: data.reason, notes: data.notes || '' });
    return json(res, 201, { message: `Refund of ₹${amount} issued for ${order.orderNumber}`, refundId });
  }

  if (pathname === '/customers/new' && method === 'GET') {
    return send(res, 200, customerFormPage({ csrfToken: session.csrfToken }));
  }

  if (pathname === '/customers' && method === 'POST') {
    const form = parseUrlEncoded(await readBody(req));
    const fail = (msg) => send(res, 422, customerFormPage({ csrfToken: session.csrfToken, error: msg, values: form }));
    if (form._csrf !== session.csrfToken) return send(res, 403, customerFormPage({ csrfToken: session.csrfToken, error: 'Invalid security token', values: form }));
    if (!form.name || form.name.trim().length < 3) return fail('Full name must be at least 3 characters');
    if (!/^\S+@\S+\.\S+$/.test(form.email || '')) return fail('Enter a valid email address');
    if (!/^\+?\d{10,13}$/.test(form.phone || '')) return fail('Phone must be 10-13 digits');
    if (!CITIES.includes(form.city)) return fail('Choose a valid city');
    customers.push({ name: form.name, email: form.email, phone: form.phone, city: form.city, gstin: form.gstin || '' });
    return redirect(res, `/customers?added=${encodeURIComponent(form.name)}`);
  }

  if (pathname === '/customers' && method === 'GET') {
    return send(res, 200, customersPage({ csrfToken: session.csrfToken, customers, added: url.searchParams.get('added') }));
  }

  return send(res, 404, '<h1>Not found</h1>', { 'Content-Type': 'text/html' });
});

server.listen(PORT, () => console.log(`Opsdesk fixture running on http://localhost:${PORT}`));
