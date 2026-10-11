import { CITIES, REASONS, ui } from './store.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Shared page shell: nav bar + csrf meta tag on every authenticated page.
function layout({ title, csrfToken, body, script = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="${esc(csrfToken)}">
<title>${esc(title)} · Opsdesk</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<header class="topbar">
  <span class="brand">Opsdesk</span>
  <nav aria-label="Primary">
    <a href="/orders">Orders</a>
    <a href="/customers/new">Add customer</a>
    <a href="/customers">Customers</a>
    <form method="post" action="/logout" class="inline-form">
      <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
      <button type="submit">Sign out</button>
    </form>
  </nav>
</header>
<main id="main">${body}</main>
${script}
</body>
</html>`;
}

export function loginPage({ error } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · Opsdesk</title>
<link rel="stylesheet" href="/app.css">
</head>
<body class="centered">
<main class="auth-card">
  <h1>Opsdesk sign in</h1>
  ${error ? `<p role="alert" class="error">${esc(error)}</p>` : ''}
  <form method="post" action="/login">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" required autocomplete="username">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required autocomplete="current-password">
    <p class="hint">Demo password: demo</p>
    <button type="submit">Sign in</button>
  </form>
</main>
</body>
</html>`;
}

export function ordersPage({ csrfToken }) {
  const body = `
<h1>Orders</h1>
<form id="search-form" class="search-form">
  <label for="order-q">Order number</label>
  <input id="order-q" name="q" type="search" placeholder="ORD-1001">
  <button type="submit">Search</button>
</form>
<section id="results" aria-live="polite"></section>
<section id="detail"></section>
<dialog id="refund-dialog" aria-label="Issue refund">
  <form id="refund-form">
    <h2>Issue refund</h2>
    <label for="refund-amount">Refund amount (₹)</label>
    <input id="refund-amount" type="number" min="1" step="1" required>
    <label for="refund-reason">Reason</label>
    <select id="refund-reason" required>
      ${Object.entries(REASONS).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}
    </select>
    <label for="refund-notes">Notes</label>
    <textarea id="refund-notes" rows="3"></textarea>
    <p id="refund-error" role="alert" class="error"></p>
    <div class="dialog-actions">
      <button type="button" id="refund-cancel">Cancel</button>
      <button type="submit">${ui.redesigned ? 'Process refund now' : 'Confirm refund'}</button>
    </div>
  </form>
</dialog>
<div id="toast" role="status"></div>`;
  return layout({ title: 'Orders', csrfToken, body, script: '<script src="/orders.js" type="module"></script>' });
}

export function customerFormPage({ csrfToken, error, values = {} }) {
  const v = (k) => esc(values[k] || '');
  const body = `
<h1>Add customer</h1>
${error ? `<p role="alert" class="error">${esc(error)}</p>` : ''}
<form method="post" action="/customers">
  <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
  <label for="name">Full name</label>
  <input id="name" name="name" value="${v('name')}" required minlength="3">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" value="${v('email')}" required>
  <label for="phone">Phone</label>
  <input id="phone" name="phone" value="${v('phone')}" required>
  <label for="city">City</label>
  <select id="city" name="city" required>
    <option value="" disabled ${!values.city ? 'selected' : ''}>Choose a city</option>
    ${CITIES.map((c) => `<option value="${esc(c)}" ${values.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
  </select>
  <label for="gstin">GSTIN (optional)</label>
  <input id="gstin" name="gstin" value="${v('gstin')}">
  <button type="submit">Add customer</button>
</form>`;
  return layout({ title: 'Add customer', csrfToken, body });
}

export function customersPage({ csrfToken, customers, added }) {
  const body = `
<h1>Customers</h1>
${added ? `<p role="status" class="banner">Customer ${esc(added)} added</p>` : ''}
<table>
  <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>City</th></tr></thead>
  <tbody>
    ${customers.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td><td>${esc(c.city)}</td></tr>`).join('')}
  </tbody>
</table>`;
  return layout({ title: 'Customers', csrfToken, body });
}
