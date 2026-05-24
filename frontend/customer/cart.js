/**
 * cart.js — In-memory cart state manager for LocalCart Customer Panel
 */
const cart = {
  items: [],
  _notify() { document.dispatchEvent(new CustomEvent('cart-updated')); },
  add(item) {
    const existing = this.items.find(i => i.id === item.id);
    if (existing) {
      existing.qty = Math.min(existing.qty + (item.qty || 1), item.maxQty || 999);
    } else {
      this.items.push({
        id: item.id, name: item.name, nameTE: item.nameTE || '',
        unit: item.unit || 'pcs', price: item.price,
        qty: item.qty || 1, maxQty: item.maxQty || 999
      });
    }
    this._notify();
  },
  remove(id) { this.items = this.items.filter(i => i.id !== id); this._notify(); },
  updateQty(id, qty) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (qty <= 0) { this.remove(id); return; }
    item.qty = Math.min(qty, item.maxQty);
    this._notify();
  },
  clear() { this.items = []; this._notify(); },
  total() { return this.items.reduce((s, i) => s + i.price * i.qty, 0); },
  count() { return this.items.reduce((s, i) => s + i.qty, 0); },
  getItem(id) { return this.items.find(i => i.id === id) || null; }
};
window.cart = cart;
