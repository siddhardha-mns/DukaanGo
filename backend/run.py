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
        payload = {'model': 'saaras:v1'} # Default model
        
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
        # Fallback to a very simple local response if Sarvam is offline
        return jsonify({"ok": True, "data": {"content": "I am currently in offline mode. Please configure Sarvam AI for smarter insights."}})

    try:
        user_query = request.json.get("query")
        
        # Fetch some context from DB
        conn = get_db()
        cursor = conn.cursor()
        
        # Summary statistics
        cursor.execute("SELECT SUM(total) as revenue, COUNT(*) as txns FROM transactions")
        stats = cursor.fetchone()
        
        # Low stock items
        cursor.execute("SELECT name, qty FROM inventory WHERE qty < 10 LIMIT 5")
        low_stock = [f"{r['name']} ({r['qty']})" for r in cursor.fetchall()]
        
        conn.close()
        
        context = f"Total Revenue: ₹{stats['revenue'] or 0}. Total Transactions: {stats['txns'] or 0}. Low stock: {', '.join(low_stock) or 'None'}."
        
        system_prompt = f"You are an AI assistant for a Kirana shop owner. Use this context: {context}. Be concise and helpful."
        
        payload = {
            "model": "sarvam-m",
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
        
        # Clean up <think> blocks if present in the response content
        if "choices" in sarvam_data and len(sarvam_data["choices"]) > 0:
            content = sarvam_data["choices"][0].get("message", {}).get("content", "")
            if content:
                # Remove everything between <think> and </think> (including the tags)
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

            # Insert transaction items + deduct inventory
            for item in items:
                line_subtotal = item["qty"] * item["price"]
                cursor.execute(
                    'INSERT INTO transaction_items (txn_id, item_name, qty, price, unit, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
                    (txn_id, item["name"], item["qty"], item["price"], item.get("unit", "pcs"), line_subtotal)
                )
                cursor.execute(
                    'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?',
                    (item["qty"], item["id"])
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


if __name__ == '__main__':
    init_db()
    port = int(os.environ.get("APP_PORT", 5005))
    host = os.environ.get("APP_HOST", "0.0.0.0")
    print(f"Starting backend server on {host}:{port}")
    app.run(host=host, port=port, debug=True)
