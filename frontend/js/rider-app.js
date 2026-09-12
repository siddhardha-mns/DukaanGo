const BACKEND = 'http://127.0.0.1:5005';
const TOKEN_KEY = 'lc_auth_token';
const USER_KEY = 'lc_auth_user';

let map = null;
let mapMarker = null;
let activeOrderId = null;
let activePhotoType = null; // 'pickup' or 'dropoff'

// ── Auth Check ──
const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
if (!token) {
  window.location.replace('login.html');
}
const user = JSON.parse(sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY) || '{}');
document.getElementById('riderName').textContent = user.username || 'Rider';

function logoutRider() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.replace('login.html');
}

// ── UI Helpers ──
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
  toast.style.background = type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#334155');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function showLoader() { document.getElementById('loader').classList.add('active'); }
function hideLoader() { document.getElementById('loader').classList.remove('active'); }

function switchTab(tabId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  document.getElementById(`sec-${tabId}`).classList.add('active');
  document.getElementById(`nav-${tabId}`).classList.add('active');
  
  if (tabId === 'active' && map) {
    setTimeout(() => map.invalidateSize(), 100);
  }
}

// ── API Wrapper ──
async function apiCall(path, method = 'GET', body = null) {
  const headers = { 'Authorization': `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  
  try {
    const res = await fetch(`${BACKEND}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    if (res.status === 401) {
      logoutRider();
      return null;
    }
    return await res.json();
  } catch (err) {
    showToast('Network error', 'error');
    console.error(err);
    return null;
  }
}

// ── Data Fetching ──
async function fetchOrders() {
  showLoader();
  const data = await apiCall('/rider/orders');
  hideLoader();
  
  if (data && data.ok) {
    renderAvailableOrders(data.available);
    renderActiveOrder(data.active.length > 0 ? data.active[0] : null);
    renderPastOrders(data.past);
  }
}

async function fetchEarnings() {
  const data = await apiCall('/rider/earnings');
  if (data && data.ok) {
    document.getElementById('totalEarnings').textContent = `₹${parseFloat(data.earnings).toFixed(2)}`;
    document.getElementById('totalTrips').textContent = data.trips;
  }
}

// ── Rendering ──
function renderAvailableOrders(orders) {
  const list = document.getElementById('availableList');
  if (orders.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><p>No available orders right now</p></div>`;
    return;
  }
  
  list.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-header">
        <div class="order-id">Order #${o.id}</div>
        <div class="order-status status-${o.status}">${o.status.replace('_', ' ')}</div>
      </div>
      <div class="order-detail"><i class="fas fa-user"></i> ${o.customer_name || 'Unknown'} (${o.customer_phone || 'N/A'})</div>
      <div class="order-detail"><i class="fas fa-map-marker-alt"></i> ${o.delivery_address || 'No address provided'}</div>
      <div class="order-detail"><i class="fas fa-rupee-sign"></i> ${o.total.toFixed(2)}</div>
      <button class="btn btn-primary" onclick="acceptOrder(${o.id})">Accept Delivery</button>
    </div>
  `).join('');
}

function renderPastOrders(orders) {
  const list = document.getElementById('pastOrdersList');
  if (orders.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-receipt"></i><p>No past deliveries yet</p></div>`;
    return;
  }
  
  list.innerHTML = orders.map(o => `
    <div class="order-card" style="padding:12px; margin-bottom:10px;">
      <div class="order-header" style="margin-bottom:4px;">
        <div class="order-id">Order #${o.id}</div>
        <div class="order-status status-delivered">Delivered</div>
      </div>
      <div class="order-detail" style="margin-bottom:0; font-size:12px;">
        <i class="fas fa-check-circle" style="color:var(--success)"></i> Earned ₹${o.delivery_fee.toFixed(2)}
      </div>
    </div>
  `).join('');
}

function initMap(address) {
  if (!map) {
    map = L.map('map').setView([17.3850, 78.4867], 13); // Default Hyderabad
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    mapMarker = L.marker([17.3850, 78.4867]).addTo(map);
  }
  
  // Try to geocode the address
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
    .then(r => r.json())
    .then(data => {
      if (data && data.length > 0) {
        const lat = data[0].lat;
        const lon = data[0].lon;
        map.setView([lat, lon], 15);
        mapMarker.setLatLng([lat, lon]);
      }
    })
    .catch(console.error);
}

function renderActiveOrder(order) {
  const container = document.getElementById('activeOrderContainer');
  activeOrderId = order ? order.id : null;
  
  if (!order) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>No active delivery.</p><button class="btn btn-primary" onclick="switchTab('available')" style="width:auto; padding:8px 24px; margin-top:16px;">Find Orders</button></div>`;
    return;
  }
  
  const isPickup = order.status === 'ready';
  const actionText = isPickup ? 'Take Pickup Photo' : 'Take Dropoff Photo';
  activePhotoType = isPickup ? 'pickup' : 'dropoff';
  
  container.innerHTML = `
    <div class="order-card" style="border:2px solid var(--primary);">
      <div class="order-header">
        <div class="order-id">Order #${order.id}</div>
        <div class="order-status status-${order.status}">${order.status.replace('_', ' ')}</div>
      </div>
      <div class="order-detail" style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">
        <i class="fas fa-user"></i> ${order.customer_name || 'Unknown'} <a href="tel:${order.customer_phone}" style="margin-left:12px; color:var(--primary);"><i class="fas fa-phone"></i> Call</a>
      </div>
      <div class="order-detail"><i class="fas fa-map-marker-alt"></i> ${order.delivery_address || 'Store'}</div>
      
      <div class="media-container">
        <div id="map"></div>
      </div>
      
      <div class="media-container" style="height:250px; background:#1e293b;" id="photoContainer">
        <img id="photoPreview" class="photo-preview" />
        <div class="camera-btn-wrapper" onclick="openCamera()">
          <i class="fas fa-camera"></i>
          <span>${actionText}</span>
        </div>
      </div>
      
      <button class="btn btn-success" id="submitPhotoBtn" disabled onclick="submitPhoto()" style="margin-top:16px;">
        <i class="fas fa-check"></i> Submit & ${isPickup ? 'Start Delivery' : 'Complete Delivery'}
      </button>
    </div>
  `;
  
  // Initialize map with delay to ensure DOM is ready
  setTimeout(() => initMap(order.delivery_address), 100);
}

// ── Actions ──
async function acceptOrder(id) {
  showLoader();
  const res = await apiCall(`/rider/orders/${id}/accept`, 'POST');
  hideLoader();
  
  if (res && res.ok) {
    showToast('Order accepted!', 'success');
    await fetchOrders();
    switchTab('active');
  } else {
    showToast(res ? res.message : 'Error accepting order', 'error');
  }
}

// ── Photo Capture ──
let currentPhotoBase64 = null;

function openCamera() {
  document.getElementById('cameraInput').click();
}

function handlePhotoCapture(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    currentPhotoBase64 = e.target.result;
    const preview = document.getElementById('photoPreview');
    preview.src = currentPhotoBase64;
    preview.style.display = 'block';
    
    // Hide overlay
    document.querySelector('.camera-btn-wrapper').style.background = 'rgba(0,0,0,0.6)';
    document.querySelector('.camera-btn-wrapper span').textContent = 'Retake Photo';
    
    document.getElementById('submitPhotoBtn').disabled = false;
  };
  reader.readAsDataURL(file);
}

async function submitPhoto() {
  if (!activeOrderId || !currentPhotoBase64) return;
  
  showLoader();
  const res = await apiCall(`/rider/orders/${activeOrderId}/photo`, 'POST', {
    type: activePhotoType,
    photo: currentPhotoBase64
  });
  hideLoader();
  
  if (res && res.ok) {
    showToast(res.message, 'success');
    currentPhotoBase64 = null;
    await fetchOrders();
    if (activePhotoType === 'dropoff') {
      await fetchEarnings();
      switchTab('earnings');
    } else {
      switchTab('active');
    }
  } else {
    showToast(res ? res.message : 'Failed to upload photo', 'error');
  }
}

// ── Initialize ──
document.addEventListener('DOMContentLoaded', () => {
  fetchOrders();
  fetchEarnings();
});
