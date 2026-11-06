import os
import json
import sqlite3
import glob

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data', 'otzaria_library')
DB_PATH = os.path.join(DATA_DIR, 'seforim.db')
MANIFEST_PATH = os.path.join(DATA_DIR, 'files_manifest.json')
METADATA_PATH = os.path.join(DATA_DIR, 'metadata.json')
LINKS_DIR = os.path.join(DATA_DIR, 'links')

print(f"[build_seforim_db] Starting SQLite database creation at: {DB_PATH}")

if os.path.exists(DB_PATH):
    try:
        os.remove(DB_PATH)
    except:
        pass

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Create tables
cursor.execute("""
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category_path TEXT NOT NULL,
    author TEXT,
    he_desc TEXT,
    pub_date TEXT,
    pub_place TEXT,
    relative_path TEXT NOT NULL UNIQUE,
    file_type TEXT DEFAULT 'txt',
    order_num INTEGER DEFAULT 0,
    has_toc INTEGER DEFAULT 1,
    has_links INTEGER DEFAULT 1
);
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    parent_path TEXT
);
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_title TEXT,
    line_index INTEGER,
    source_book TEXT,
    category TEXT,
    link_text TEXT
);
""")

cursor.execute("CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);")
cursor.execute("CREATE INDEX IF NOT EXISTS idx_books_cat ON books(category_path);")
cursor.execute("CREATE INDEX IF NOT EXISTS idx_links_title_line ON links(book_title, line_index);")

# Load metadata
metadata_map = {}
if os.path.exists(METADATA_PATH):
    try:
        with open(METADATA_PATH, 'r', encoding='utf-8') as f:
            meta_list = json.load(f)
            for item in meta_list:
                t = item.get('title', '').strip()
                if t:
                    metadata_map[t] = item
        print(f"[build_seforim_db] Loaded {len(metadata_map)} items from metadata.json")
    except Exception as e:
        print(f"[build_seforim_db] Error reading metadata.json: {e}")

# Load manifest
manifest_files = []
if os.path.exists(MANIFEST_PATH):
    try:
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
            mf = json.load(f)
            if isinstance(mf, dict):
                manifest_files = list(mf.keys())
            elif isinstance(mf, list):
                manifest_files = [x.get('path', '') if isinstance(x, dict) else str(x) for x in mf]
        print(f"[build_seforim_db] Loaded {len(manifest_files)} entries from files_manifest.json")
    except Exception as e:
        print(f"[build_seforim_db] Error reading files_manifest.json: {e}")

# If manifest is empty, scan disk
if not manifest_files:
    root_seforim = os.path.join(DATA_DIR, 'אוצריא')
    if os.path.exists(root_seforim):
        for root, dirs, files in os.walk(root_seforim):
            for file in files:
                if file.endswith('.txt') or file.endswith('.pdf') or file.endswith('.docx'):
                    full_p = os.path.join(root, file)
                    rel_p = os.path.relpath(full_p, DATA_DIR).replace('\\', '/')
                    manifest_files.append(rel_p)

# Insert books & categories
all_categories = set()
book_count = 0

for rel_path in manifest_files:
    if not rel_path.endswith('.txt') and not rel_path.endswith('.pdf'):
        continue
    
    clean_p = rel_path.replace('אוצריא/', '', 1) if rel_path.startswith('אוצריא/') else rel_path
    parts = clean_p.split('/')
    file_name = parts[-1]
    title = os.path.splitext(file_name)[0].strip()
    
    cat_parts = parts[:-1]
    category_path = '/'.join(cat_parts) if cat_parts else 'כללי'
    
    # Collect categories hierarchy
    for i in range(1, len(cat_parts) + 1):
        sub_cat_path = '/'.join(cat_parts[:i])
        all_categories.add(sub_cat_path)
    
    meta = metadata_map.get(title, {})
    author = meta.get('author') or ''
    he_desc = meta.get('heDesc') or meta.get('heShortDesc') or ''
    pub_date = meta.get('pubDate') or ''
    pub_place = meta.get('pubPlace') or ''
    
    cursor.execute("""
    INSERT OR IGNORE INTO books (title, category_path, author, he_desc, pub_date, pub_place, relative_path, file_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (title, category_path, author, he_desc, pub_date, pub_place, rel_path, 'txt' if rel_path.endswith('.txt') else 'pdf'))
    book_count += 1

# Insert categories
for cat_path in sorted(all_categories):
    parts = cat_path.split('/')
    cat_name = parts[-1]
    parent_path = '/'.join(parts[:-1]) if len(parts) > 1 else None
    cat_id = cat_path.replace('/', '_').replace(' ', '_')
    cursor.execute("""
    INSERT OR IGNORE INTO categories (id, name, path, parent_path)
    VALUES (?, ?, ?, ?)
    """, (cat_id, cat_name, cat_path, parent_path))

conn.commit()
print(f"[build_seforim_db] Successfully inserted {book_count} books and {len(all_categories)} categories into seforim.db")

# Process links if links folder exists
if os.path.exists(LINKS_DIR):
    link_files = glob.glob(os.path.join(LINKS_DIR, '*_links.json'))
    print(f"[build_seforim_db] Found {len(link_files)} links files to index")
    link_count = 0
    
    for l_path in link_files:
        try:
            with open(l_path, 'r', encoding='utf-8') as lf:
                links_data = json.load(lf)
                if isinstance(links_data, list):
                    for l in links_data:
                        b_title = l.get('target_title') or l.get('book_title') or l.get('target') or ''
                        l_idx = l.get('line_index') or l.get('line') or l.get('target_line') or 1
                        s_book = l.get('source_title') or l.get('source_book') or l.get('source') or ''
                        cat = l.get('category') or 'מפרשים'
                        txt = l.get('text') or l.get('snippet') or ''
                        if b_title and s_book:
                            cursor.execute("""
                            INSERT INTO links (book_title, line_index, source_book, category, link_text)
                            VALUES (?, ?, ?, ?, ?)
                            """, (b_title, l_idx, s_book, cat, txt))
                            link_count += 1
        except Exception as e:
            pass
    conn.commit()
    print(f"[build_seforim_db] Inserted {link_count} commentary links into database.")

conn.close()
print(f"[build_seforim_db] Complete! seforim.db is ready.")
