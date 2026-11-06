# שרת MCP — מים חיים / אוצריא

שרת MCP לקריאה בלבד שמחבר את ChatGPT ל-API הקיים של `https://otzaria.duckdns.org`.
הוא כולל את הכלים `search_otzaria`, `get_book_content`, `get_line_commentaries`, `get_book_toc` ו-`check_otzaria_connection`.

**מצב נוכחי:** קוד השרת הוכן, אבל נקודות הקצה של אוצריא לא אומתו מסביבת העבודה הזו. עצם עליית `/health` מוכיחה שהשרת המקומי חי בלבד; רק הצלחה של `check_otzaria_connection` והצלחת קריאת חיפוש בפועל יאשרו שהחיבור לאוצריא עובד.

## התקנה על שרת Oracle Linux עם Node 20 ו-PM2

הדרך הבטוחה היא לפרוס כיישום נפרד ולהוסיף נתיב Nginx, בלי לשנות את קוד האתר או את מסד הנתונים.

1. העתק את תיקיית `server` לשרת והיכנס אליה.
2. התקן תלויות:

   ```bash
   npm install --omit=dev
   cp .env.example .env
   nano .env
   ```

   הגדר את `OTZARIA_UID` לערך המשותף שסיפק בעל המאגר, ובדוק את `OTZARIA_BASE_URL`, `HOST=127.0.0.1` ו-`PORT=3010`. ערך UID אמיתי אינו נשמר במאגר; השרת מסרב לעלות בלעדיו. קובץ `.env` לא ייכלל ב-Git או בחבילת התוסף.

   תצורת PM2 כוללת את `node_args: '--env-file=.env'` (Node 20.6+), כך שהמשתנים נטענים בלי לחשוף אותם בשורת הפקודה.

3. הפעֵל באמצעות PM2:

   ```bash
   pm2 start ecosystem.config.cjs --only mayim-chaim-mcp
   pm2 save
   curl -fsS http://127.0.0.1:3010/health
   ```

4. פתח את `/etc/nginx/conf.d/otzaria.conf` והוסף את התוכן שב-`nginx-location.conf` **בתוך בלוק HTTPS הקיים** (`server {}` שמאזין על 443). אין להחליף את הקובץ כולו.

5. בדוק וטעֵן את Nginx:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   curl -fsS https://otzaria.duckdns.org/mcp-health
   ```

6. אחרי שהנתיב `/mcp` נפרס, חבר/עדכן את התוסף באמצעות `plugin/mcp.json` שבחבילה הראשית.

## בדיקות חיבור אמיתיות

- `GET https://otzaria.duckdns.org/mcp-health` בודק את תהליך ה-MCP בלבד.
- `check_otzaria_connection` בודק בפועל `GET /api/library/tree` עם הכותרות שהוגדרו.
- `search_otzaria` עם שאילתה ידועה בודק את `POST /api/search`.
- רק לאחר שהקריאות האחרונות מצליחות ויש תוצאות עם `bookId`/`lineIndex` תוכל לקבוע שהחיבור והקישורים תקינים.

## כותרות upstream

השרת שולח `accept`, `accept-language`, `content-type`, `x-otzaria-uid`, `referer` ו-`origin` כפי שסופקו. ה-UID המשותף מוגדר ב-`.env`; אין לשים אותו בקוד הפומבי של התוסף.

## גבולות

- כל הכלים לקריאה בלבד; אין כתיבה/מחיקה לשרת אוצריא.
- `search_otzaria` מגביל תוצאות ל-50 לכל בקשה.
- `get_book_content` מגביל טווח עד 61 שורות כדי למנוע תשובות ענק.
- במקרה של שגיאת תקשורת או שרת, כלי upstream מחזירים בדיוק: `אין לי כעת גישה לאתר נסה שוב מאוחר יותר`.
