#!/usr/bin/env python3
"""
Otzaria Async High-Performance Load Testing Engine
מנוע בדיקת עומסים א-סינכרוני מבוסס Python 3 Stdlib (ללא צורך ב-pip)
מדמה עד 1,500+ משתמשים כבדים בו זמנית עם Ramp-up הדרגתי ומדידת זמני תגובה ואחוזונים.
"""

import asyncio
import json
import math
import random
import time
import urllib.parse
import uuid
from typing import Dict, List, Tuple

TARGET_HOST = "127.0.0.1"
TARGET_PORT = 3000

SAMPLE_BOOK_IDS = [1, 2, 3, 4, 5, 8, 10, 12, 14, 15, 16]
SEARCH_QUERIES = ["בראשית", "שמע ישראל", "שבת", "תורה", "משה רבנו", "הלכה", "יסוד היסודות", "בריאת העולם"]

class EndpointStats:
    def __init__(self, name: str):
        self.name = name
        self.latencies: List[float] = []
        self.status_codes: Dict[int, int] = {}
        self.errors = 0

    def record(self, latency_ms: float, status_code: int):
        self.latencies.append(latency_ms)
        self.status_codes[status_code] = self.status_codes.get(status_code, 0) + 1
        if status_code >= 400 or status_code == 0:
            self.errors += 1

    def summary(self) -> Dict:
        if not self.latencies:
            return {
                "name": self.name,
                "count": 0,
                "errors": self.errors,
                "error_rate": 0.0,
                "avg_ms": 0.0,
                "p50_ms": 0.0,
                "p90_ms": 0.0,
                "p95_ms": 0.0,
                "p99_ms": 0.0,
                "min_ms": 0.0,
                "max_ms": 0.0,
            }
        s = sorted(self.latencies)
        n = len(s)
        return {
            "name": self.name,
            "count": n,
            "errors": self.errors,
            "error_rate": round((self.errors / n) * 100, 2),
            "avg_ms": round(sum(s) / n, 2),
            "p50_ms": round(s[int(n * 0.50)], 2),
            "p90_ms": round(s[int(n * 0.90)], 2),
            "p95_ms": round(s[min(int(n * 0.95), n - 1)], 2),
            "p99_ms": round(s[min(int(n * 0.99), n - 1)], 2),
            "min_ms": round(s[0], 2),
            "max_ms": round(s[-1], 2),
        }

class StageResult:
    def __init__(self, stage_name: str, target_users: int, duration_sec: float):
        self.stage_name = stage_name
        self.target_users = target_users
        self.duration_sec = duration_sec
        self.endpoint_stats: Dict[str, EndpointStats] = {}
        self.total_requests = 0
        self.total_errors = 0
        self.start_time = 0.0
        self.end_time = 0.0

    def get_stats(self, endpoint_name: str) -> EndpointStats:
        if endpoint_name not in self.endpoint_stats:
            self.endpoint_stats[endpoint_name] = EndpointStats(endpoint_name)
        return self.endpoint_stats[endpoint_name]

async def send_http_request(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    method: str,
    path: str,
    body: str = "",
    cookie: str = "",
    timeout: float = 8.0
) -> Tuple[int, float, bool]:
    """
    שולח בקשת HTTP/1.1 בחיבור א-סינכרוני ישיר ומהיר עם Keep-Alive
    """
    start_t = time.perf_counter()
    headers = [
        f"{method} {path} HTTP/1.1",
        f"Host: {TARGET_HOST}:{TARGET_PORT}",
        "User-Agent: Otzaria-LoadTest/1.0",
        "Accept: application/json, text/html, */*",
        "Accept-Encoding: identity",  # Simplify raw reading
        "Connection: keep-alive",
    ]
    if cookie:
        headers.append(f"Cookie: otzaria_uid={cookie}")
        headers.append(f"X-Otzaria-UID: {cookie}")

    if body:
        headers.append("Content-Type: application/json; charset=utf-8")
        body_bytes = body.encode("utf-8")
        headers.append(f"Content-Length: {len(body_bytes)}")
        raw_req = "\r\n".join(headers).encode("latin1") + b"\r\n\r\n" + body_bytes
    else:
        raw_req = "\r\n".join(headers).encode("latin1") + b"\r\n\r\n"

    try:
        writer.write(raw_req)
        await asyncio.wait_for(writer.drain(), timeout=timeout)

        # קריאת כותרת התשובה
        line = await asyncio.wait_for(reader.readline(), timeout=timeout)
        if not line:
            return 0, (time.perf_counter() - start_t) * 1000, False

        status_line = line.decode("latin1", errors="ignore").strip()
        parts = status_line.split(" ")
        status_code = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0

        # קריאת Headers
        content_length = -1
        is_chunked = False
        connection_close = False

        while True:
            hline = await asyncio.wait_for(reader.readline(), timeout=timeout)
            if not hline or hline == b"\r\n":
                break
            header_str = hline.decode("latin1", errors="ignore").lower()
            if header_str.startswith("content-length:"):
                try:
                    content_length = int(header_str.split(":", 1)[1].strip())
                except:
                    pass
            elif "transfer-encoding:" in header_str and "chunked" in header_str:
                is_chunked = True
            elif "connection:" in header_str and "close" in header_str:
                connection_close = True

        # קריאת גוף התשובה
        if content_length > 0:
            bytes_left = content_length
            while bytes_left > 0:
                chunk = await asyncio.wait_for(reader.read(min(bytes_left, 65536)), timeout=timeout)
                if not chunk:
                    break
                bytes_left -= len(chunk)
        elif is_chunked:
            while True:
                chunk_header = await asyncio.wait_for(reader.readline(), timeout=timeout)
                if not chunk_header:
                    break
                chunk_len_str = chunk_header.strip().split(b";")[0]
                if not chunk_len_str:
                    continue
                try:
                    chunk_len = int(chunk_len_str, 16)
                except:
                    break
                if chunk_len == 0:
                    await reader.readline()  # trailing crlf
                    break
                # Read chunk payload + trailing CRLF
                to_read = chunk_len + 2
                while to_read > 0:
                    c = await asyncio.wait_for(reader.read(min(to_read, 65536)), timeout=timeout)
                    if not c:
                        break
                    to_read -= len(c)

        latency_ms = (time.perf_counter() - start_t) * 1000
        return status_code, latency_ms, connection_close

    except Exception:
        latency_ms = (time.perf_counter() - start_t) * 1000
        return 0, latency_ms, True

async def simulate_user(user_id: int, stage_result: StageResult, stop_event: asyncio.Event):
    """מדמה משתמש כבד בודד שמבצע סדרת פעולות מגוונת ברציפות"""
    user_uid = str(uuid.uuid4())
    reader = None
    writer = None

    async def get_connection():
        nonlocal reader, writer
        if writer is not None and not writer.is_closing():
            return reader, writer
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(TARGET_HOST, TARGET_PORT),
                timeout=5.0
            )
            return reader, writer
        except Exception:
            return None, None

    # פעולת אתחול סשן ראשונית
    r, w = await get_connection()
    if r and w:
        status, lat, close = await send_http_request(r, w, "GET", "/", cookie=user_uid)
        stage_result.get_stats("01_Home_Page").record(lat, status)
        if close:
            w.close()
            w = None

    while not stop_event.is_set():
        action_roll = random.random()
        r, w = await get_connection()
        if not r or not w:
            await asyncio.sleep(0.1)
            continue

        endpoint_name = ""
        method = "GET"
        path = ""
        body = ""

        if action_roll < 0.25:
            # דפדוף וקריאת שורות
            book_id = random.choice(SAMPLE_BOOK_IDS)
            start_line = random.randint(1, 150)
            end_line = start_line + 50
            endpoint_name = "10_Book_Lines"
            path = f"/api/books/{book_id}/lines?start={start_line}&end={end_line}"

        elif action_roll < 0.40:
            # תוכן עניינים (TOC)
            book_id = random.choice(SAMPLE_BOOK_IDS)
            endpoint_name = "11_Book_TOC"
            path = f"/api/books/{book_id}/toc"

        elif action_roll < 0.55:
            # מפרשים וקישורים מקבילים
            book_id = random.choice(SAMPLE_BOOK_IDS)
            line_idx = random.randint(1, 100)
            endpoint_name = "12_Commentary_Links"
            path = f"/api/books/{book_id}/links?line={line_idx}"

        elif action_roll < 0.70:
            # חיפוש במסד הנתונים
            q = random.choice(SEARCH_QUERIES)
            endpoint_name = "20_Full_Search"
            method = "POST"
            path = "/api/search"
            body = json.dumps({"query": q, "limit": 25})

        elif action_roll < 0.85:
            # פעולות משתמש: שמירת סימניה או היסטוריה
            if random.random() < 0.5:
                endpoint_name = "30_Add_Bookmark"
                method = "POST"
                path = "/api/user/bookmarks"
                body = json.dumps({
                    "bookId": random.choice(SAMPLE_BOOK_IDS),
                    "bookTitle": "בראשית",
                    "lineIndex": random.randint(1, 80),
                    "textSnippet": "בדיקת עומס אותנטית",
                    "category": "תנ\"ך"
                })
            else:
                endpoint_name = "31_Record_History"
                method = "POST"
                path = "/api/user/history"
                body = json.dumps({
                    "bookId": random.choice(SAMPLE_BOOK_IDS),
                    "bookTitle": "תלמוד בבלי",
                    "lastPosition": random.randint(1, 120),
                    "category": "בבלי"
                })

        else:
            # קטלוג ונכסי ממשק
            endpoint_name = "02_Books_Sorted"
            path = "/api/books-sorted"

        status, lat, close = await send_http_request(r, w, method, path, body, cookie=user_uid)
        stage_result.get_stats(endpoint_name).record(lat, status)

        if close and w:
            try:
                w.close()
            except:
                pass
            writer = None

        # זמן שהייה קל (Think time) בין 50ms ל-150ms
        await asyncio.sleep(random.uniform(0.05, 0.15))

    if writer:
        try:
            writer.close()
        except:
            pass

async def run_stage(stage_name: str, target_users: int, spawn_rate: int, duration_sec: int) -> StageResult:
    """
    מריץ שלב בבדיקה עם קצב עלייה (Spawn Rate) מדורג ומשך זמן מדוד
    """
    print(f"\n==================================================================")
    print(f"🚀 [התחלת שלב] {stage_name}: {target_users} משתמשים בו-זמנית | קצב עלייה: {spawn_rate}/sec | משך: {duration_sec}s")
    print(f"==================================================================")

    stage_result = StageResult(stage_name, target_users, duration_sec)
    stop_event = asyncio.Event()
    tasks = []

    stage_result.start_time = time.perf_counter()

    # Ramp-Up הדרגתי: מוסיף spawn_rate משתמשים בכל שנייה עד הגעה ל-target_users
    users_spawned = 0
    batch_interval = 1.0 / max(spawn_rate, 1)

    while users_spawned < target_users:
        t = asyncio.create_task(simulate_user(users_spawned, stage_result, stop_event))
        tasks.append(t)
        users_spawned += 1
        if users_spawned % spawn_rate == 0:
            await asyncio.sleep(1.0)
            elapsed_ramp = time.perf_counter() - stage_result.start_time
            print(f"  ⚡ Ramp-up: {users_spawned}/{target_users} משתמשים פעילים ({elapsed_ramp:.1f}s)")

    print(f"  ✅ כל {target_users} המשתמשים מופעלים כעת בעומס מלא! מודד ביצועים למשך {duration_sec} שניות...")

    # הרצה למשך הזמן שהוגדר
    await asyncio.sleep(duration_sec)

    # עצירה מסודרת
    stop_event.set()
    await asyncio.gather(*tasks, return_exceptions=True)

    stage_result.end_time = time.perf_counter()
    actual_duration = stage_result.end_time - stage_result.start_time

    # חישוב סיכומים
    all_latencies = []
    total_reqs = 0
    total_errs = 0
    for stat in stage_result.endpoint_stats.values():
        total_reqs += len(stat.latencies)
        total_errs += stat.errors
        all_latencies.extend(stat.latencies)

    stage_result.total_requests = total_reqs
    stage_result.total_errors = total_errs

    rps = round(total_reqs / actual_duration, 1)
    err_pct = round((total_errs / max(total_reqs, 1)) * 100, 2)

    print(f"\n📊 [סיכום שלב {stage_name}]:")
    print(f"   • סה\"כ בקשות: {total_reqs:,}")
    print(f"   • קצב בקשות: {rps} req/sec (RPS)")
    print(f"   • שגיאות: {total_errs} ({err_pct}%)")

    if all_latencies:
        all_latencies.sort()
        n = len(all_latencies)
        avg_l = sum(all_latencies) / n
        p50 = all_latencies[int(n * 0.5)]
        p90 = all_latencies[int(n * 0.9)]
        p95 = all_latencies[min(int(n * 0.95), n - 1)]
        p99 = all_latencies[min(int(n * 0.99), n - 1)]
        max_l = all_latencies[-1]
        print(f"   • זמן תגובה ממוצע: {avg_l:.1f}ms")
        print(f"   • חציון (p50): {p50:.1f}ms | p90: {p90:.1f}ms | p95: {p95:.1f}ms | p99: {p99:.1f}ms | מקסימום: {max_l:.1f}ms")

    return stage_result

async def main():
    print("=" * 70)
    print("      מערך בדיקות עומסים מתקדם לשרת אוצריא (Otzaria Stress Test)")
    print("      הדמיית משתמשים כבדים במקביל עם Ramp-up מדורג")
    print("=" * 70)

    # בדיקת נגישות בסיסית של השרת
    try:
        r, w = await asyncio.wait_for(asyncio.open_connection(TARGET_HOST, TARGET_PORT), timeout=3.0)
        w.close()
        await w.wait_closed()
        print(f"🟢 השרת בכתובת http://{TARGET_HOST}:{TARGET_PORT} זמין ומוכן לבדיקה.\n")
    except Exception as e:
        print(f"🔴 שגיאה: לא ניתן להתחבר לשרת ב-http://{TARGET_HOST}:{TARGET_PORT} - {e}")
        return

    # מדרגות עומס הדרגתיות: 100 -> 250 -> 500 -> 1000 -> 1500
    stages_to_run = [
        ("שלב 1 - חימום וקו בסיס", 100, 20, 10),
        ("שלב 2 - עומס בינוני", 250, 25, 12),
        ("שלב 3 - עומס גבוה", 500, 50, 12),
        ("שלב 4 - יעד משתמשים כבד (1,000 משתמשים)", 1000, 100, 15),
        ("שלב 5 - בדיקת מאמץ קיצון (1,500 משתמשים)", 1500, 150, 15)
    ]

    all_stage_results: List[StageResult] = []

    for stage_name, target_users, spawn_rate, duration in stages_to_run:
        result = await run_stage(stage_name, target_users, spawn_rate, duration)
        all_stage_results.append(result)

        # בדיקת סף קריסה (אם אחוז השגיאות עולה מעל 15% עוצרים מוקדם)
        err_rate = (result.total_errors / max(result.total_requests, 1)) * 100
        if err_rate > 15.0:
            print(f"\n⚠️ אזהרה: אחוז השגיאות בשלב זה היה {err_rate:.1f}% (>15%). השרת מתקרב לגבול היכולת.")
            break

        # מנוחה קלה של 2 שניות בין שלבים לאיפוס sockets
        await asyncio.sleep(2.0)

    # הפקת דוח מסכם מלא ב-JSON ובטבלה
    report_data = []
    print("\n" + "=" * 80)
    print("                   📊 דוח תוצאות בדיקת העומסים המלא")
    print("=" * 80)

    for res in all_stage_results:
        dur = res.end_time - res.start_time
        rps = round(res.total_requests / max(dur, 0.001), 1)
        err_pct = round((res.total_errors / max(res.total_requests, 1)) * 100, 2)
        print(f"\n🏷️  {res.stage_name} ({res.target_users} משתמשים בו-זמנית):")
        print(f"   סה\"כ בקשות: {res.total_requests:,} | RPS: {rps} | שגיאות: {res.total_errors} ({err_pct}%)")
        print(f"   {'Endpoint':<30} | {'Reqs':<7} | {'Errors':<7} | {'Avg (ms)':<9} | {'p50 (ms)':<9} | {'p95 (ms)':<9} | {'p99 (ms)':<9}")
        print(f"   {'-'*30}-+-{'-'*7}-+-{'-'*7}-+-{'-'*9}-+-{'-'*9}-+-{'-'*9}-+-{'-'*9}")

        stage_dict = {
            "stage": res.stage_name,
            "users": res.target_users,
            "total_requests": res.total_requests,
            "rps": rps,
            "errors": res.total_errors,
            "error_percentage": err_pct,
            "endpoints": []
        }

        for ep_name in sorted(res.endpoint_stats.keys()):
            summary = res.endpoint_stats[ep_name].summary()
            stage_dict["endpoints"].append(summary)
            print(f"   {summary['name']:<30} | {summary['count']:<7} | {summary['errors']:<7} | {summary['avg_ms']:<9.1f} | {summary['p50_ms']:<9.1f} | {summary['p95_ms']:<9.1f} | {summary['p99_ms']:<9.1f}")

        report_data.append(stage_dict)

    with open("/app/applet/load_test_results.json", "w", encoding="utf-8") as f:
        json.dump(report_data, f, ensure_ascii=False, indent=2)

    print("\n✅ הדוח המלא נשמר בהצלחה ב-load_test_results.json")

if __name__ == "__main__":
    asyncio.run(main())
