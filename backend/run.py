import os
import requests
import json
import re
import datetime
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from dotenv import load_dotenv
from database import get_db, init_db
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import bcrypt

# Load environment variables
load_dotenv()

app = Flask(__name__)

# JWT Configuration
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET", "localcart-dev-secret-change-in-prod")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(days=7)
jwt = JWTManager(app)

# CORS — allow dev servers and production
CORS(app, origins=[
    "http://127.0.0.1:5005",
    "http://127.0.0.1:5501",
    "http://localhost:5500",
    "http://localhost:5501",
    "https://smart-kirana-alpha.vercel.app"
])

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"ok": True, "status": "online", "sarvam": bool(SARVAM_API_KEY)})

# ─────────────────────────────────────────────────────────────
# INVENTORY ENDPOINTS
# ─────────────────────────────────────────────────────────────

@app.route('/inventory', methods=['GET'])
def get_inventory():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM inventory")
        rows = cursor.fetchall()
        
        inventory_list = []
        for row in rows:
            inventory_list.append({
                "id": row["id"],
                "name": row["name"],
                "nameTE": row["nameTE"],
                "unit": row["unit"],
                "price": row["price"],
                "stock": row["qty"],
                "category": row["category"],
                "expiry": row["expiry"],
                "sku": row["sku"],
                "description": row["description"],
                "lastUpdated": row["lastUpdated"]
            })
        conn.close()
        
        return jsonify({"ok": True, "data": inventory_list})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500

@app.route('/inventory/add', methods=['POST'])
def add_inventory():
    try:
        data = request.json
        if not data or not data.get("name"):
            return jsonify({"ok": False, "message": "Product name is required"}), 400
        
        name = data.get("name")
        price = float(data.get("price", 0))
        stock = float(data.get("stock", 0))
        category = data.get("category", "General")
        sku = data.get("sku", "")
        expiry = data.get("expiry", None)
        desc = data.get("description", "")
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Upsert logic: check if product exists by name
        cursor.execute("SELECT id, qty FROM inventory WHERE name = ?", (name,))
        existing = cursor.fetchone()
        
        if existing:
            new_qty = existing["qty"] + stock
            cursor.execute('''
                UPDATE inventory 
                SET price = ?, qty = ?, category = ?, sku = ?, expiry = ?, description = ?, lastUpdated = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (price, new_qty, category, sku, expiry, desc, existing["id"]))
            msg = f"Updated {name} (New Stock: {new_qty})"
            final_id = existing["id"]
            final_stock = new_qty
        else:
            cursor.execute('''
                INSERT INTO inventory (name, price, qty, category, sku, expiry, description)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (name, price, stock, category, sku, expiry, desc))
            msg = f"Added {name} to inventory"
            final_id = cursor.lastrowid
            final_stock = stock
            
        conn.commit()
        conn.close()
        
        return jsonify({
            "ok": True,
            "data": {"id": final_id, "name": name, "price": price, "stock": final_stock},
            "message": msg
        })
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500

# ─────────────────────────────────────────────────────────────
# TRANSACTION ENDPOINTS
# ─────────────────────────────────────────────────────────────

@app.route('/transactions', methods=['POST'])
def add_transaction():
    try:
        data = request.json
        if not data or "id" not in data:
            return jsonify({"ok": False, "message": "Transaction data is incomplete"}), 400
        
        txn_id = data.get("id")
        date = data.get("date")
        hour = data.get("hour")
        subtotal = data.get("subtotal", 0)
        total = data.get("total", 0)
        items = data.get("items", [])
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO transactions (id, date, hour, subtotal, total)
            VALUES (?, ?, ?, ?, ?)
        ''', (txn_id, date, hour, subtotal, total))
        
        for item in items:
            cursor.execute('''
                INSERT INTO transaction_items (txn_id, item_name, qty, price, unit, subtotal)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (txn_id, item.get("name"), item.get("qty"), item.get("price"), item.get("unit"), item.get("subtotal")))
            
            if item.get("id"):
                cursor.execute('UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?', (item.get("qty"), item.get("id")))
        
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "message": f"Transaction {txn_id} saved"})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500

@app.route('/transactions', methods=['GET'])
def get_transactions():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM transactions ORDER BY date DESC")
        txn_rows = cursor.fetchall()
        
        txns = []
        for t in txn_rows:
            txn_id = t["id"]
            cursor.execute("SELECT * FROM transaction_items WHERE txn_id = ?", (txn_id,))
            items = [{"name": i["item_name"], "qty": i["qty"], "price": i["price"]} for i in cursor.fetchall()]
            txns.append({**dict(t), "items": items})
        
        conn.close()
        return jsonify({"ok": True, "data": txns})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500

# ─────────────────────────────────────────────────────────────
# SARVAM AI PROXIES
# ─────────────────────────────────────────────────────────────

@app.route('/api/sarvam/asr', methods=['POST'])
def sarvam_asr():
    if not SARVAM_API_KEY:
        return jsonify({"ok": False, "message": "Sarvam API Key not configured"}), 501
    
    try:
        # Forward the audio file to Sarvam
        files = {'file': (request.files['file'].filename, request.files['file'].read(), request.files['file'].content_type)}
        payload = {'model': 'saaras:v3'}
        # Allow caller to override language code (e.g. hi-IN, te-IN, en-IN)
        if request.form.get('language_code'):
            payload['language_code'] = request.form.get('language_code')
        
        response = requests.post(
            "https://api.sarvam.ai/speech-to-text",
            headers={"api-subscription-key": SARVAM_API_KEY},
            files=files,
            data=payload
        )
        return jsonify({"ok": True, "data": response.json()}), response.status_code
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500

@app.route('/api/sarvam/tts', methods=['POST'])
def sarvam_tts():
    if not SARVAM_API_KEY:
        return jsonify({"ok": False, "message": "Sarvam API Key not configured"}), 501
    
    try:
        response = requests.post(
            "https://api.sarvam.ai/text-to-speech",
            headers={"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"},
            json=request.json
        )
        return jsonify({"ok": True, "data": response.json()}), response.status_code
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500

@app.route('/api/sarvam/chat', methods=['POST'])
def sarvam_chat():
    if not SARVAM_API_KEY:
        return jsonify({"ok": False, "message": "Sarvam API Key not configured"}), 501
    
    try:
        response = requests.post(
            "https://api.sarvam.ai/v1/chat/completions",
            headers={"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"},
            json=request.json
        )
        sarvam_data = response.json()
        if "choices" in sarvam_data and len(sarvam_data["choices"]) > 0:
            content = sarvam_data["choices"][0].get("message", {}).get("content", "")
            if content:
                content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
                sarvam_data["choices"][0]["message"]["content"] = content

        return jsonify({"ok": True, "data": sarvam_data}), response.status_code
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500

# ─────────────────────────────────────────────────────────────
# ANALYTICS CHAT (Context-Aware)
# ─────────────────────────────────────────────────────────────

@app.route('/api/analytics/chat', methods=['POST'])
def analytics_chat():
    if not SARVAM_API_KEY:
        return jsonify({"ok": True, "data": {"content": "Sarvam AI not configured. Please add SARVAM_API_KEY to backend/.env."}})

    try:
        user_query = (request.json or {}).get("query", "")
        if not user_query:
            return jsonify({"ok": False, "message": "Query is required"}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Overall stats
        cursor.execute("SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as txns FROM transactions")
        stats = cursor.fetchone()

        # Today's stats
        today = datetime.date.today().strftime('%Y-%m-%d')
        cursor.execute("SELECT COALESCE(SUM(total),0) as rev, COUNT(*) as txns FROM transactions WHERE date = ?", (today,))
        today_stats = cursor.fetchone()

        # Top 5 selling items (all time)
        cursor.execute("""
            SELECT ti.item_name, SUM(ti.qty) as total_qty, SUM(ti.subtotal) as total_rev
            FROM transaction_items ti
            GROUP BY ti.item_name
            ORDER BY total_qty DESC LIMIT 5
        """)
        top_items = [f"{r['item_name']} ({int(r['total_qty'])} sold, ₹{r['total_rev']:.0f})" for r in cursor.fetchall()]

        # Low stock
        cursor.execute("SELECT name, qty FROM inventory WHERE qty < 10 ORDER BY qty ASC LIMIT 8")
        low_stock = [f"{r['name']} ({r['qty']} left)" for r in cursor.fetchall()]

        # Full inventory snapshot (name, price, qty, category)
        cursor.execute("SELECT name, price, qty, category FROM inventory ORDER BY name LIMIT 40")
        inventory = [f"{r['name']} — ₹{r['price']}, stock:{r['qty']}, cat:{r['category']}" for r in cursor.fetchall()]

        # Recent 5 transactions
        cursor.execute("SELECT id, date, total, customerName FROM transactions ORDER BY date DESC LIMIT 5")
        recent_txns = [f"{r['id']} on {r['date']}: ₹{r['total']} ({r['customerName'] or 'walk-in'})" for r in cursor.fetchall()]

        conn.close()

        context = f"""
STORE DATA FOR DUKAANGO KIRANA:

TODAY ({today}):
- Revenue: ₹{today_stats['rev']:.0f} across {today_stats['txns']} transactions

ALL TIME:
- Total Revenue: ₹{stats['revenue']:.0f} | Total Transactions: {stats['txns']}

TOP SELLING ITEMS:
{chr(10).join(top_items) if top_items else 'No sales data yet'}

LOW STOCK (< 10 units):
{chr(10).join(low_stock) if low_stock else 'All items well-stocked'}

INVENTORY ({len(inventory)} items shown):
{chr(10).join(inventory) if inventory else 'No inventory data'}

RECENT TRANSACTIONS:
{chr(10).join(recent_txns) if recent_txns else 'No transactions yet'}
""".strip()

        system_prompt = (
            "You are an AI assistant for a Kirana (Indian grocery) store owner using the DukaanGo platform. "
            "Answer questions about store performance, inventory, sales trends, and business advice. "
            "Use the store data provided. Be concise, friendly, and practical. "
            "Use ₹ for currency. If data is missing, say so honestly.\n\n"
            f"{context}"
        )

        payload = {
            "model": "sarvam-105b",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_query}
            ]
        }

        response = requests.post(
            "https://api.sarvam.ai/v1/chat/completions",
            headers={"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"},
            json=payload
        )

        sarvam_data = response.json()

        if "choices" in sarvam_data and sarvam_data["choices"]:
            content = sarvam_data["choices"][0].get("message", {}).get("content", "")
            if content:
                content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
                sarvam_data["choices"][0]["message"]["content"] = content

        return jsonify({"ok": True, "data": sarvam_data})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500

# ─────────────────────────────────────────────────────────────
# LOGIN (MOCK — store owner)
# ─────────────────────────────────────────────────────────────

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get("username", "admin")
    return jsonify({
        "ok": True,
        "data": {
            "token": "lc_mock_token_12345",
            "user": {"username": username, "role": "Store Owner"}
        }
    })

# ─────────────────────────────────────────────────────────────
# CUSTOMER ENDPOINTS
# ─────────────────────────────────────────────────────────────

@app.route('/customer/register', methods=['POST'])
def customer_register():
    try:
        data = request.json or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        name = (data.get("name") or "").strip()
        phone = (data.get("phone") or "").strip()

        # Validate email format
        if not email or "@" not in email or "." not in email.split("@")[-1]:
            return jsonify({"ok": False, "message": "Please enter a valid email address"}), 400
        if len(password) < 8:
            return jsonify({"ok": False, "message": "Password must be at least 8 characters"}), 400
        if not name:
            return jsonify({"ok": False, "message": "Name is required"}), 400

        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

        conn = get_db()
        cursor = conn.cursor()
        try:
            cursor.execute(
                'INSERT INTO customers (email, password_hash, name, phone) VALUES (?, ?, ?, ?)',
                (email, password_hash, name, phone)
            )
            conn.commit()
            customer_id = cursor.lastrowid
        except Exception as e:
            conn.close()
            if "UNIQUE constraint" in str(e):
                return jsonify({"ok": False, "message": "An account with this email already exists"}), 409
            raise e
        conn.close()

        token = create_access_token(identity=str(customer_id))
        return jsonify({
            "ok": True,
            "message": "registered",
            "token": token,
            "name": name
        }), 201
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


@app.route('/customer/login', methods=['POST'])
def customer_login():
    try:
        data = request.json or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not email or not password:
            return jsonify({"ok": False, "message": "Email and password are required"}), 400

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, email, password_hash, name FROM customers WHERE email = ?', (email,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return jsonify({"ok": False, "message": "Invalid email or password"}), 401

        if not bcrypt.checkpw(password.encode(), row["password_hash"].encode()):
            return jsonify({"ok": False, "message": "Invalid email or password"}), 401

        token = create_access_token(identity=str(row["id"]))
        return jsonify({
            "ok": True,
            "token": token,
            "name": row["name"]
        })
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


@app.route('/customer/me', methods=['GET'])
@jwt_required()
def customer_me():
    try:
        customer_id = get_jwt_identity()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, email, name, phone, created_at FROM customers WHERE id = ?', (customer_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return jsonify({"ok": False, "message": "Customer not found"}), 404

        return jsonify({
            "ok": True,
            "data": {
                "id": row["id"],
                "email": row["email"],
                "name": row["name"],
                "phone": row["phone"],
                "created_at": row["created_at"]
            }
        })
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


@app.route('/customer/catalog', methods=['GET'])
def customer_catalog():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT id, name, nameTE, unit, price, qty, category, description FROM inventory WHERE qty > 0'
        )
        rows = cursor.fetchall()
        conn.close()

        items = []
        categories_set = set()
        for row in rows:
            cat = row["category"] or "General"
            categories_set.add(cat)
            items.append({
                "id": row["id"],
                "name": row["name"],
                "nameTE": row["nameTE"],
                "unit": row["unit"],
                "price": row["price"],
                "qty": row["qty"],
                "category": cat,
                "description": row["description"]
            })

        return jsonify({
            "ok": True,
            "categories": sorted(list(categories_set)),
            "items": items
        })
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


@app.route('/customer/order', methods=['POST'])
@jwt_required()
def customer_order():
    try:
        customer_id = get_jwt_identity()
        data = request.json or {}
        items = data.get("items", [])
        delivery_address = (data.get("delivery_address") or "").strip()
        payment_method = data.get("payment_method", "COD")

        if not items:
            return jsonify({"ok": False, "message": "Cart is empty"}), 400
        if len(delivery_address) < 20:
            return jsonify({"ok": False, "message": "Delivery address must be at least 20 characters"}), 400

        conn = get_db()
        cursor = conn.cursor()

        try:
            # Validate stock for each item
            for item in items:
                cursor.execute('SELECT id, name, qty FROM inventory WHERE id = ?', (item["id"],))
                inv_row = cursor.fetchone()
                if not inv_row:
                    conn.close()
                    return jsonify({"ok": False, "message": f"Product not found: {item.get('name', 'Unknown')}"}), 400
                if inv_row["qty"] < item["qty"]:
                    conn.close()
                    return jsonify({"ok": False, "message": f"{inv_row['name']} has only {int(inv_row['qty'])} units left. Please reduce quantity."}), 409

            # Calculate total
            subtotal = sum(i["qty"] * i["price"] for i in items)
            now = datetime.datetime.now()
            txn_id = f"CUST-{now.strftime('%Y%m%d%H%M%S')}-{customer_id}"

            # Insert into transactions (so store owner sees it)
            cursor.execute(
                'INSERT INTO transactions (id, date, hour, subtotal, total, customerName) VALUES (?, ?, ?, ?, ?, ?)',
                (txn_id, now.strftime('%Y-%m-%d'), now.hour, subtotal, subtotal, f"Customer #{customer_id}")
            )

            # Insert transaction items — do NOT deduct inventory here.
            # Inventory is deducted only when the owner marks the order as 'delivered'.
            for item in items:
                line_subtotal = item["qty"] * item["price"]
                cursor.execute(
                    'INSERT INTO transaction_items (txn_id, item_name, qty, price, unit, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
                    (txn_id, item["name"], item["qty"], item["price"], item.get("unit", "pcs"), line_subtotal)
                )

            # Insert into customer_orders
            cursor.execute(
                'INSERT INTO customer_orders (customer_id, txn_id, delivery_address, payment_method, status, total) VALUES (?, ?, ?, ?, ?, ?)',
                (customer_id, txn_id, delivery_address, payment_method, "pending", subtotal)
            )
            order_id = cursor.lastrowid

            # Insert customer_order_items
            for item in items:
                line_subtotal = item["qty"] * item["price"]
                cursor.execute(
                    'INSERT INTO customer_order_items (order_id, item_name, qty, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                    (order_id, item["name"], item["qty"], item["price"], line_subtotal)
                )

            conn.commit()
        except Exception as e:
            conn.rollback()
            conn.close()
            raise e

        conn.close()

        return jsonify({
            "ok": True,
            "order_id": order_id,
            "total": subtotal,
            "estimated_minutes": 20
        }), 201
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


@app.route('/customer/orders', methods=['GET'])
@jwt_required()
def customer_orders():
    try:
        customer_id = get_jwt_identity()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT id, txn_id, delivery_address, payment_method, status, total, created_at FROM customer_orders WHERE customer_id = ? ORDER BY created_at DESC',
            (customer_id,)
        )
        orders = []
        for o in cursor.fetchall():
            cursor.execute(
                'SELECT item_name, qty, price, subtotal FROM customer_order_items WHERE order_id = ?',
                (o["id"],)
            )
            items = [{"name": i["item_name"], "qty": i["qty"], "price": i["price"], "subtotal": i["subtotal"]} for i in cursor.fetchall()]
            orders.append({
                "order_id": o["id"],
                "txn_id": o["txn_id"],
                "date": o["created_at"],
                "total": o["total"],
                "status": o["status"],
                "payment_method": o["payment_method"],
                "delivery_address": o["delivery_address"],
                "items": items
            })
        conn.close()

        return jsonify({"ok": True, "data": orders})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


# ─────────────────────────────────────────────────────────────
# OWNER-FACING ORDER & DELIVERY ENDPOINTS
# ─────────────────────────────────────────────────────────────

VALID_STATUSES = ['pending', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled']

@app.route('/orders', methods=['GET'])
def get_all_orders():
    """Owner/admin facing: returns all customer orders with items and customer name."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT co.id, co.txn_id, co.delivery_address, co.payment_method,
                   co.status, co.total, co.created_at,
                   c.name AS customer_name, c.phone AS customer_phone
            FROM customer_orders co
            LEFT JOIN customers c ON c.id = co.customer_id
            ORDER BY co.created_at DESC
        ''')
        rows = cursor.fetchall()
        orders = []
        for o in rows:
            cursor.execute(
                'SELECT item_name, qty, price, subtotal FROM customer_order_items WHERE order_id = ?',
                (o['id'],)
            )
            items = [{'name': i['item_name'], 'qty': i['qty'],
                      'price': i['price'], 'subtotal': i['subtotal']}
                     for i in cursor.fetchall()]
            orders.append({
                'order_id':       o['id'],
                'txn_id':         o['txn_id'],
                'date':           o['created_at'],
                'total':          o['total'],
                'status':         o['status'],
                'payment_method': o['payment_method'],
                'delivery_address': o['delivery_address'],
                'customer_name':  o['customer_name'] or 'Guest',
                'customer_phone': o['customer_phone'] or '',
                'items':          items
            })
        conn.close()
        return jsonify({'ok': True, 'data': orders})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/orders/<int:order_id>/status', methods=['PATCH'])
def update_order_status(order_id):
    """Owner/admin: advance an order to the next status.
    When transitioning to 'delivered', inventory is automatically deducted.
    """
    try:
        data = request.json or {}
        new_status = (data.get('status') or '').strip().lower()
        if new_status not in VALID_STATUSES:
            return jsonify({'ok': False,
                            'message': f'Invalid status. Allowed: {", ".join(VALID_STATUSES)}'}), 400
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, status FROM customer_orders WHERE id = ?', (order_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({'ok': False, 'message': 'Order not found'}), 404

        prev_status = row['status']
        cursor.execute('UPDATE customer_orders SET status = ? WHERE id = ?', (new_status, order_id))

        # Deduct inventory only when transitioning TO 'delivered' (not already delivered)
        inventory_updated = []
        if new_status == 'delivered' and prev_status != 'delivered':
            cursor.execute(
                'SELECT item_name, qty FROM customer_order_items WHERE order_id = ?',
                (order_id,)
            )
            order_items = cursor.fetchall()
            for item_row in order_items:
                cursor.execute(
                    'UPDATE inventory SET qty = MAX(0, qty - ?), lastUpdated = CURRENT_TIMESTAMP WHERE name = ?',
                    (item_row['qty'], item_row['item_name'])
                )
                inventory_updated.append({'name': item_row['item_name'], 'deducted': item_row['qty']})

        conn.commit()
        conn.close()
        return jsonify({
            'ok': True,
            'order_id': order_id,
            'status': new_status,
            'inventory_updated': inventory_updated
        })
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/inventory/alerts', methods=['GET'])
def inventory_alerts():
    """Returns low-stock items (qty <= 10) and stale-zero items (qty=0, not restocked in 3 days)."""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Low stock: qty between 1 and 10 inclusive
        cursor.execute(
            'SELECT id, name, qty, category FROM inventory WHERE qty > 0 AND qty <= 10 ORDER BY qty ASC'
        )
        low_stock = [
            {'id': r['id'], 'name': r['name'], 'qty': r['qty'], 'category': r['category'] or 'General'}
            for r in cursor.fetchall()
        ]

        # Stale zero: qty = 0 AND lastUpdated older than 3 days
        cutoff = (datetime.datetime.utcnow() - datetime.timedelta(days=3)).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute(
            'SELECT id, name, lastUpdated FROM inventory WHERE qty = 0 AND lastUpdated < ? ORDER BY lastUpdated ASC',
            (cutoff,)
        )
        stale_zero = [
            {'id': r['id'], 'name': r['name'], 'lastUpdated': r['lastUpdated']}
            for r in cursor.fetchall()
        ]

        conn.close()
        return jsonify({'ok': True, 'low_stock': low_stock, 'stale_zero': stale_zero})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/delivery/partners', methods=['GET'])
def get_delivery_partners():
    """Returns all delivery partners with active delivery count."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT id, name, phone, status FROM delivery_partners ORDER BY name')
        partners = []
        for p in cursor.fetchall():
            cursor.execute(
                "SELECT COUNT(*) FROM customer_orders WHERE status = 'out_for_delivery'",
            )
            # Simplified: share active count across the board since we don't have
            # a partner_id FK on orders yet — show total in-transit count
            active = cursor.fetchone()[0]
            partners.append({
                'id':     p['id'],
                'name':   p['name'],
                'phone':  p['phone'],
                'status': p['status'],
            })
        conn.close()
        return jsonify({'ok': True, 'data': partners})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/delivery/partners', methods=['POST'])
def add_delivery_partner():
    """Add a new delivery partner."""
    try:
        data = request.json or {}
        name = (data.get('name') or '').strip()
        phone = (data.get('phone') or '').strip()
        if not name:
            return jsonify({'ok': False, 'message': 'Name is required'}), 400
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO delivery_partners (name, phone, status) VALUES (?, ?, ?)',
            (name, phone, 'available')
        )
        new_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return jsonify({'ok': True, 'id': new_id, 'name': name, 'phone': phone,
                        'status': 'available'}), 201
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/delivery/partners/<int:partner_id>/status', methods=['PATCH'])
def update_partner_status(partner_id):
    """Toggle a delivery partner's availability."""
    try:
        data = request.json or {}
        new_status = (data.get('status') or '').strip().lower()
        if new_status not in ('available', 'busy', 'offline'):
            return jsonify({'ok': False, 'message': 'status must be available, busy, or offline'}), 400
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('UPDATE delivery_partners SET status = ? WHERE id = ?', (new_status, partner_id))
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'ok': False, 'message': 'Partner not found'}), 404
        conn.commit()
        conn.close()
        return jsonify({'ok': True, 'id': partner_id, 'status': new_status})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


# --- RIDER APIs ---

def require_rider():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(' ')[1]
    if token.startswith('lc_rider_token_'):
        try:
            return int(token.split('_')[-1])
        except:
            return None
    return None

@app.route('/rider/login', methods=['POST'])
def rider_login():
    try:
        data = request.json or {}
        phone = (data.get('phone') or '').strip()
        if not phone:
            return jsonify({'ok': False, 'message': 'Phone number required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM delivery_partners WHERE phone = ?", (phone,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return jsonify({'ok': False, 'message': 'Rider not found with this phone number'}), 404
            
        token = f"lc_rider_token_{row['id']}"
        return jsonify({'ok': True, 'token': token, 'rider': {'id': row['id'], 'name': row['name']}})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500

@app.route('/rider/orders', methods=['GET'])
def rider_orders():
    partner_id = require_rider()
    if not partner_id:
        return jsonify({'ok': False, 'message': 'Unauthorized'}), 401
        
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Get unassigned orders (status='packed')
        cursor.execute('''
            SELECT co.id, co.status, co.total, co.delivery_address, c.name as customer_name, c.phone as customer_phone
            FROM customer_orders co
            LEFT JOIN customers c ON c.id = co.customer_id
            WHERE co.status = 'packed' AND co.partner_id IS NULL
            ORDER BY co.created_at ASC
        ''')
        available_orders = [dict(r) for r in cursor.fetchall()]
        
        # Get active assigned order (status='out_for_delivery' or 'packed' and assigned to this rider)
        cursor.execute('''
            SELECT co.id, co.status, co.total, co.delivery_address, c.name as customer_name, c.phone as customer_phone
            FROM customer_orders co
            LEFT JOIN customers c ON c.id = co.customer_id
            WHERE co.partner_id = ? AND co.status IN ('packed', 'out_for_delivery')
        ''', (partner_id,))
        active_orders = [dict(r) for r in cursor.fetchall()]
        
        # Get past delivered orders
        cursor.execute('''
            SELECT co.id, co.status, co.total, co.delivery_address, co.delivery_fee, c.name as customer_name
            FROM customer_orders co
            LEFT JOIN customers c ON c.id = co.customer_id
            WHERE co.partner_id = ? AND co.status = 'delivered'
            ORDER BY co.created_at DESC LIMIT 50
        ''', (partner_id,))
        past_orders = [dict(r) for r in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            'ok': True, 
            'available': available_orders,
            'active': active_orders,
            'past': past_orders
        })
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500

@app.route('/rider/orders/<int:order_id>/accept', methods=['POST'])
def rider_accept_order(order_id):
    partner_id = require_rider()
    if not partner_id:
        return jsonify({'ok': False, 'message': 'Unauthorized'}), 401
        
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT status, partner_id FROM customer_orders WHERE id = ?', (order_id,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            return jsonify({'ok': False, 'message': 'Order not found'}), 404
            
        if row['partner_id'] is not None and row['partner_id'] != partner_id:
            conn.close()
            return jsonify({'ok': False, 'message': 'Order already assigned to another rider'}), 400
            
        cursor.execute('UPDATE customer_orders SET partner_id = ? WHERE id = ?', (partner_id, order_id))
        conn.commit()
        conn.close()
        
        return jsonify({'ok': True, 'message': 'Order accepted successfully'})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500

@app.route('/rider/orders/<int:order_id>/photo', methods=['POST'])
def rider_upload_photo(order_id):
    partner_id = require_rider()
    if not partner_id:
        return jsonify({'ok': False, 'message': 'Unauthorized'}), 401
        
    try:
        data = request.json or {}
        photo_type = data.get('type') # 'pickup' or 'dropoff'
        photo_data = data.get('photo') # base64 string
        
        if photo_type not in ('pickup', 'dropoff'):
            return jsonify({'ok': False, 'message': 'Invalid photo type'}), 400
            
        if not photo_data:
            return jsonify({'ok': False, 'message': 'Photo data is required'}), 400
            
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT status, partner_id FROM customer_orders WHERE id = ?', (order_id,))
        row = cursor.fetchone()
        
        if not row or row['partner_id'] != partner_id:
            conn.close()
            return jsonify({'ok': False, 'message': 'Order not found or not assigned to you'}), 404
            
        prev_status = row['status']
        new_status = 'out_for_delivery' if photo_type == 'pickup' else 'delivered'
        
        if photo_type == 'pickup':
            cursor.execute('UPDATE customer_orders SET pickup_photo = ?, status = ? WHERE id = ?', (photo_data, new_status, order_id))
        else:
            cursor.execute('UPDATE customer_orders SET dropoff_photo = ?, status = ? WHERE id = ?', (photo_data, new_status, order_id))
            
        # If dropping off, deduct inventory (logic copied from admin update_order_status)
        inventory_updated = []
        if new_status == 'delivered' and prev_status != 'delivered':
            cursor.execute('SELECT item_name, qty FROM customer_order_items WHERE order_id = ?', (order_id,))
            order_items = cursor.fetchall()
            for item_row in order_items:
                cursor.execute(
                    'UPDATE inventory SET qty = MAX(0, qty - ?), lastUpdated = CURRENT_TIMESTAMP WHERE name = ?',
                    (item_row['qty'], item_row['item_name'])
                )
                inventory_updated.append({'name': item_row['item_name'], 'deducted': item_row['qty']})
                
        conn.commit()
        conn.close()
        
        return jsonify({'ok': True, 'message': f'{photo_type.title()} photo saved successfully', 'status': new_status, 'inventory_updated': inventory_updated})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500

@app.route('/rider/earnings', methods=['GET'])
def rider_earnings():
    partner_id = require_rider()
    if not partner_id:
        return jsonify({'ok': False, 'message': 'Unauthorized'}), 401
        
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT COUNT(*) as trips, SUM(delivery_fee) as total_earnings
            FROM customer_orders
            WHERE partner_id = ? AND status = 'delivered'
        ''', (partner_id,))
        row = cursor.fetchone()
        
        conn.close()
        
        return jsonify({
            'ok': True, 
            'trips': row['trips'] or 0, 
            'earnings': row['total_earnings'] or 0
        })
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


if __name__ == '__main__':
    init_db()

    # Seed demo customer account if it doesn't exist
    try:
        _conn = get_db()
        _cur = _conn.cursor()
        _cur.execute("SELECT id FROM customers WHERE email = ?", ("demo@customer.com",))
        if not _cur.fetchone():
            _hash = bcrypt.hashpw(b"demo12345", bcrypt.gensalt()).decode()
            _cur.execute(
                "INSERT INTO customers (email, password_hash, name, phone) VALUES (?, ?, ?, ?)",
                ("demo@customer.com", _hash, "Demo Customer", "9999999999")
            )
            _conn.commit()
        _conn.close()
    except Exception as _e:
        print(f"[warn] Could not seed demo customer: {_e}")
    port = int(os.environ.get("APP_PORT", 5005))
    host = os.environ.get("APP_HOST", "0.0.0.0")
    print(f"Starting backend server on {host}:{port}")
    app.run(host=host, port=port, debug=True)
