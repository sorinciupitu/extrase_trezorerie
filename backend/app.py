import os
import sqlite3
import pdfplumber
import re
import uuid
from operator import itemgetter
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)

DB_FILE = "trezorerie.db"
UPLOAD_FOLDER = "uploads"

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# --- DATABASE SETUP ---
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 1. USERS: id, username, password_hash, role
    c.execute('''CREATE TABLE IF NOT EXISTS users 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  username TEXT UNIQUE, 
                  password TEXT, 
                  role TEXT)''')
    
    # 2. TRANSACTIONS: added user_id
    c.execute('''CREATE TABLE IF NOT EXISTS transactions 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  user_id INTEGER,
                  date TEXT, 
                  date_iso TEXT, 
                  partner TEXT, 
                  details TEXT, 
                  ref_number TEXT,
                  amount REAL, 
                  type TEXT, 
                  filename TEXT)''')
    
    # 3. META: added user_id (key is not unique globally anymore, unique per user)
    c.execute('''CREATE TABLE IF NOT EXISTS meta 
                 (user_id INTEGER, key TEXT, value TEXT, 
                  PRIMARY KEY (user_id, key))''')
    
    # 4. SESSIONS (Simple Token System)
    c.execute('''CREATE TABLE IF NOT EXISTS sessions 
                 (token TEXT PRIMARY KEY, user_id INTEGER, created_at TEXT)''')

    # Create default Admin if not exists
    c.execute("SELECT * FROM users WHERE username='admin'")
    if not c.fetchone():
        # Default pass: 'admin' -> Change immediately!
        hashed_pw = generate_password_hash('admin') 
        c.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", 
                  ('admin', hashed_pw, 'admin'))
        
    conn.commit()
    conn.close()

init_db()

# --- SECURITY & AUTH HELPERS ---
def get_user_from_token():
    token = request.headers.get('Authorization')
    if not token: return None
    token = token.replace('Bearer ', '')
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT user_id FROM sessions WHERE token=?", (token,))
    res = c.fetchone()
    conn.close()
    return res[0] if res else None

def get_user_details(user_id):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT id, username, role FROM users WHERE id=?", (user_id,))
    res = c.fetchone()
    conn.close()
    return res

# --- LOGIC HELPERS ---
def convert_to_iso(date_str):
    clean_date = date_str.replace(" ", "")
    try:
        return datetime.strptime(clean_date, "%d.%m.%Y").strftime("%Y-%m-%d")
    except:
        return "1900-01-01"

def parse_amount(text):
    if not text: return 0.0
    text = text.strip()
    clean = text.replace('=', '').replace(' ', '')
    if clean in ['.00', '00', '0', '.0', ',00']: return 0.0
    if clean.startswith('.'): clean = '0' + clean
    try:
        if ',' in clean and '.' in clean:
             if clean.find('.') < clean.find(','): 
                 clean = clean.replace('.', '').replace(',', '.') 
             else:
                 clean = clean.replace(',', '') 
        elif ',' in clean:
             clean = clean.replace(',', '.') 
        return float(clean)
    except:
        return 0.0

def clean_partner_name(raw_text):
    if not raw_text: return "Necunoscut"
    text = re.sub(r'RO\d{2}[A-Z]{4}[\w\d]+', '', raw_text) 
    text = re.sub(r'TZ\d+', '', text)
    text = re.sub(r'\d{2}\.\d{2}\.\d{4}', '', text)
    text = re.sub(r'\b\d{5,13}\b', '', text)
    text = re.sub(r'^\d+\s+', '', text)
    text = re.sub(r'^[ .\-,]+', '', text) 
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def update_balance_smart(user_id, new_balance, new_date_iso):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT value FROM meta WHERE user_id=? AND key='balance_date'", (user_id,))
    res = c.fetchone()
    current_date_iso = res[0] if res else "1900-01-01"
    
    if new_date_iso >= current_date_iso:
        c.execute("INSERT OR REPLACE INTO meta (user_id, key, value) VALUES (?, 'balance', ?)", (user_id, str(new_balance)))
        c.execute("INSERT OR REPLACE INTO meta (user_id, key, value) VALUES (?, 'balance_date', ?)", (user_id, new_date_iso))
    conn.commit()
    conn.close()

# --- PARSER ---
def parse_trezorerie_visual(filepath, filename, user_id):
    transactions = []
    print(f"\n--- [DEBUG] PROCESARE USER {user_id}: {filename} ---")
    
    file_date_iso = "1900-01-01"

    with pdfplumber.open(filepath) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            width = page.width
            words = page.extract_words(keep_blank_chars=True, x_tolerance=3, y_tolerance=3)
            
            debit_header = next((w for w in words if "DEBIT" in w['text'].upper()), None)
            credit_header = next((w for w in words if "CREDIT" in w['text'].upper()), None)
            split_x = (debit_header['x0'] + credit_header['x0']) / 2 if (debit_header and credit_header) else width * 0.65
            
            words.sort(key=itemgetter('top'))
            rows = []
            if words:
                current_row = [words[0]]
                for word in words[1:]:
                    if abs(word['top'] - current_row[-1]['top']) < 5:
                        current_row.append(word)
                    else:
                        rows.append(current_row)
                        current_row = [word]
                rows.append(current_row)
            
            for row in rows:
                row.sort(key=itemgetter('x0'))
                line_text = " ".join([w['text'] for w in row])
                
                if file_date_iso == "1900-01-01":
                     match_gen_date = re.search(r'(\d{2}\.\d{2}\.\d{4})', line_text)
                     if match_gen_date:
                         cand = match_gen_date.group(1)
                         if "20" in cand and ("la data" in line_text.lower() or "editat" in line_text.lower()):
                             file_date_iso = convert_to_iso(cand)

                if "Sold final" in line_text:
                    potential_nums = []
                    for w in row:
                        txt = w['text'].replace('=','').strip()
                        if re.search(r'\d', txt) and ('.' in txt or ',' in txt):
                            val = parse_amount(txt)
                            if val > 0: potential_nums.append(val)
                    if potential_nums:
                        update_balance_smart(user_id, potential_nums[-1], file_date_iso)

                match_date = re.search(r'(\d{2}\s*\.\s*\d{2}\s*\.\s*\d{4})', line_text)
                if match_date:
                    found_date = match_date.group(1)
                    numeric_tokens = []
                    for w in row:
                        txt = w['text'].replace('=','').strip()
                        if re.search(r'\d', txt) and ('.' in txt or ',' in txt) and len(txt) < 15:
                             if txt not in found_date:
                                 if w['x0'] > width * 0.3: 
                                     numeric_tokens.append({'val': parse_amount(txt), 'x': w['x0'], 'text': txt})

                    valid_amounts = [n for n in numeric_tokens if n['val'] > 0]
                    if not valid_amounts: continue
                    valid_amounts.sort(key=itemgetter('x'))
                    
                    amount = 0.0
                    t_type = ""
                    
                    if len(valid_amounts) >= 2:
                        if valid_amounts[-1]['val'] > 0:
                            amount = valid_amounts[-1]['val']; t_type = "credit"
                        elif valid_amounts[-2]['val'] > 0:
                            amount = valid_amounts[-2]['val']; t_type = "debit"
                    elif len(valid_amounts) == 1:
                        if valid_amounts[0]['x'] > split_x:
                            amount = valid_amounts[0]['val']; t_type = "credit"
                        else:
                            amount = valid_amounts[0]['val']; t_type = "debit"

                    if amount > 0:
                        raw_text = line_text.replace(found_date, '')
                        for n in numeric_tokens: raw_text = raw_text.replace(n['text'], '')
                        raw_text = raw_text.strip()
                        
                        ref_number = ""
                        match_ref = re.search(r'(TZ\d+)', raw_text)
                        if match_ref: ref_number = match_ref.group(1)

                        iban = ""
                        match_iban = re.search(r'(RO\d{2}[A-Z]{4}[\w\d]+)', raw_text)
                        if match_iban: iban = match_iban.group(1)
                        
                        clean_partner = clean_partner_name(raw_text)
                        if not clean_partner and iban: clean_partner = "Transfer Bancar"
                        details_text = iban if iban else "Plata Trezorerie"
                        iso_date = convert_to_iso(found_date)

                        transactions.append({
                            "date": found_date.replace(" ", ""),
                            "date_iso": iso_date,
                            "partner": clean_partner,
                            "details": details_text,
                            "ref_number": ref_number,
                            "amount": amount,
                            "type": t_type,
                            "filename": filename
                        })
    return transactions

# --- AUTH ENDPOINTS ---

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT id, password, role FROM users WHERE username=?", (data['username'],))
    user = c.fetchone()
    
    if user and check_password_hash(user[1], data['password']):
        # Generate token
        token = str(uuid.uuid4())
        c.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", 
                  (token, user[0], datetime.now().isoformat()))
        conn.commit()
        conn.close()
        return jsonify({
            "status": "success", 
            "token": token, 
            "role": user[2],
            "username": data['username']
        })
    
    conn.close()
    return jsonify({"status": "error", "message": "Date incorecte"}), 401

@app.route('/logout', methods=['POST'])
def logout():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM sessions WHERE token=?", (token,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/create-user', methods=['POST'])
def create_user():
    # Only Admin
    admin_id = get_user_from_token()
    if not admin_id: return jsonify({"error": "Unauthorized"}), 401
    
    admin_details = get_user_details(admin_id)
    if admin_details[2] != 'admin': return jsonify({"error": "Forbidden"}), 403
    
    data = request.json
    if not data.get('username') or not data.get('password'):
        return jsonify({"error": "Missing fields"}), 400
        
    hashed_pw = generate_password_hash(data['password'])
    
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", 
                  (data['username'], hashed_pw, 'user'))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "User creat!"})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Userul exista deja"}), 400

@app.route('/change-password', methods=['POST'])
def change_password():
    user_id = get_user_from_token()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    
    data = request.json
    new_hash = generate_password_hash(data['new_password'])
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("UPDATE users SET password=? WHERE id=?", (new_hash, user_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": "Parola schimbata!"})

@app.route('/list-users', methods=['GET'])
def list_users():
    admin_id = get_user_from_token()
    if not admin_id: return jsonify({"error": "Unauthorized"}), 401
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    # Check if admin
    c.execute("SELECT role FROM users WHERE id=?", (admin_id,))
    if c.fetchone()[0] != 'admin': return jsonify({"error": "Forbidden"}), 403
    
    c.execute("SELECT id, username, role FROM users")
    users = [{"id": r[0], "username": r[1], "role": r[2]} for r in c.fetchall()]
    conn.close()
    return jsonify(users)

# --- DATA ENDPOINTS (SCOPED TO USER) ---

@app.route('/upload', methods=['POST'])
def upload_file():
    user_id = get_user_from_token()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401

    if 'file' not in request.files: return jsonify({"error": "No file"}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({"error": "No selected file"}), 400

    # Prefixam fisierul cu user_id pt a evita coliziuni intre useri
    safe_filename = f"{user_id}_{file.filename}"
    filepath = os.path.join(UPLOAD_FOLDER, safe_filename)
    file.save(filepath)
    
    try:
        new_transactions = []
        if file.filename.lower().endswith('.pdf'):
            new_transactions = parse_trezorerie_visual(filepath, file.filename, user_id)

        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        count = 0
        for t in new_transactions:
            # Check existenta (scoped la user_id)
            c.execute("SELECT id FROM transactions WHERE user_id=? AND date_iso=? AND amount=? AND partner=? AND filename=?", 
                     (user_id, t['date_iso'], t['amount'], t['partner'], t['filename']))
            if not c.fetchone():
                c.execute("""INSERT INTO transactions 
                             (user_id, date, date_iso, partner, details, ref_number, amount, type, filename) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                          (user_id, t['date'], t['date_iso'], t['partner'], t['details'], t['ref_number'], t['amount'], t['type'], t['filename']))
                count += 1
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "added": count})
    except Exception as e:
        print(f"EROARE: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/transactions', methods=['GET'])
def get_transactions():
    user_id = get_user_from_token()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    # Doar tranzactiile userului curent
    c.execute("SELECT * FROM transactions WHERE user_id=? ORDER BY date_iso DESC, id DESC", (user_id,))
    rows = c.fetchall()
    transactions = [dict(row) for row in rows]
    
    # Doar soldul userului curent
    c.execute("SELECT value FROM meta WHERE user_id=? AND key='balance'", (user_id,))
    res = c.fetchone()
    balance = float(res['value']) if res else 0.00
    
    # Totaluri calculate
    c.execute("SELECT SUM(amount) FROM transactions WHERE user_id=? AND type='credit'", (user_id,))
    res_inc = c.fetchone()[0]
    total_income = res_inc if res_inc else 0.00
    
    c.execute("SELECT SUM(amount) FROM transactions WHERE user_id=? AND type='debit'", (user_id,))
    res_exp = c.fetchone()[0]
    total_expense = res_exp if res_exp else 0.00

    conn.close()
    return jsonify({
        "transactions": transactions, 
        "balance": balance,
        "total_income": total_income,
        "total_expense": total_expense
    })

@app.route('/delete-file', methods=['POST'])
def delete_file():
    user_id = get_user_from_token()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    
    filename = request.json.get('filename')
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM transactions WHERE user_id=? AND filename=?", (user_id, filename))
    conn.commit()
    conn.close()
    return jsonify({"status": "deleted"})

if __name__ == '__main__':
    print("Serverul Trezorerie ruleaza pe portul 5001...")
    app.run(debug=True, port=5001, host='0.0.0.0') # host 0.0.0.0 pt Docker