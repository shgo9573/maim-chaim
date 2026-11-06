"""
Otzaria Production Load Test (Locust)
בדיקת עומסים מקצועית לאוצריא באמצעות Locust

להרצה:
1. התקנה:
   pip install locust

2. הרצה בממשק Web גרפי (דפדפן ב-http://localhost:8089):
   locust -f locustfile.py --host http://localhost:3000

3. הרצה ללא ממשק (Headless) עם Ramp-Up הדרגתי:
   locust -f locustfile.py --headless --host http://localhost:3000 -u 1000 -r 10 --run-time 3m --html report.html
"""

import random
import uuid
from locust import HttpUser, task, between, events

# רשימת ספרים לבדיקה
SAMPLE_BOOK_IDS = [1, 2, 3, 4, 5, 8, 10, 12, 14, 15, 16]

# מילות חיפוש אותנטיות
SEARCH_QUERIES = [
    "בראשית",
    "שמע ישראל",
    "שבת",
    "תורה אור",
    "משה רבנו",
    "הלכה",
    "יסוד היסודות",
    "בריאת העולם"
]

class OtzariaHeavyUser(HttpUser):
    """
    מדמה משתמש פעיל ("כבד") באוצריא:
    - פותח את האתר וטוען את נכסי הממשק (HTML, JS, CSS)
    - טוען את עץ הקטלוג והספרים הממוינים
    - פותח ספרים שונים, מדפדף בין עמודים וטוען פרקים
    - טוען מפרשים וקישורים על שורות
    - מבצע חיפושים בטקסט
    - שומר סימניות, היסטוריית קריאה והגדרות אישיות
    """

    # השהיה ממוצעת בין פעולות משתמש כבד (100ms עד 500ms)
    wait_time = between(0.1, 0.5)

    def on_start(self):
        """אתחול סשן משתמש ייחודי עם עוגיית זיהוי"""
        self.user_id = str(uuid.uuid4())
        self.client.cookies.set("otzaria_uid", self.user_id)
        self.headers = {
            "X-Otzaria-UID": self.user_id,
            "Accept-Encoding": "gzip, deflate, br"
        }
        # כניסה ראשונית: דף הבית + קטלוג
        self.client.get("/", headers=self.headers, name="01_Page_Home")
        self.client.get("/api/status", headers=self.headers, name="02_API_Status")
        self.client.get("/api/library/tree", headers=self.headers, name="03_API_LibraryTree")
        self.client.get("/api/books-sorted", headers=self.headers, name="04_API_BooksSorted")

    @task(25)
    def read_book_lines(self):
        """דפדוף וקריאת שורות בספר (הפעולה הנפוצה ביותר)"""
        book_id = random.choice(SAMPLE_BOOK_IDS)
        start_line = random.randint(1, 150)
        end_line = start_line + 50
        self.client.get(
            f"/api/books/{book_id}/lines?start={start_line}&end={end_line}",
            headers=self.headers,
            name="10_API_Book_Lines"
        )

    @task(15)
    def fetch_book_toc(self):
        """טעינת תוכן עניינים (ראשי פרקים)"""
        book_id = random.choice(SAMPLE_BOOK_IDS)
        self.client.get(
            f"/api/books/{book_id}/toc",
            headers=self.headers,
            name="11_API_Book_TOC"
        )

    @task(20)
    def fetch_commentaries_and_links(self):
        """טעינת מפרשים וקישורים מקבילים עבור שורה שנבחרה"""
        book_id = random.choice(SAMPLE_BOOK_IDS)
        line_num = random.randint(1, 100)
        self.client.get(
            f"/api/books/{book_id}/links?line={line_num}",
            headers=self.headers,
            name="12_API_Book_CommentaryLinks"
        )
        self.client.get(
            f"/api/books/{book_id}/commentators",
            headers=self.headers,
            name="13_API_Book_CommentatorsList"
        )

    @task(15)
    def search_seforim(self):
        """חיפוש מלא במסד הנתונים"""
        query = random.choice(SEARCH_QUERIES)
        self.client.post(
            "/api/search",
            json={"query": query, "limit": 30},
            headers=self.headers,
            name="20_API_Full_Search"
        )

    @task(10)
    def user_bookmarks_flow(self):
        """ניהול סימניות: שליפת סימניות ושמירת סימניה חדשה"""
        # שליפה
        self.client.get("/api/user/bookmarks", headers=self.headers, name="30_API_User_GetBookmarks")
        # הוספה
        book_id = random.choice(SAMPLE_BOOK_IDS)
        self.client.post(
            "/api/user/bookmarks",
            json={
                "bookId": book_id,
                "bookTitle": f"ספר {book_id}",
                "lineIndex": random.randint(1, 100),
                "textSnippet": "ציטוט נבחר לצורך בדיקת עומס",
                "category": "תנ\"ך"
            },
            headers=self.headers,
            name="31_API_User_AddBookmark"
        )

    @task(10)
    def user_history_and_settings(self):
        """עדכון היסטוריית קריאה והגדרות משתמש"""
        book_id = random.choice(SAMPLE_BOOK_IDS)
        # שמירת היסטוריית קריאה
        self.client.post(
            "/api/user/history",
            json={
                "bookId": book_id,
                "bookTitle": f"ספר {book_id}",
                "lastPosition": random.randint(1, 150),
                "category": "תורה"
            },
            headers=self.headers,
            name="32_API_User_RecordHistory"
        )
        # עדכון הגדרות
        self.client.post(
            "/api/user/settings",
            json={
                "fontSize": random.randint(16, 26),
                "fontFamily": "Taamey David CLM",
                "theme": "light",
                "showNikud": True
            },
            headers=self.headers,
            name="33_API_User_UpdateSettings"
        )

    @task(5)
    def static_assets_download(self):
        """טעינת קבצי ממשק סטטיים (JS, CSS, Icons)"""
        assets = [
            "/assets/index-PsSKxObm.js",
            "/assets/index-Cj2PLQTT.css",
            "/assets/BookReader-B1y_0Upp.js",
            "/assets/vendor-icons-Dt9aU6Ao.js",
            "/favicon.ico"
        ]
        asset = random.choice(assets)
        self.client.get(asset, headers=self.headers, name="40_Static_Asset")
