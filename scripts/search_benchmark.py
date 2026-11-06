#!/usr/bin/env python3
"""
Direct Search Benchmark against https://otzaria.duckdns.org/api/search
בדיקת ביצועים ישירה מול הכתובת החיצונית של שירות החיפוש
"""

import asyncio
import json
import time
import urllib.request
import urllib.error

TARGET_URL = "https://otzaria.duckdns.org/api/search"
QUERIES = ["בראשית", "שמע ישראל", "שבת", "תורה", "משה", "הלכה"]

async def send_search(query):
    start = time.perf_counter()
    payload = json.dumps({"query": query, "limit": 25}).encode("utf-8")
    req = urllib.request.Request(
        TARGET_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "OtzariaDirectSearchBenchmark/1.0",
            "Accept": "application/json"
        }
    )
    try:
        loop = asyncio.get_running_loop()
        status, latency = await loop.run_in_executor(None, execute_request, req, start)
        return status, latency
    except Exception:
        return 0, (time.perf_counter() - start) * 1000

def execute_request(req, start):
    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            lat = (time.perf_counter() - start) * 1000
            return resp.status, lat
    except urllib.error.HTTPError as e:
        lat = (time.perf_counter() - start) * 1000
        return e.code, lat
    except Exception:
        lat = (time.perf_counter() - start) * 1000
        return 0, lat

async def benchmark_concurrency(concurrency: int, total_requests: int):
    print(f"\n🔍 [Direct Search Benchmark] מריץ {total_requests} חיפושים מול {TARGET_URL} ברמת מקביליות של {concurrency}...")
    
    start_time = time.perf_counter()
    latencies = []
    success_count = 0
    error_count = 0

    semaphore = asyncio.Semaphore(concurrency)

    async def worker(q):
        nonlocal success_count, error_count
        async with semaphore:
            status, lat = await send_search(q)
            latencies.append(lat)
            if status == 200:
                success_count += 1
            else:
                error_count += 1

    queries_queue = [QUERIES[i % len(QUERIES)] for i in range(total_requests)]
    tasks = [worker(q) for q in queries_queue]
    await asyncio.gather(*tasks)

    duration = time.perf_counter() - start_time
    rps = round(total_requests / max(duration, 0.001), 1)

    print(f"📊 תוצאות מבחן (Concurrency: {concurrency}):")
    print(f"   • סה\"כ חיפושים: {total_requests}")
    print(f"   • זמן כולל: {duration:.2f} שניות")
    print(f"   • **קצב חיפושים (RPS): {rps} חיפושים בשנייה**")
    print(f"   • הצלחות (200 OK): {success_count} | שגיאות/כשלים: {error_count}")
    
    if latencies:
        latencies.sort()
        n = len(latencies)
        avg = sum(latencies) / n
        p50 = latencies[int(n * 0.5)]
        p95 = latencies[min(int(n * 0.95), n - 1)]
        p99 = latencies[min(int(n * 0.99), n - 1)]
        print(f"   • זמן תגובה ממוצע: {avg:.1f}ms")
        print(f"   • חציון (p50): {p50:.1f}ms | p95: {p95:.1f}ms | p99: {p99:.1f}ms")

    return rps

async def main():
    print("=" * 70)
    print("      מבחן ביצועים ישיר לכתובת החיצונית https://otzaria.duckdns.org/api/search")
    print("=" * 70)
    
    await benchmark_concurrency(concurrency=30, total_requests=150)
    await asyncio.sleep(1.0)
    await benchmark_concurrency(concurrency=100, total_requests=300)

if __name__ == "__main__":
    asyncio.run(main())
