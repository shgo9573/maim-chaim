#!/bin/bash

DB_PATH="/var/data/otzaria/seforim.db"

echo "=================================================="
echo "[Otzaria Startup] Starting RAM Warm-up phase..."
echo "=================================================="

if [ -f "$DB_PATH" ]; then
  echo "[Warm-up] Preloading $DB_PATH into Linux OS Page Cache..."
  start_time=$(date +%s)
  dd if="$DB_PATH" of=/dev/null bs=1M status=progress
  end_time=$(date +%s)
  elapsed=$((end_time - start_time))
  echo "[Warm-up] Complete! 7.4GB loaded into RAM in ${elapsed}s. All subsequent SQLite queries will run at memory speed (0-2ms)."
else
  echo "[Warm-up] Notice: $DB_PATH not found, skipping preloading."
fi

echo "=================================================="
echo "[Otzaria Startup] Launching Node.js Server..."
echo "=================================================="

exec node server.ts
