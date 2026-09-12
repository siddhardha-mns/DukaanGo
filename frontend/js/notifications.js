/* ============================================================
   notifications.js — DukaanGo NotifEngine
   Provides real-time notifications for:
     * Low stock (qty <= 10) — polled from /inventory/alerts
     * Stale-zero items (qty=0 > 3 days) — polled from /inventory/alerts
     * New customer orders — detected via DeliveryModule order list
     * After-billing low-stock drop — called by DataEngine.completeBill()
     * Order delivered — called by DeliveryModule.advanceStatus()
   Exposed as window.NotifEngine.
   ============================================================ */

(function () {
  'use strict';

  const BACKEND = 'http://127.0.0.1:5005';
  const POLL_MS = 60_000;
  const LOW_STOCK_THRESHOLD = 10;
  const SEEN_KEY = 'lc_notif_seen';

  const TYPE_CFG = {
    low_stock:  { icon: 'fa-triangle-exclamation', color: '#f43f5e', bg: 'rgba(244,63,94,0.15)'  },
    stale_zero: { icon: 'fa-box-open',             color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    new_order:  { icon: 'fa-bag-shopping',         color: '#4f7df8', bg: 'rgba(79,125,248,0.15)' },
    delivered:  { icon: 'fa-circle-check',         color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
    bill_low:   { icon: 'fa-triangle-exclamation', color: '#f43f5e', bg: 'rgba(244,63,94,0.15)'  },
  };

  let _pushAllowed = false;
  let _pollTimer   = null;

  function _loadSeen() {
    try { return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')); }
    catch (_) { return new Set(); }
  }
  function _saveSeen(set) {
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set])); } catch (_) {}
  }
  let _seen = _loadSeen();

  function _wasSeen(uid) { return _seen.has(uid); }
  function _markSeen(uid) {
    _seen.add(uid);
    if (_seen.size > 500) {
      const arr = [..._seen]; _seen = new Set(arr.slice(arr.length - 300));
    }
    _saveSeen(_seen);
  }

  function _getBadgeCount() {
    const dot = document.getElementById('topbarNotifDot');
    return dot ? (parseInt(dot.dataset.count || '0', 10)) : 0;
  }

  function _setBadgeCount(n) {
    const dot = document.getElementById('topbarNotifDot');
    if (!dot) return;
    dot.dataset.count = n;
    if (n > 0) {
      dot.style.display = 'block';
      dot.textContent = n > 9 ? '9+' : String(n);
    } else {
      dot.style.display = 'none';
      dot.textContent = '';
    }
  }

  function _incBadge(by) {
    by = by || 1;
    _setBadgeCount(_getBadgeCount() + by);
  }

  function _relTime(ms) {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    return Math.floor(s / 86400) + ' day ago';
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function addNotif(type, title, body, uid, force) {
    uid = uid || (type + ':' + title + ':' + body);
    if (!force && _wasSeen(uid)) return;
    _markSeen(uid);

    const cfg  = TYPE_CFG[type] || TYPE_CFG.low_stock;
    const now  = Date.now();

    const list  = document.getElementById('notifList');
    const empty = document.getElementById('notifEmpty');
    if (list) {
      if (empty) empty.style.display = 'none';
      const item = document.createElement('div');
      item.className = 'notif-item';
      item.dataset.ts = now;
      item.style.cssText = 'padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;gap:12px;align-items:flex-start;animation:notifSlideIn .25s ease';
      item.innerHTML = '<div style="width:36px;height:36px;border-radius:10px;background:' + cfg.bg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ' + cfg.icon + '" style="color:' + cfg.color + ';font-size:14px"></i></div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(title) + '</div><div style="font-size:12px;color:var(--text-muted,#888);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(body) + '</div><div class="notif-ts" style="font-size:11px;color:var(--text-muted,#888);margin-top:4px">' + _relTime(now) + '</div></div>';
      list.insertBefore(item, list.firstChild);
    }

    _incBadge();
    _showToast(title, body, cfg.color);

    if (_pushAllowed && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(function(reg) {
        reg.showNotification(title, {
          body: body,
          icon: '/assets/icon-192.png',
          badge: '/assets/icon-192.png',
          tag: uid,
          renotify: false,
          data: { type: type, ts: now }
        }).catch(function(){});
      });
    }
  }

  function _showToast(title, body, color) {
    if (typeof window.showToast === 'function') {
      window.showToast(title + ': ' + body, 'warning');
      return;
    }
    var container = document.getElementById('notifToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notifToastContainer';
      container.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none';
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.style.cssText = 'background:var(--bg-card,#12121e);border:1px solid ' + color + ';border-radius:12px;padding:12px 16px;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.4);pointer-events:all;animation:notifSlideIn .25s ease';
    toast.innerHTML = '<div style="font-size:13px;font-weight:700;color:' + color + '">' + esc(title) + '</div><div style="font-size:12px;color:var(--text-muted,#888);margin-top:3px">' + esc(body) + '</div>';
    container.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity .4s';
      setTimeout(function() { toast.remove(); }, 400);
    }, 4000);
  }

  async function checkInventoryAlerts() {
    try {
      const res = await fetch(BACKEND + '/inventory/alerts');
      const data = await res.json();
      if (!data.ok) return;

      (data.low_stock || []).forEach(function(item) {
        var uid = 'low_stock:' + item.id + ':' + item.qty;
        var urgency = item.qty <= 3 ? 'Critical' : 'Low Stock';
        addNotif('low_stock', urgency + ': ' + item.name, 'Only ' + item.qty + ' unit' + (item.qty !== 1 ? 's' : '') + ' remaining', uid);
      });

      (data.stale_zero || []).forEach(function(item) {
        var uid = 'stale_zero:' + item.id;
        addNotif('stale_zero', 'Out of Stock: ' + item.name, 'Qty has been 0 for over 3 days — restock needed', uid);
      });
    } catch (_) {}
  }

  function notifyAfterBill(billItems) {
    if (!Array.isArray(billItems) || billItems.length === 0) return;
    var inventory = (typeof DataEngine !== 'undefined') ? DataEngine.getInventory() : [];
    billItems.forEach(function(bi) {
      if (!bi.id) return;
      var inv = inventory.find(function(i) { return i.id === bi.id; });
      if (inv && inv.qty <= LOW_STOCK_THRESHOLD) {
        var uid = 'bill_low:' + inv.id + ':' + Date.now();
        addNotif('bill_low', 'Stock Low: ' + inv.name, 'Only ' + inv.qty + ' ' + (inv.unit || 'unit') + (inv.qty !== 1 ? 's' : '') + ' left after this bill', uid, true);
      }
    });
  }

  async function _requestPushPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') { _pushAllowed = true; return; }
    if (Notification.permission === 'denied') return;
    try {
      var perm = await Notification.requestPermission();
      _pushAllowed = perm === 'granted';
    } catch (_) {}
  }

  function _tickTimestamps() {
    document.querySelectorAll('.notif-ts').forEach(function(el) {
      var item = el.closest('.notif-item');
      if (!item) return;
      var ts = parseInt(item.dataset.ts || '0', 10);
      if (ts) el.textContent = _relTime(ts);
    });
  }

  async function init() {
    if (!document.getElementById('notifEngineStyle')) {
      var style = document.createElement('style');
      style.id = 'notifEngineStyle';
      style.textContent = '@keyframes notifSlideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}#topbarNotifDot{position:absolute;top:4px;right:4px;min-width:16px;height:16px;border-radius:8px;background:#f43f5e;color:#fff;font-size:9px;font-weight:700;line-height:16px;text-align:center;padding:0 3px;display:none;pointer-events:none}';
      document.head.appendChild(style);
    }

    await _requestPushPermission();
    await checkInventoryAlerts();

    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(checkInventoryAlerts, POLL_MS);
    setInterval(_tickTimestamps, 60_000);

    // Wrap clearNotifs so clearing the panel also resets our badge
    var origClear = window.clearNotifs;
    window.clearNotifs = function() {
      if (typeof origClear === 'function') origClear();
      _setBadgeCount(0);
    };
  }

  window.NotifEngine = { init: init, addNotif: addNotif, checkInventoryAlerts: checkInventoryAlerts, notifyAfterBill: notifyAfterBill };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
