import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4790;
const TOKEN = randomBytes(16).toString('hex'); // random per server start

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let invoices = []; // in-memory store

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function checkAuth(req) {
  const header = req.headers['authorization'] || '';
  return header === `Bearer ${TOKEN}`;
}

function validateInvoice(body) {
  const vendor = body.vendor || {};
  if (!vendor.name || !vendor.gstin || !body.invoiceNo || !body.date || body.amount == null) {
    return 'Missing required fields';
  }
  if (!GSTIN_RE.test(vendor.gstin)) {
    return 'GSTIN is not valid';
  }
  if (!DATE_RE.test(body.date)) {
    return 'Invoice date must be in YYYY-MM-DD format';
  }
  if (!(Number(body.amount) > 0)) {
    return 'Amount must be greater than 0';
  }
  return null;
}

async function serveFile(res, path, type) {
  const content = await readFile(join(__dirname, path));
  res.writeHead(200, { 'content-type': type });
  res.end(content);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // static files
  if (req.method === 'GET' && url.pathname === '/') {
    return serveFile(res, 'index.html', 'text/html');
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    return serveFile(res, 'app.js', 'application/javascript');
  }

  // login - no auth required
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const body = await readBody(req).catch(() => ({}));
    if (!body.email || body.password !== 'demo') {
      return json(res, 401, { error: 'Invalid email or password' });
    }
    return json(res, 200, { token: TOKEN });
  }

  // test-only reset, no auth
  if (req.method === 'POST' && url.pathname === '/api/_reset') {
    invoices = [];
    return json(res, 200, { ok: true });
  }

  // everything below requires auth
  if (url.pathname.startsWith('/api/')) {
    if (!checkAuth(req)) {
      return json(res, 401, { error: 'Missing or invalid authorization token' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/invoices') {
    return json(res, 200, [...invoices].reverse());
  }

  if (req.method === 'POST' && url.pathname === '/api/invoices') {
    const body = await readBody(req).catch(() => null);
    if (!body) return json(res, 400, { error: 'Invalid JSON body' });
    const validationError = validateInvoice(body);
    if (validationError) return json(res, 400, { error: validationError });
    if (invoices.some((inv) => inv.invoiceNo === body.invoiceNo)) {
      return json(res, 409, { error: `Invoice ${body.invoiceNo} already exists` });
    }
    const invoice = { id: randomUUID(), ...body, createdAt: new Date().toISOString() };
    invoices.push(invoice);
    return json(res, 201, { id: invoice.id, invoiceNo: invoice.invoiceNo, message: `Invoice ${invoice.invoiceNo} saved` });
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`VendorDesk running at http://localhost:${PORT}`);
});
