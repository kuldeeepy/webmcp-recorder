const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const resultsEl = document.getElementById('results');
const detailEl = document.getElementById('detail');
const dialog = document.getElementById('refund-dialog');
const form = document.getElementById('refund-form');
const errorEl = document.getElementById('refund-error');
const toast = document.getElementById('toast');

let currentOrder = null;
let amountValue = 0; // controlled: updated only via the input event, like React state

async function search(q) {
  const res = await fetch(`/api/orders?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  renderResults(data.orders);
}

function renderResults(list) {
  resultsEl.innerHTML = list.map((o) => `
    <article class="order-card${o.refunded ? ' refunded' : ''}" data-order="${o.orderNumber}">
      <h3>${o.orderNumber}</h3>
      <p>${o.customer}</p>
      <p>Total: ₹${o.total}${o.refunded ? ' — <span class="badge-refunded">Refunded</span>' : ''}</p>
      <button type="button" class="open-btn" data-order="${o.orderNumber}">Open</button>
    </article>`).join('') || '<p>No orders found.</p>';
}

resultsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.open-btn');
  if (!btn) return;
  openDetail(btn.dataset.order);
});

async function openDetail(orderNumber) {
  const res = await fetch(`/api/orders?q=${encodeURIComponent(orderNumber)}`);
  const data = await res.json();
  currentOrder = data.orders.find((o) => o.orderNumber === orderNumber);
  if (!currentOrder) return;
  detailEl.innerHTML = `
    <h2>${currentOrder.orderNumber}</h2>
    <p>Customer: ${currentOrder.customer}</p>
    <p>Total: ₹${currentOrder.total}</p>
    ${currentOrder.refunded ? '<p class="badge-refunded">Refunded</p>' : '<button type="button" id="refund-btn">Issue refund</button>'}`;
}

detailEl.addEventListener('click', (e) => {
  if (e.target.id === 'refund-btn') openRefundDialog();
});

function openRefundDialog() {
  errorEl.textContent = '';
  form.reset();
  amountValue = 0;
  dialog.showModal();
}

document.getElementById('refund-amount').addEventListener('input', (e) => {
  amountValue = Number(e.target.value); // controlled value, not read from input.value at submit time
});

document.getElementById('refund-cancel').addEventListener('click', () => dialog.close());

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const reason = document.getElementById('refund-reason').value;
  const notes = document.getElementById('refund-notes').value;
  const res = await fetch('/api/refunds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderNumber: currentOrder.orderNumber,
      amount: amountValue,
      reason,
      notes,
      csrfToken,
      clientInfo: { app: 'opsdesk', build: '2026.10.1' },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    errorEl.textContent = (data.errors && data.errors[0]) || data.error || 'Refund failed';
    return;
  }
  dialog.close();
  showToast(data.message);
  openDetail(currentOrder.orderNumber);
  search(document.getElementById('order-q').value);
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  search(document.getElementById('order-q').value);
});

search(''); // show all orders on load
