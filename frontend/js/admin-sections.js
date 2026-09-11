// Inject admin-only system sections into #sections2Container
(function() {
  const container = document.getElementById('sections2Container');
  if (!container) return;

  container.innerHTML = `

<!-- ========== 12. TEAM & ACCESS ========== -->
<div class="section" id="sec-team">
<div class="section-header"><div><div class="section-title">User & Access Control</div><div class="section-subtitle">Manage team members, roles, and permissions</div></div><button class="btn btn-primary"><i class="fas fa-user-plus"></i> Add Member</button></div>
<div class="grid-3 mb-24">
<div class="glass-card" style="text-align:center"><div class="avatar" style="background:var(--gradient-1);width:56px;height:56px;font-size:20px;margin:0 auto 12px">RK</div><div class="font-bold">Rajesh Kumar</div><div class="text-xs text-muted mb-8">rajesh@localcart.in</div><span class="badge badge-purple">Owner</span><div class="text-xs text-muted mt-12"><i class="fas fa-clock"></i> Active now</div></div>
<div class="glass-card" style="text-align:center"><div class="avatar" style="background:var(--gradient-2);width:56px;height:56px;font-size:20px;margin:0 auto 12px">PM</div><div class="font-bold">Pooja M.</div><div class="text-xs text-muted mb-8">pooja@localcart.in</div><span class="badge badge-info">Manager</span><div class="text-xs text-muted mt-12"><i class="fas fa-clock"></i> 2h ago</div></div>
<div class="glass-card" style="text-align:center"><div class="avatar" style="background:var(--gradient-3);width:56px;height:56px;font-size:20px;margin:0 auto 12px">AK</div><div class="font-bold">Arun K.</div><div class="text-xs text-muted mb-8">arun@localcart.in</div><span class="badge badge-success">Staff</span><div class="text-xs text-muted mt-12"><i class="fas fa-clock"></i> 5h ago</div></div>
</div>
<div class="glass-card"><div class="font-bold mb-16">Activity Logs</div>
<div class="timeline">
<div class="timeline-item completed"><div class="timeline-dot"></div><div><div class="text-sm"><strong>Rajesh K.</strong> updated product price — Basmati Rice</div><div class="text-xs text-muted">Today, 4:30 PM</div></div></div>
<div class="timeline-item completed"><div class="timeline-dot"></div><div><div class="text-sm"><strong>Pooja M.</strong> processed order #1246</div><div class="text-xs text-muted">Today, 3:15 PM</div></div></div>
<div class="timeline-item completed"><div class="timeline-dot"></div><div><div class="text-sm"><strong>Arun K.</strong> added 50 units of Amul Milk to inventory</div><div class="text-xs text-muted">Today, 2:00 PM</div></div></div>
<div class="timeline-item completed"><div class="timeline-dot"></div><div><div class="text-sm"><strong>Rajesh K.</strong> created coupon WEEKEND15</div><div class="text-xs text-muted">Today, 11:00 AM</div></div></div>
</div></div>
</div>

<!-- ========== 13. PLATFORM ========== -->
<div class="section" id="sec-platform">
<div class="section-header"><div><div class="section-title">Platform Features</div><div class="section-subtitle">Connectivity, sync, and device management</div></div></div>
<div class="grid-3 mb-24">
<div class="glass-card" style="text-align:center;border-color:rgba(52,211,153,0.2)"><i class="fas fa-wifi" style="font-size:36px;color:var(--accent-green);display:block;margin-bottom:12px"></i><div class="font-bold">Online Mode</div><div class="text-xs text-muted mt-4">All systems connected and syncing</div><div class="sync-indicator sync-online mt-16" style="justify-content:center"><i class="fas fa-circle" style="font-size:6px"></i> Connected</div></div>
<div class="glass-card" style="text-align:center"><i class="fas fa-rotate" style="font-size:36px;color:var(--accent-blue);display:block;margin-bottom:12px"></i><div class="font-bold">Last Synced</div><div class="text-xs text-muted mt-4">All data is up to date</div><div class="text-sm font-bold mt-16" style="color:var(--accent-blue)">Just now</div></div>
<div class="glass-card" style="text-align:center"><i class="fas fa-laptop" style="font-size:36px;color:var(--accent-purple);display:block;margin-bottom:12px"></i><div class="font-bold">3 Devices</div><div class="text-xs text-muted mt-4">Desktop, Tablet, Mobile</div><div class="text-sm font-bold mt-16" style="color:var(--accent-purple)">All Active</div></div>
</div>
<div class="glass-card"><div class="font-bold mb-16">Offline Mode Capability</div>
<div class="grid-2">
<div style="padding:20px;background:var(--bg-glass);border-radius:var(--radius-md)"><div class="flex items-center gap-8 mb-8"><i class="fas fa-check-circle" style="color:var(--accent-green)"></i><span class="text-sm font-bold">Available Offline</span></div><div class="text-xs text-muted">• View inventory & products<br>• Create manual orders<br>• Generate invoices<br>• Access customer data</div></div>
<div style="padding:20px;background:var(--bg-glass);border-radius:var(--radius-md)"><div class="flex items-center gap-8 mb-8"><i class="fas fa-cloud" style="color:var(--accent-blue)"></i><span class="text-sm font-bold">Requires Internet</span></div><div class="text-xs text-muted">• Payment processing<br>• WhatsApp messaging<br>• AI predictions<br>• Live delivery tracking</div></div>
</div></div>
</div>

<!-- ========== 14. LOCAL NETWORK ========== -->
<div class="section" id="sec-network">
<div class="section-header"><div><div class="section-title">Local Vendor Network</div><div class="section-subtitle">Connect with nearby vendors for collaboration</div></div><button class="btn btn-primary"><i class="fas fa-handshake"></i> Join Network</button></div>
<div class="grid-2 mb-24">
<div class="glass-card"><div class="font-bold mb-16">Nearby Vendors</div>
<div class="flex flex-col gap-12">
<div class="flex items-center justify-between" style="padding:14px;background:var(--bg-glass);border-radius:var(--radius-md)"><div class="flex items-center gap-12"><div class="avatar" style="background:var(--gradient-4);width:40px;height:40px;font-size:14px">🥬</div><div><div class="text-sm font-bold">Fresh Veggie Corner</div><div class="text-xs text-muted">Vegetables • 0.5 km away</div></div></div><button class="btn btn-secondary btn-sm">Connect</button></div>
<div class="flex items-center justify-between" style="padding:14px;background:var(--bg-glass);border-radius:var(--radius-md)"><div class="flex items-center gap-12"><div class="avatar" style="background:var(--gradient-2);width:40px;height:40px;font-size:14px">🍰</div><div><div class="text-sm font-bold">Meera Home Bakery</div><div class="text-xs text-muted">Bakery • 0.8 km away</div></div></div><span class="badge badge-success">Connected</span></div>
<div class="flex items-center justify-between" style="padding:14px;background:var(--bg-glass);border-radius:var(--radius-md)"><div class="flex items-center gap-12"><div class="avatar" style="background:var(--gradient-1);width:40px;height:40px;font-size:14px">💊</div><div><div class="text-sm font-bold">Health Plus Pharmacy</div><div class="text-xs text-muted">Pharmacy • 1.2 km away</div></div></div><button class="btn btn-secondary btn-sm">Connect</button></div>
</div></div>
<div class="glass-card"><div class="font-bold mb-16">Shared Delivery Collaboration</div>
<div style="padding:20px;background:linear-gradient(135deg,rgba(54,214,231,0.05),rgba(79,125,248,0.05));border-radius:var(--radius-lg);border:1px solid rgba(54,214,231,0.1);margin-bottom:16px;text-align:center">
<i class="fas fa-truck-fast" style="font-size:40px;color:var(--accent-cyan);display:block;margin-bottom:12px"></i>
<div class="font-bold">Pool Deliveries & Save</div>
<div class="text-xs text-muted mt-4">Share delivery partners with nearby vendors to reduce costs by up to 40%</div>
</div>
<div class="flex flex-col gap-8">
<div class="flex items-center justify-between text-sm" style="padding:10px 0;border-bottom:1px solid var(--border-color)"><span>Active shared routes</span><span class="font-bold">3</span></div>
<div class="flex items-center justify-between text-sm" style="padding:10px 0;border-bottom:1px solid var(--border-color)"><span>Cost saved this month</span><span class="font-bold" style="color:var(--accent-green)">₹2,400</span></div>
<div class="flex items-center justify-between text-sm" style="padding:10px 0"><span>Partner vendors</span><span class="font-bold">2</span></div>
</div></div>
</div>
</div>

<!-- ========== 15. ADMIN / SETTINGS ========== -->
<div class="section" id="sec-admin">
<div class="section-header"><div><div class="section-title">Settings & Admin</div><div class="section-subtitle">Configure your platform preferences</div></div></div>
<div class="grid-2 mb-24">
<div class="glass-card"><div class="font-bold mb-16">General Settings</div>
<div class="flex flex-col gap-16">
<div class="flex items-center justify-between"><div><div class="text-sm font-bold">Theme</div><div class="text-xs text-muted">Switch between dark and light mode</div></div><div class="flex items-center gap-8"><span class="badge badge-info" id="themeModeLabel">Dark</span><div class="toggle active" id="themeToggle" onclick="toggleTheme(this)"></div></div></div>
<div class="flex items-center justify-between"><div><div class="text-sm font-bold">Language</div><div class="text-xs text-muted">Choose voice recognition language</div></div><div class="lang-toggle"><button class="lang-btn" onclick="setVoiceLang('te-IN',this)">TE</button><button class="lang-btn active" onclick="setVoiceLang('en-IN',this)">EN</button><button class="lang-btn" onclick="setVoiceLang('hi-IN',this)">HI</button></div></div>
<div class="flex items-center justify-between"><div><div class="text-sm font-bold">Voice Assistant</div><div class="text-xs text-muted">Enable wake word and voice commands</div></div><div class="flex items-center gap-8"><span class="badge badge-success" id="voiceToggleState">On</span><div class="toggle active" id="voiceToggle" onclick="toggleVoiceAssistant(this)"></div></div></div>
<div class="flex items-center justify-between"><div><div class="text-sm font-bold">Push Notifications</div><div class="text-xs text-muted">Receive alerts for new orders</div></div><div class="toggle active" onclick="this.classList.toggle('active')"></div></div>
<div class="flex items-center justify-between"><div><div class="text-sm font-bold">Sound Alerts</div><div class="text-xs text-muted">Play sound on new order</div></div><div class="toggle" onclick="this.classList.toggle('active')"></div></div>
<div class="flex items-center justify-between"><div><div class="text-sm font-bold">Auto Accept Orders</div><div class="text-xs text-muted">Automatically confirm incoming orders</div></div><div class="toggle" onclick="this.classList.toggle('active')"></div></div>
<div class="flex items-center justify-between"><div><div class="text-sm font-bold">Sync Status</div><div class="text-xs text-muted">Current network and offline mode state</div></div><span class="badge badge-success" id="settingsSyncStatus">Online</span></div>
</div></div>
<div class="glass-card"><div class="font-bold mb-16">Export & Reports</div>
<div class="flex flex-col gap-12">
<div class="flex items-center justify-between" style="padding:16px;background:var(--bg-glass);border-radius:var(--radius-md)"><div class="flex items-center gap-12"><i class="fas fa-file-pdf" style="color:var(--accent-red);font-size:20px"></i><div><div class="text-sm font-bold">Sales Report</div><div class="text-xs text-muted">Monthly summary PDF</div></div></div><button class="btn btn-secondary btn-sm"><i class="fas fa-download"></i> Export</button></div>
<div class="flex items-center justify-between" style="padding:16px;background:var(--bg-glass);border-radius:var(--radius-md)"><div class="flex items-center gap-12"><i class="fas fa-file-csv" style="color:var(--accent-green);font-size:20px"></i><div><div class="text-sm font-bold">Inventory Data</div><div class="text-xs text-muted">Full product list CSV</div></div></div><button class="btn btn-secondary btn-sm"><i class="fas fa-download"></i> Export</button></div>
<div class="flex items-center justify-between" style="padding:16px;background:var(--bg-glass);border-radius:var(--radius-md)"><div class="flex items-center gap-12"><i class="fas fa-file-excel" style="color:var(--accent-green);font-size:20px"></i><div><div class="text-sm font-bold">Customer Data</div><div class="text-xs text-muted">Customer list with orders</div></div></div><button class="btn btn-secondary btn-sm"><i class="fas fa-download"></i> Export</button></div>
<div class="flex items-center justify-between" style="padding:16px;background:var(--bg-glass);border-radius:var(--radius-md)"><div class="flex items-center gap-12"><i class="fas fa-file-pdf" style="color:var(--accent-red);font-size:20px"></i><div><div class="text-sm font-bold">Tax Report</div><div class="text-xs text-muted">GST summary for filing</div></div></div><button class="btn btn-secondary btn-sm"><i class="fas fa-download"></i> Export</button></div>
</div></div>
</div>
<div class="glass-card"><div class="font-bold mb-16">Danger Zone</div>
<div class="flex items-center justify-between" style="padding:16px;background:rgba(244,63,94,0.05);border:1px solid rgba(244,63,94,0.1);border-radius:var(--radius-md)"><div><div class="text-sm font-bold" style="color:var(--accent-red)">Delete Store</div><div class="text-xs text-muted">Permanently remove your store and all data</div></div><button class="btn btn-danger btn-sm"><i class="fas fa-trash"></i> Delete</button></div>
</div>
</div>
`;
})();
