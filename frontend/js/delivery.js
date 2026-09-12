/* ============================================================
   delivery.js — DukaanGo Delivery Module
   Drives #sec-orders, #sec-delivery (owner), #sec-delivery (admin),
   and customer order-tracking.  Exposed as window.DeliveryModule.
   ============================================================ */

(function () {
  'use strict';

  const BACKEND = 'http://127.0.0.1:5005';
  const POLL_MS = 30_000; // auto-refresh every 30 s

  // Status display config — label, badge class, icon, next action label
  const STATUS_CFG = {
    pending:          { label: 'Pending',        badge: 'badge-warning',  icon: 'fa-clock',         next: 'Confirm',       nextStatus: 'confirmed' },
    confirmed:        { label: 'Confirmed',       badge: 'badge-info',     icon: 'fa-circle-check',  next: 'Mark Packed',   nextStatus: 'packed' },
    packed:           { label: 'Packed',          badge: 'badge-purple',   icon: 'fa-box',           next: 'Out for Delivery', nextStatus: 'out_for_delivery' },
    out_for_delivery: { label: 'Out for Delivery',badge: 'badge-purple',   icon: 'fa-truck-fast',    next: 'Mark Delivered', nextStatus: 'delivered' },
    delivered:        { label: 'Delivered',       badge: 'badge-success',  icon: 'fa-circle-check',  next: null,            nextStatus: null },
    cancelled:        { label: 'Cancelled',       badge: 'badge-danger',   icon: 'fa-circle-xmark',  next: null,            nextStatus: null },
  };

  const PARTNER_STATUS_CFG = {
    available: { label: 'Available', badge: 'badge-success' },
    busy:      { label: 'Busy',      badge: 'badge-warning' },
    offline:   { label: 'Offline',   badge: 'badge-danger'  },
  };

  // ── State ────────────────────────────────────────────────
  let _orders   = [];
  let _partners = [];
  let _pollTimer = null;
  let _activeStatusFilter = 'all'; // for orders tab
  let _searchQuery = '';
  let _knownOrderIds = null; // null = first load (don't fire notifications for existing orders)

  // ── Helpers ──────────────────────────────────────────────
  function apiBase() { return BACKEND; }

  async function apiFetch(path, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    // Attach owner token when available (unauthenticated endpoints work fine too)
    const token = localStorage.getItem('lc_auth_token') || sessionStorage.getItem('lc_auth_token');
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(apiBase() + path, opts);
    return res.json();
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return 'Today ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
           d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtAddr(addr) {
    if (!addr) return '—';
    return addr.length > 40 ? addr.slice(0, 40) + '…' : addr;
  }

  function toast(msg, type = 'success') {
    if (typeof showToast === 'function') showToast(msg, type);
    else console.log('[DeliveryModule]', msg);
  }

  function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  const GRADIENTS = ['var(--gradient-1)', 'var(--gradient-2)', 'var(--gradient-3)', 'var(--gradient-4)'];
  function gradientFor(id) { return GRADIENTS[(id || 0) % GRADIENTS.length]; }

  // ── Data layer ───────────────────────────────────────────

  async function fetchOrders() {
    try {
      const res = await apiFetch('/orders');
      if (res.ok && Array.isArray(res.data)) {
        const incoming = res.data;

        // Detect new orders (skip on first load to avoid flooding)
        if (_knownOrderIds !== null && typeof window.NotifEngine !== 'undefined') {
          incoming.forEach(o => {
            if (!_knownOrderIds.has(o.order_id)) {
              const itemCount = Array.isArray(o.items) ? o.items.length : '?';
              window.NotifEngine.addNotif(
                'new_order',
                `New Order #${o.order_id}`,
                `${o.customer_name || 'Customer'} — ${itemCount} item${itemCount !== 1 ? 's' : ''} · ₹${Number(o.total || 0).toFixed(0)}`,
                `new_order:${o.order_id}`
              );
            }
          });
        }

        // Update known IDs
        _knownOrderIds = new Set(incoming.map(o => o.order_id));
        _orders = incoming;
        return true;
      }
    } catch (e) { console.warn('[DeliveryModule] fetchOrders failed', e); }
    return false;
  }

  async function fetchPartners() {
    try {
      const res = await apiFetch('/delivery/partners');
      if (res.ok && Array.isArray(res.data)) {
        _partners = res.data;
        return true;
      }
    } catch (e) { console.warn('[DeliveryModule] fetchPartners failed', e); }
    return false;
  }

  async function advanceStatus(orderId, newStatus) {
    try {
      const res = await apiFetch(`/orders/${orderId}/status`, 'PATCH', { status: newStatus });
      if (res.ok) {
        // Optimistic update
        const o = _orders.find(x => x.order_id === orderId);
        if (o) o.status = newStatus;
        renderAll();
        toast(`Order #${orderId} → ${STATUS_CFG[newStatus]?.label || newStatus}`);

        // Notify + re-check inventory when an order is delivered
        if (newStatus === 'delivered' && typeof window.NotifEngine !== 'undefined') {
          const updatedItems = res.inventory_updated || [];
          const itemList = updatedItems.length
            ? updatedItems.map(i => i.name).join(', ')
            : 'inventory';
          window.NotifEngine.addNotif(
            'delivered',
            `Order #${orderId} Delivered`,
            `${itemList} updated automatically`,
            `delivered:${orderId}`,
            true // always show delivery confirmation
          );
          // Re-check inventory alerts after a short delay to catch newly low/zero items
          setTimeout(() => window.NotifEngine.checkInventoryAlerts(), 2000);
          // Also sync DataEngine so inventory table reflects new qtys
          if (typeof DataEngine !== 'undefined') {
            setTimeout(() => DataEngine.syncWithServer(), 1500);
          }
        }

        return true;
      }
      toast(res.message || 'Status update failed', 'error');
    } catch (e) {
      toast('Could not reach server', 'error');
    }
    return false;
  }

  async function togglePartnerStatus(partnerId, currentStatus) {
    const next = currentStatus === 'available' ? 'offline' :
                 currentStatus === 'offline'    ? 'available' : 'available';
    try {
      const res = await apiFetch(`/delivery/partners/${partnerId}/status`, 'PATCH', { status: next });
      if (res.ok) {
        const p = _partners.find(x => x.id === partnerId);
        if (p) p.status = next;
        renderDelivery();
        toast(`${p?.name || 'Partner'} marked ${next}`);
      } else {
        toast(res.message || 'Update failed', 'error');
      }
    } catch (e) { toast('Could not reach server', 'error'); }
  }

  async function addPartner(name, phone) {
    try {
      const res = await apiFetch('/delivery/partners', 'POST', { name, phone });
      if (res.ok) {
        _partners.push({ id: res.id, name: res.name, phone: res.phone, status: 'available' });
        renderDelivery();
        toast(`${name} added as delivery partner`);
        return true;
      }
      toast(res.message || 'Failed to add partner', 'error');
    } catch (e) { toast('Could not reach server', 'error'); }
    return false;
  }

  // ── Render: Orders section (#sec-orders) ─────────────────

  function renderOrders() {
    // Pipeline counts
    const counts = { pending: 0, confirmed: 0, packed: 0, out_for_delivery: 0, delivered: 0, cancelled: 0 };
    _orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    Object.keys(counts).forEach(s => {
      const el = document.getElementById('pipeCount-' + s);
      if (el) el.textContent = counts[s];
    });
    // Highlight active pipeline stage
    document.querySelectorAll('#orderPipeline .pipeline-stage').forEach(el => {
      el.classList.toggle('active', el.id === 'pipe-' + _activeStatusFilter);
    });

    // Filter + search
    const filtered = _orders.filter(o => {
      if (_activeStatusFilter !== 'all' && o.status !== _activeStatusFilter) return false;
      if (_searchQuery) {
        const q = _searchQuery.toLowerCase();
        return String(o.order_id).includes(q) ||
               (o.customer_name || '').toLowerCase().includes(q) ||
               (o.delivery_address || '').toLowerCase().includes(q);
      }
      return true;
    });

    const tbody = document.getElementById('orderTbody');
    const empty = document.getElementById('orderEmptyState');
    const loading = document.getElementById('orderLoadingState');
    if (!tbody) return;

    if (loading) loading.style.display = 'none';

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (empty) {
        empty.style.display = '';
        const msg = document.getElementById('orderEmptyMsg');
        if (msg) msg.textContent = _orders.length === 0
          ? 'No customer orders yet. Orders placed from the customer portal will appear here.'
          : 'No orders match this filter.';
      }
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = filtered.map(o => {
      const cfg = STATUS_CFG[o.status] || STATUS_CFG.pending;
      const initText = initials(o.customer_name);
      const grad = gradientFor(o.order_id);
      const itemCount = Array.isArray(o.items) ? o.items.length : '?';
      return `<tr data-order-id="${o.order_id}" data-status="${esc(o.status)}">
        <td class="font-bold">#${o.order_id}</td>
        <td>
          <div class="flex items-center gap-8">
            <div class="avatar" style="background:${grad};width:28px;height:28px;font-size:10px">${esc(initText)}</div>
            <div>
              <div class="text-sm font-bold">${esc(o.customer_name || 'Guest')}</div>
              ${o.customer_phone ? `<div class="text-xs text-muted">${esc(o.customer_phone)}</div>` : ''}
            </div>
          </div>
        </td>
        <td>${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
        <td class="font-bold">₹${Number(o.total || 0).toFixed(0)}</td>
        <td><span class="badge badge-info">${esc(o.payment_method || 'COD')}</span></td>
        <td><span class="badge ${cfg.badge}"><i class="fas ${cfg.icon}"></i> ${cfg.label}</span></td>
        <td class="text-muted text-xs">${fmtDate(o.date)}</td>
        <td>
          <div class="flex gap-6">
            <button class="btn btn-secondary btn-sm" data-action="view-order" data-id="${o.order_id}">View</button>
            ${cfg.nextStatus ? `<button class="btn btn-primary btn-sm" data-action="advance-order" data-id="${o.order_id}" data-next="${cfg.nextStatus}">${cfg.next}</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Render: Delivery section (#sec-delivery) ─────────────

  function renderDelivery() {
    const today = new Date().toDateString();
    const deliveredToday = _orders.filter(o =>
      o.status === 'delivered' && new Date(o.date).toDateString() === today
    ).length;
    const inTransit   = _orders.filter(o => o.status === 'out_for_delivery').length;
    const availableP  = _partners.filter(p => p.status === 'available').length;

    _setText('dlv-stat-delivered', deliveredToday);
    _setText('dlv-stat-transit',   inTransit);
    _setText('dlv-stat-partners',  availableP);

    // Active deliveries list
    const activeOrders = _orders.filter(o => o.status === 'out_for_delivery');
    const activeList = document.getElementById('dlvActiveList');
    const activeCount = document.getElementById('dlv-active-count');
    if (activeCount) activeCount.textContent = activeOrders.length + ' order' + (activeOrders.length !== 1 ? 's' : '');
    if (activeList) {
      if (activeOrders.length === 0) {
        activeList.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted,#888)">
          <i class="fas fa-check-circle" style="font-size:28px;display:block;margin-bottom:8px;opacity:0.3;color:var(--accent-green)"></i>
          <div class="text-xs">No active deliveries right now</div>
        </div>`;
      } else {
        activeList.innerHTML = activeOrders.map(o => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg-glass);border-radius:var(--radius-md)">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="avatar" style="background:${gradientFor(o.order_id)};width:32px;height:32px;font-size:11px">${esc(initials(o.customer_name))}</div>
              <div>
                <div class="text-sm font-bold">#${o.order_id} — ${esc(o.customer_name || 'Guest')}</div>
                <div class="text-xs text-muted">${esc(fmtAddr(o.delivery_address))}</div>
              </div>
            </div>
            <button class="btn btn-primary btn-sm" data-action="advance-order" data-id="${o.order_id}" data-next="delivered">
              <i class="fas fa-circle-check"></i> Delivered
            </button>
          </div>`).join('');
      }
    }

    // Partners roster
    const partnersList = document.getElementById('dlvPartnersList');
    const partnersSub  = document.getElementById('dlv-partners-subtitle');
    if (partnersSub) partnersSub.textContent = `${_partners.length} partner${_partners.length !== 1 ? 's' : ''} registered`;
    if (partnersList) {
      if (_partners.length === 0) {
        partnersList.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted,#888)" class="text-xs">No partners yet — add one above.</div>`;
      } else {
        partnersList.innerHTML = _partners.map(p => {
          const cfg = PARTNER_STATUS_CFG[p.status] || PARTNER_STATUS_CFG.offline;
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg-glass);border-radius:var(--radius-md)">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="avatar" style="background:${gradientFor(p.id)}">${esc(initials(p.name))}</div>
              <div>
                <div class="text-sm font-bold">${esc(p.name)}</div>
                ${p.phone ? `<div class="text-xs text-muted">${esc(p.phone)}</div>` : ''}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge ${cfg.badge}">${cfg.label}</span>
              <button class="btn btn-ghost btn-sm" data-action="toggle-partner" data-id="${p.id}" data-status="${p.status}" title="Toggle availability">
                <i class="fas fa-power-off"></i>
              </button>
            </div>
          </div>`;
        }).join('');
      }
    }

    // Pending action queue (pending + confirmed + packed)
    const actionable = _orders.filter(o => ['pending','confirmed','packed'].includes(o.status));
    const pendingTbody = document.getElementById('dlvPendingTbody');
    const pendingEmpty = document.getElementById('dlvPendingEmpty');
    const pendingCount = document.getElementById('dlv-pending-count');
    if (pendingCount) pendingCount.textContent = actionable.length + ' pending';
    if (pendingTbody) {
      if (actionable.length === 0) {
        pendingTbody.innerHTML = '';
        if (pendingEmpty) pendingEmpty.style.display = '';
      } else {
        if (pendingEmpty) pendingEmpty.style.display = 'none';
        pendingTbody.innerHTML = actionable.map(o => {
          const cfg = STATUS_CFG[o.status];
          return `<tr>
            <td class="font-bold">#${o.order_id}</td>
            <td>${esc(o.customer_name || 'Guest')}</td>
            <td>${Array.isArray(o.items) ? o.items.length : '?'} items</td>
            <td class="font-bold">₹${Number(o.total || 0).toFixed(0)}</td>
            <td class="text-xs text-muted">${esc(fmtAddr(o.delivery_address))}</td>
            <td class="text-xs text-muted">${fmtDate(o.date)}</td>
            <td>
              <button class="btn btn-primary btn-sm" data-action="advance-order" data-id="${o.order_id}" data-next="${cfg.nextStatus}">
                <i class="fas fa-circle-arrow-right"></i> ${cfg.next}
              </button>
            </td>
          </tr>`;
        }).join('');
      }
    }
  }

  // ── Render: Admin delivery section (#sec-delivery-admin) ──

  function renderAdminDelivery() {
    // Reuse same IDs with -admin suffix
    const today = new Date().toDateString();
    const deliveredToday = _orders.filter(o =>
      o.status === 'delivered' && new Date(o.date).toDateString() === today
    ).length;
    const inTransit = _orders.filter(o => o.status === 'out_for_delivery').length;
    const pending   = _orders.filter(o => o.status === 'pending').length;

    _setText('admin-dlv-stat-total',    _orders.length);
    _setText('admin-dlv-stat-transit',  inTransit);
    _setText('admin-dlv-stat-delivered',deliveredToday);
    _setText('admin-dlv-stat-pending',  pending);

    const tbody = document.getElementById('adminOrderTbody');
    if (!tbody) return;
    const empty = document.getElementById('adminOrderEmpty');
    const loading = document.getElementById('adminOrderLoading');
    if (loading) loading.style.display = 'none';

    if (_orders.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = _orders.slice(0, 50).map(o => {
      const cfg = STATUS_CFG[o.status] || STATUS_CFG.pending;
      return `<tr>
        <td class="font-bold">#${o.order_id}</td>
        <td>${esc(o.customer_name || 'Guest')}</td>
        <td>${Array.isArray(o.items) ? o.items.length : '?'} items</td>
        <td class="font-bold">₹${Number(o.total || 0).toFixed(0)}</td>
        <td><span class="badge badge-info">${esc(o.payment_method || 'COD')}</span></td>
        <td><span class="badge ${cfg.badge}"><i class="fas ${cfg.icon}"></i> ${cfg.label}</span></td>
        <td class="text-xs text-muted">${fmtDate(o.date)}</td>
        <td>
          ${cfg.nextStatus
            ? `<button class="btn btn-primary btn-sm" data-action="advance-order" data-id="${o.order_id}" data-next="${cfg.nextStatus}">${cfg.next}</button>`
            : `<span class="text-xs text-muted">—</span>`}
        </td>
      </tr>`;
    }).join('');
  }

  // ── Render: all panels ────────────────────────────────────

  function renderAll() {
    renderOrders();
    renderDelivery();
    renderAdminDelivery();
  }

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Order detail modal ────────────────────────────────────

  function showOrderDetail(orderId) {
    const o = _orders.find(x => x.order_id === orderId);
    if (!o) return;
    const cfg = STATUS_CFG[o.status] || STATUS_CFG.pending;

    // Timeline: steps in order
    const steps = ['pending','confirmed','packed','out_for_delivery','delivered'];
    const currentIdx = steps.indexOf(o.status);
    const timelineHtml = steps.map((s, i) => {
      const sc = STATUS_CFG[s];
      const done = i <= currentIdx && o.status !== 'cancelled';
      return `<div class="timeline-item ${done ? 'completed' : ''}">
        <div class="timeline-dot"></div>
        <div>
          <div class="text-sm font-bold">${sc.label}</div>
          ${done && i === currentIdx ? `<div class="text-xs text-muted">${fmtDate(o.date)}</div>` : '<div class="text-xs text-muted">—</div>'}
        </div>
      </div>`;
    }).join('');

    const itemRows = (o.items || []).map(it =>
      `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color)">
        <span class="text-sm">${esc(it.name)} × ${it.qty}</span>
        <span class="text-sm font-bold">₹${Number(it.subtotal || it.qty * it.price || 0).toFixed(0)}</span>
      </div>`
    ).join('');

    // Inject / reuse modal
    let modal = document.getElementById('deliveryOrderModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'deliveryOrderModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);padding:16px';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="background:var(--bg-card,#12121e);border:1px solid rgba(255,255,255,0.1);border-radius:20px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:28px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div>
            <div class="font-bold" style="font-size:18px">Order #${o.order_id}</div>
            <span class="badge ${cfg.badge} mt-4"><i class="fas ${cfg.icon}"></i> ${cfg.label}</span>
          </div>
          <button id="closeOrderModal" style="background:none;border:none;color:var(--text-muted,#888);font-size:22px;cursor:pointer;line-height:1">&times;</button>
        </div>

        <div class="glass-card mb-16" style="padding:14px">
          <div class="text-xs text-muted mb-8">CUSTOMER</div>
          <div class="font-bold">${esc(o.customer_name || 'Guest')}</div>
          ${o.customer_phone ? `<div class="text-xs text-muted mt-2"><i class="fas fa-phone" style="font-size:10px"></i> ${esc(o.customer_phone)}</div>` : ''}
          <div class="text-xs text-muted mt-8">DELIVERY ADDRESS</div>
          <div class="text-sm mt-2">${esc(o.delivery_address || '—')}</div>
          <div style="display:flex;gap:16px;margin-top:12px">
            <div><div class="text-xs text-muted">Payment</div><div class="text-sm font-bold">${esc(o.payment_method || 'COD')}</div></div>
            <div><div class="text-xs text-muted">Total</div><div class="text-sm font-bold" style="color:var(--accent-green)">₹${Number(o.total || 0).toFixed(0)}</div></div>
            <div><div class="text-xs text-muted">Placed</div><div class="text-sm">${fmtDate(o.date)}</div></div>
          </div>
        </div>

        <div class="glass-card mb-16" style="padding:14px">
          <div class="text-xs text-muted mb-10">ITEMS (${(o.items || []).length})</div>
          ${itemRows || '<div class="text-xs text-muted">No item details available</div>'}
        </div>

        <div class="glass-card mb-20" style="padding:14px">
          <div class="text-xs text-muted mb-12">DELIVERY TIMELINE</div>
          <div class="timeline">${timelineHtml}</div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end">
          ${o.status === 'cancelled' || !cfg.nextStatus ? '' :
            `<button class="btn btn-primary" data-action="advance-order" data-id="${o.order_id}" data-next="${cfg.nextStatus}">
              <i class="fas fa-circle-arrow-right"></i> ${cfg.next}
            </button>`}
          <button id="closeOrderModalBtn" class="btn btn-secondary">Close</button>
        </div>
      </div>`;

    modal.style.display = 'flex';
    const close = () => { modal.style.display = 'none'; };
    document.getElementById('closeOrderModal').addEventListener('click', close);
    document.getElementById('closeOrderModalBtn').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
  }

  // ── Add-partner modal ─────────────────────────────────────

  function showAddPartnerModal() {
    let modal = document.getElementById('addPartnerModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'addPartnerModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);padding:16px';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="background:var(--bg-card,#12121e);border:1px solid rgba(255,255,255,0.1);border-radius:20px;width:100%;max-width:400px;padding:28px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div class="font-bold" style="font-size:16px">Add Delivery Partner</div>
          <button id="closePartnerModal" style="background:none;border:none;color:var(--text-muted,#888);font-size:22px;cursor:pointer;line-height:1">&times;</button>
        </div>
        <div id="partnerFormErr" class="form-error" style="display:none;margin-bottom:12px;color:var(--accent-red,#f43f5e);font-size:13px"></div>
        <div style="margin-bottom:14px">
          <label style="font-size:12px;color:var(--text-muted,#888);display:block;margin-bottom:6px">FULL NAME *</label>
          <input id="partnerNameInput" class="form-input" type="text" placeholder="e.g. Ravi Kumar" style="width:100%;padding:10px 12px;background:var(--bg-glass);border:1px solid var(--border-color);border-radius:10px;color:inherit;font-size:14px">
        </div>
        <div style="margin-bottom:20px">
          <label style="font-size:12px;color:var(--text-muted,#888);display:block;margin-bottom:6px">PHONE NUMBER</label>
          <input id="partnerPhoneInput" class="form-input" type="tel" placeholder="e.g. 9876543210" style="width:100%;padding:10px 12px;background:var(--bg-glass);border:1px solid var(--border-color);border-radius:10px;color:inherit;font-size:14px">
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="cancelPartnerBtn" class="btn btn-secondary">Cancel</button>
          <button id="savePartnerBtn" class="btn btn-primary"><i class="fas fa-plus"></i> Add Partner</button>
        </div>
      </div>`;
    modal.style.display = 'flex';

    const close = () => { modal.style.display = 'none'; };
    document.getElementById('closePartnerModal').addEventListener('click', close);
    document.getElementById('cancelPartnerBtn').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.getElementById('savePartnerBtn').addEventListener('click', async () => {
      const name  = (document.getElementById('partnerNameInput').value || '').trim();
      const phone = (document.getElementById('partnerPhoneInput').value || '').trim();
      const errEl = document.getElementById('partnerFormErr');
      if (!name) {
        errEl.textContent = 'Name is required.';
        errEl.style.display = '';
        return;
      }
      errEl.style.display = 'none';
      const btn = document.getElementById('savePartnerBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
      const ok = await addPartner(name, phone);
      if (ok) close();
      else { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Add Partner'; }
    });

    document.getElementById('partnerNameInput').focus();
  }

  // ── Event delegation ──────────────────────────────────────

  function _handleClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id ? Number(btn.dataset.id) : null;

    if (action === 'advance-order' && id) {
      btn.disabled = true;
      advanceStatus(id, btn.dataset.next).finally(() => { btn.disabled = false; });
    } else if (action === 'view-order' && id) {
      showOrderDetail(id);
    } else if (action === 'toggle-partner' && id) {
      togglePartnerStatus(id, btn.dataset.status);
    }
  }

  // ── Status tab filtering ──────────────────────────────────

  function _initStatusTabs() {
    document.addEventListener('click', e => {
      const tab = e.target.closest('#orderStatusTabs .tab, #adminOrderStatusTabs .tab');
      if (!tab) return;
      const container = tab.closest('.tabs');
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _activeStatusFilter = tab.dataset.orderStatus || 'all';
      renderOrders();
      renderAdminDelivery();
    });

    const searchInput = document.getElementById('orderSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        _searchQuery = e.target.value.trim();
        renderOrders();
      });
    }
    const adminSearch = document.getElementById('adminOrderSearchInput');
    if (adminSearch) {
      adminSearch.addEventListener('input', e => {
        _searchQuery = e.target.value.trim();
        renderAdminDelivery();
      });
    }
  }

  // ── Add-partner button ────────────────────────────────────

  function _initAddPartner() {
    document.addEventListener('click', e => {
      if (e.target.closest('#addPartnerBtn, #adminAddPartnerBtn')) {
        showAddPartnerModal();
      }
    });
  }

  // ── Auto-poll ─────────────────────────────────────────────

  function startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(async () => {
      await Promise.all([fetchOrders(), fetchPartners()]);
      renderAll();
    }, POLL_MS);
  }

  function stopPolling() {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }

  // ── Section-switch hook: refresh on navigate ──────────────

  function _patchSwitchSection() {
    const orig = window.switchSection;
    if (!orig || window._deliverySwitchPatched) return;
    window._deliverySwitchPatched = true;
    window.switchSection = function (id, el) {
      orig(id, el);
      if (id === 'orders' || id === 'delivery') {
        refresh();
      }
    };
  }

  // ── Public API ────────────────────────────────────────────

  async function refresh() {
    await Promise.all([fetchOrders(), fetchPartners()]);
    renderAll();
  }

  async function init() {
    document.addEventListener('click', _handleClick);
    _initStatusTabs();
    _initAddPartner();

    // Initial data load — show loading state while fetching
    const loadingEl = document.getElementById('orderLoadingState');
    if (loadingEl) loadingEl.style.display = '';
    const adminLoadingEl = document.getElementById('adminOrderLoading');
    if (adminLoadingEl) adminLoadingEl.style.display = '';

    await Promise.all([fetchOrders(), fetchPartners()]);
    renderAll();
    startPolling();

    // Patch switchSection after app.js has set it
    _patchSwitchSection();
    // Also try again after a tick in case app.js loads later
    setTimeout(_patchSwitchSection, 500);
  }

  window.DeliveryModule = { init, refresh, getOrders: () => _orders, getPartners: () => _partners };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
