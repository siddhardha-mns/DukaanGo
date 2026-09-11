/**
 * customer.js — Core application logic for DukaanGo Customer Panel
 */
const BACKEND = 'http://127.0.0.1:5005';
const TOKEN_KEY = 'lc_customer_token';
const NAME_KEY = 'lc_customer_name';

let catalogItems = [];
let activeCategory = 'All';
let lastOrderData = null;

/* ─── View Router ─── */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
  updateNav();
  if (name === 'catalog') loadCatalog();
  if (name === 'checkout') renderCheckout();
  if (name === 'confirm') renderConfirmation();
}

function updateNav() {
  const token = localStorage.getItem(TOKEN_KEY);
  const name = localStorage.getItem(NAME_KEY);
  document.getElementById('navUser').textContent = token && name ? name : '';
  document.getElementById('navLogout').style.display = token ? '' : 'none';
  document.getElementById('navCartBtn').style.display = token ? '' : 'none';
}

/* ─── Auth ─── */
function initAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) { showView('catalog'); return; }
  showView('auth');
}

function switchAuthTab(tab) {
  document.getElementById('authPanelLogin').classList.toggle('active', tab === 'login');
  document.getElementById('authPanelRegister').classList.toggle('active', tab === 'register');
  document.getElementById('authTabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('authTabRegister').classList.toggle('active', tab === 'register');
  hideAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg; el.classList.add('show');
}
function hideAuthError() { document.getElementById('authError').classList.remove('show'); }

async function handleLogin(e) {
  e.preventDefault(); hideAuthError();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email) { showAuthError('Please enter your email'); return; }
  if (!password) { showAuthError('Please enter your password'); return; }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const res = await fetch(`${BACKEND}/customer/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(NAME_KEY, data.name || 'Customer');
      showView('catalog');
    } else {
      showAuthError(data.message || 'Login failed');
    }
  } catch (_) { showAuthError('Cannot reach server. Is the backend running?'); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
}

async function handleRegister(e) {
  e.preventDefault(); hideAuthError();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirm').value;
  if (!name) { showAuthError('Name is required'); return; }
  if (!email) { showAuthError('Email is required'); return; }
  if (password.length < 8) { showAuthError('Password must be at least 8 characters'); return; }
  if (password !== confirm) { showAuthError('Passwords do not match'); return; }

  const btn = document.getElementById('regBtn');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const res = await fetch(`${BACKEND}/customer/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if ((res.status === 201 || res.ok) && data.ok) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(NAME_KEY, data.name || name);
      showView('catalog');
    } else {
      showAuthError(data.message || 'Registration failed');
    }
  } catch (_) { showAuthError('Cannot reach server. Is the backend running?'); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
}

function handleLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  cart.clear();
  showView('auth');
}

/* ─── Catalog ─── */
async function loadCatalog() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin" style="font-size:24px"></i><div style="margin-top:8px">Loading products...</div></div>';

  try {
    const res = await fetch(`${BACKEND}/customer/catalog`);
    const data = await res.json();
    if (data.ok) {
      catalogItems = data.items || [];
      renderCategories(data.categories || []);
      renderProducts();
    } else {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--red)">Failed to load catalog</div>';
    }
  } catch (_) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--red)"><i class="fas fa-exclamation-triangle" style="font-size:24px;display:block;margin-bottom:8px"></i>Cannot reach server</div>';
  }
}

function renderCategories(cats) {
  const bar = document.getElementById('catBar');
  if (!bar) return;
  bar.innerHTML = '<button class="cat-pill active" data-cat="All">All</button>';
  cats.forEach(c => {
    bar.innerHTML += `<button class="cat-pill" data-cat="${esc(c)}">${esc(c)}</button>`;
  });
  bar.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      bar.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCategory = pill.dataset.cat;
      renderProducts();
    });
  });
}

function emoji(name) {
  const n = name.toLowerCase();
  if (/rice/.test(n)) return '🍚'; if (/milk/.test(n)) return '🥛';
  if (/butter/.test(n)) return '🧈'; if (/oil/.test(n)) return '🫒';
  if (/sugar/.test(n)) return '🍬'; if (/flour|atta/.test(n)) return '🌾';
  if (/soap|shampoo|detergent/.test(n)) return '🧴'; if (/chocolate|silk/.test(n)) return '🍫';
  if (/tea/.test(n)) return '🍵'; if (/coffee/.test(n)) return '☕';
  if (/bread/.test(n)) return '🍞'; if (/juice|drink|coke|pepsi/.test(n)) return '🥤';
  if (/dal|beans/.test(n)) return '🫘'; if (/maggi|noodle/.test(n)) return '🍜';
  return '📦';
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function renderProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  const filtered = activeCategory === 'All' ? catalogItems : catalogItems.filter(i => i.category === activeCategory);

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)"><i class="fas fa-box-open" style="font-size:32px;display:block;margin-bottom:8px;opacity:0.4"></i>No products in this category</div>';
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const inCart = cart.getItem(item.id);
    const qty = inCart ? inCart.qty : 0;
    return `
      <div class="p-card" data-id="${item.id}">
        <span class="p-card-emoji">${emoji(item.name)}</span>
        <div class="p-card-name">${esc(item.name)}</div>
        <div class="p-card-te">${item.nameTE ? esc(item.nameTE) : ''}</div>
        <div class="p-card-cat">${esc(item.category)}</div>
        <div class="p-card-price">₹${item.price}</div>
        <div class="p-card-unit">per ${item.unit || 'unit'}</div>
        <div class="p-card-stock">${Math.floor(item.qty)} available</div>
        <div class="qty-row">
          <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
          <span class="qty-val" id="qty-${item.id}">${qty}</span>
          <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
        </div>
        <button class="add-btn ${inCart ? 'in-cart' : ''}" id="addBtn-${item.id}"
          onclick="addToCart(${item.id})" ${qty === 0 && !inCart ? '' : ''}>
          ${inCart ? '<i class="fas fa-check"></i> In Cart' : '<i class="fas fa-cart-plus"></i> Add to Cart'}
        </button>
      </div>`;
  }).join('');
}

function changeQty(id, delta) {
  const item = catalogItems.find(i => i.id === id);
  if (!item) return;
  const el = document.getElementById('qty-' + id);
  let current = parseInt(el.textContent) || 0;
  current = Math.max(0, Math.min(current + delta, Math.floor(item.qty)));
  el.textContent = current;
  // If in cart, update cart qty too
  const inCart = cart.getItem(id);
  if (inCart) cart.updateQty(id, current);
}

function addToCart(id) {
  const item = catalogItems.find(i => i.id === id);
  if (!item) return;
  const qtyEl = document.getElementById('qty-' + id);
  let qty = parseInt(qtyEl.textContent) || 0;
  if (qty === 0) qty = 1;
  qtyEl.textContent = qty;

  const existing = cart.getItem(id);
  if (existing) {
    cart.updateQty(id, qty);
  } else {
    cart.add({ id: item.id, name: item.name, nameTE: item.nameTE, unit: item.unit, price: item.price, qty, maxQty: Math.floor(item.qty) });
  }
  renderProducts();
}

/* ─── Cart Sidebar Rendering ─── */
function renderCart() {
  const list = document.getElementById('cartList');
  const emptyEl = document.getElementById('cartEmpty');
  const footerEl = document.getElementById('cartFooter');
  const badge = document.getElementById('cartBadge');
  const count = cart.count();

  badge.textContent = count; badge.style.display = count > 0 ? '' : 'none';

  if (count === 0) {
    if (list) list.innerHTML = '';
    if (emptyEl) emptyEl.style.display = '';
    if (footerEl) footerEl.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (footerEl) footerEl.style.display = '';

  if (list) {
    list.innerHTML = cart.items.map(i => `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${esc(i.name)}</div>
          <div class="cart-item-meta">${i.qty} × ₹${i.price}</div>
        </div>
        <div class="cart-item-price">₹${(i.qty * i.price).toFixed(0)}</div>
        <span class="cart-item-remove" onclick="cart.remove(${i.id})" title="Remove"><i class="fas fa-times"></i></span>
      </div>`).join('');
  }

  document.getElementById('cartTotal').textContent = '₹' + cart.total().toFixed(0);
}

document.addEventListener('cart-updated', () => { renderCart(); renderProducts(); });

/* ─── Checkout ─── */
function goToCheckout() {
  if (cart.count() === 0) return;
  showView('checkout');
}

function renderCheckout() {
  const el = document.getElementById('checkoutItems');
  if (!el) return;
  el.innerHTML = cart.items.map(i => `
    <div class="checkout-item">
      <span class="checkout-item-name">${esc(i.name)} × ${i.qty}</span>
      <span class="checkout-item-val">₹${(i.qty * i.price).toFixed(0)}</span>
    </div>`).join('');
  document.getElementById('checkoutTotal').textContent = '₹' + cart.total().toFixed(0);
  document.getElementById('checkoutError').classList.remove('show');
  selectPayment('COD');
}

let selectedPayment = 'COD';
function selectPayment(method) {
  selectedPayment = method;
  document.querySelectorAll('.radio-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.method === method);
    o.querySelector('input').checked = o.dataset.method === method;
  });
  document.getElementById('upiPlaceholder').style.display = method === 'UPI' ? '' : 'none';
}

async function placeOrder() {
  const addr = document.getElementById('deliveryAddress').value.trim();
  const errEl = document.getElementById('checkoutError');
  errEl.classList.remove('show');

  if (addr.length < 20) { errEl.textContent = 'Delivery address must be at least 20 characters'; errEl.classList.add('show'); return; }
  if (cart.count() === 0) { errEl.textContent = 'Your cart is empty'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true; btn.classList.add('loading');

  const token = localStorage.getItem(TOKEN_KEY);
  try {
    const res = await fetch(`${BACKEND}/customer/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        items: cart.items.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, unit: i.unit })),
        delivery_address: addr,
        payment_method: selectedPayment
      })
    });
    const data = await res.json();
    if ((res.status === 201 || res.ok) && data.ok) {
      lastOrderData = {
        order_id: data.order_id, total: data.total,
        estimated_minutes: data.estimated_minutes,
        items: [...cart.items], payment_method: selectedPayment
      };
      cart.clear();
      showView('confirm');
    } else {
      errEl.textContent = data.message || 'Order failed. Please try again.';
      errEl.classList.add('show');
    }
  } catch (_) {
    errEl.textContent = 'Cannot reach server. Please try again.';
    errEl.classList.add('show');
  } finally { btn.disabled = false; btn.classList.remove('loading'); }
}

/* ─── Confirmation ─── */
function renderConfirmation() {
  if (!lastOrderData) return;
  const d = lastOrderData;
  document.getElementById('confirmOrderId').textContent = '#' + d.order_id;
  document.getElementById('confirmTotal').textContent = '₹' + d.total.toFixed(0);
  document.getElementById('confirmPayment').textContent = d.payment_method;
  document.getElementById('confirmEta').textContent = '~' + d.estimated_minutes + ' minutes';
  const list = document.getElementById('confirmItemsList');
  list.innerHTML = d.items.map(i => `
    <div class="confirm-item">
      <span>${esc(i.name)} × ${i.qty}</span>
      <span>₹${(i.qty * i.price).toFixed(0)}</span>
    </div>`).join('');
}

function backToCatalog() {
  lastOrderData = null;
  showView('catalog');
}

/* ─── Mobile cart toggle ─── */
function toggleMobileCart() {
  const sidebar = document.querySelector('.cart-sidebar');
  if (sidebar) sidebar.classList.toggle('mobile-open');
}

/* ─── Init ─── */
window.addEventListener('DOMContentLoaded', () => {
  initAuth();
  renderCart();
});
