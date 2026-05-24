import sqlite3
from pathlib import Path

DB_FILE = Path(__file__).parent / "localcart.db"

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Inventory Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            nameTE TEXT,
            unit TEXT DEFAULT 'pcs',
            price REAL NOT NULL,
            qty REAL NOT NULL,
            category TEXT,
            expiry TEXT,
            sku TEXT,
            description TEXT,
            lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Transactions Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            hour INTEGER NOT NULL,
            subtotal REAL,
            discount REAL,
            discountType TEXT,
            total REAL,
            customerName TEXT
        )
    ''')

    # Transaction Items Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transaction_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            txn_id TEXT,
            item_name TEXT,
            qty REAL,
            price REAL,
            unit TEXT,
            subtotal REAL,
            FOREIGN KEY(txn_id) REFERENCES transactions(id)
        )
    ''')

    # Customers Table (for customer panel auth)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT,
            phone TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Customer Orders Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS customer_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            txn_id TEXT,
            delivery_address TEXT,
            payment_method TEXT DEFAULT 'COD',
            status TEXT DEFAULT 'pending',
            total REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (txn_id) REFERENCES transactions(id)
        )
    ''')

    # Customer Order Items Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS customer_order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            item_name TEXT,
            qty INTEGER,
            price REAL,
            subtotal REAL,
            FOREIGN KEY (order_id) REFERENCES customer_orders(id)
        )
    ''')

    # Insert default data if inventory is empty
    cursor.execute('SELECT COUNT(*) FROM inventory')
    if cursor.fetchone()[0] == 0:
        default_items = [
            ('Basmati Rice', 'బాస్మతి బియ్యం', 'kg', 77, 142, 'Grains', '2026-08'),
            ('Toor Dal', 'కందిపప్పు', 'kg', 140, 80, 'Grains', '2026-12'),
            ('Fortune Oil', 'ఫార్చ్యూన్ ఆయిల్', 'L', 210, 56, 'Cooking', '2026-12'),
            ('Amul Milk', 'అమూల్ పాలు', 'pkt', 28, 87, 'Dairy', '2026-04'),
            ('Amul Butter', 'అమూల్ వెన్న', 'pkt', 270, 3, 'Dairy', '2026-05'),
            ('Maggi', 'మ్యాగీ', 'pkt', 14, 200, 'Snacks', '2026-09'),
            ('Coke', 'కోక్', 'pcs', 40, 120, 'Beverages', '2026-12')
        ]
        cursor.executemany('''
            INSERT INTO inventory (name, nameTE, unit, price, qty, category, expiry)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', default_items)
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
