const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const invoiceForm = document.getElementById('invoice-form');
const statusEl = document.getElementById('status');
const rowsEl = document.getElementById('invoice-rows');
const signoutBtn = document.getElementById('signout-btn');

const categoryLabels = {
  office_supplies: 'Office supplies',
  travel: 'Travel',
  software: 'Software',
  logistics: 'Logistics',
  utilities: 'Utilities',
};

function getToken() {
  return localStorage.getItem('token');
}

function showView() {
  const signedIn = !!getToken();
  loginView.hidden = signedIn;
  appView.hidden = !signedIn;
  if (signedIn) loadInvoices();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  loginStatus.textContent = '';
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    loginStatus.textContent = data.error || 'Sign in failed';
    return;
  }
  localStorage.setItem('token', data.token);
  showView();
});

signoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  showView();
});

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'error' : 'success';
}

invoiceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = invoiceForm;
  const payload = {
    vendor: { name: f.vendorName.value, gstin: f.gstin.value },
    invoiceNo: f.invoiceNo.value,
    date: f.date.value,
    amount: Number(f.amount.value),
    gstRate: Number(f.gstRate.value),
    category: f.category.value,
    notes: f.notes.value,
    source: 'web',
    clientVersion: '3.2.1',
  };
  const res = await fetch('/api/invoices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    setStatus(data.error || 'Could not save invoice', true);
    return;
  }
  setStatus(data.message, false);
  f.reset();
  f.gstRate.value = '12';
  loadInvoices();
});

async function loadInvoices() {
  const res = await fetch('/api/invoices', {
    headers: { authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return;
  const invoices = await res.json();
  rowsEl.innerHTML = invoices
    .map(
      (inv) => `<tr>
        <td>${escapeHtml(inv.vendor.name)}</td>
        <td>${escapeHtml(inv.vendor.gstin)}</td>
        <td>${escapeHtml(inv.invoiceNo)}</td>
        <td>${escapeHtml(inv.date)}</td>
        <td>₹${Number(inv.amount).toFixed(2)}</td>
        <td>${inv.gstRate}%</td>
        <td>${categoryLabels[inv.category] || inv.category}</td>
      </tr>`
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

showView();
