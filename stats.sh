#!/bin/bash

LOG_DIR="./logs/otzaria"
TODAY=$(date +%Y-%m-%d)

echo "=== סטטיסטיקות לאתר אוצריה ==="
echo ""

# סה"כ בקשות היום
if [ -f "$LOG_DIR/$TODAY.json" ]; then
    TOTAL=$(wc -l < "$LOG_DIR/$TODAY.json")
    echo "📊 סה״כ בקשות היום: $TOTAL"
else
    echo "📊 אין לוגים להיום"
fi

# מבקרים ייחודיים
if [ -f "$LOG_DIR/$TODAY.json" ]; then
    UNIQUE=$(cat "$LOG_DIR/$TODAY.json" | jq -r '.ip' | sort -u | wc -l)
    echo "👥 מבקרים ייחודיים: $UNIQUE"
fi

echo ""
echo "=== ספרים פופולריים ==="
cat "$LOG_DIR"/*.json 2>/dev/null | jq -r '.bookId // empty' | sort | uniq -c | sort -rn | head -10

echo ""
echo "=== חיפושים פופולריים ==="
cat "$LOG_DIR"/*.json 2>/dev/null | jq -r '.query // empty' | sort | uniq -c | sort -rn | head -10

echo ""
echo "=== בקשות לפי שעה ==="
cat "$LOG_DIR/$TODAY.json" 2>/dev/null | jq -r '.timestamp' | cut -dT -f2 | cut -d: -f1 | sort | uniq -c | sort -rn | head -24
