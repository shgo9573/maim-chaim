# מחקר: תמיכה ב-Word בינארי ישן (‎.doc / .dot‎)

מסמך זה הוא תוצר שלב המחקר שנדרש לפני מימוש התמיכה ב-DOC/DOT (‎PR 7‎ בתכנית
הרחבת פורמטי המסמכים). מטרתו להכריע **באיזו דרך** לממש, לפני שנכתבת שורת קוד
אחת של parser.

התאריך הקובע לבדיקת החבילות: **אוגוסט 2026**.

## תקציר ההחלטה

> **Pure Dart, בשני שלבים.** אין חבילה קיימת שעומדת ברף, ו-FFI ל-ספרייה
> נייטיבית נפסל בגלל חמש פלטפורמות היעד. השלב הראשון — קורא מכולת CFB/OLE2
> גנרי — הוא רכיב עצמאי, נבדק בפני עצמו, ומשמש גם את זיהוי ה-WBK.

## מצב המימוש

שלושת השלבים **מומשו**: `lib/utils/file/cfb_reader.dart`,
`lib/utils/file/legacy_word_to_otzaria.dart` ושכבת המאפיינים
`lib/utils/file/legacy_word_properties.dart`. הבדיקות בונות מכולת CFB, FIB
ו-piece table אמיתיים (`tool/src/document_fixtures/`), ו-§5 אומת גם מול
קובצי ‎.doc‎ שנוצרו ב-Word.

---

## 1. מה בכלל צריך לפרסר

קובץ ‎.doc‎ אינו פורמט אחד אלא שתי שכבות:

**שכבה א' — מכולה: Compound File Binary (CFB/OLE2).**
מערכת-קבצים זעירה בתוך קובץ אחד: header, שרשראות FAT ו-miniFAT, ועץ ספריות.
בתוכה יושבים streams בשמות קבועים — `WordDocument` (הזרם הראשי) ו-`0Table`
או `1Table` (נבחר לפי הדגל `fWhichTblStm` ב-FIB).

**שכבה ב' — מסמך Word: FIB + piece table.**
תחילת `WordDocument` היא ה-File Information Block, ובו מצביעי FC/LCB לשאר
חלקי המסמך. הטקסט **אינו רציף**: Word מפצל אותו ל"חתיכות" (pieces) כשקטעים
שונים מקודדים אחרת (1 בית מול UTF-16). ה-piece table (‎`plcfpcd`‎) ממפה
מיקום לוגי של תו (CP) למיקום פיזי בקובץ (FC), ורק דרכו אפשר לשחזר את סדר
הטקסט הנכון. במסמכי fast-save טבלאות ה-pieces של תת-המסמכים משורשרות לסוף
הטבלה הראשית, מה שמסבך עוד את החישוב.

**המשמעות המעשית:** כל גישה שאינה קוראת את ה-piece table — כלומר כל "גרידה"
של מחרוזות מהבינארי — תייצר טקסט בסדר שגוי, עם זבל בין הקטעים, ותשבור לגמרי
מסמכים בעברית שבהם קטעים מקודדים ב-Windows-1255 לצד קטעי UTF-16.

## 2. סקירת החלופות

### 2.1 חבילות pub.dev קיימות

| חבילה | רישיון | פלטפורמות | תמיכה ב-DOC בינארי | מסקנה |
|---|---|---|---|---|
| `doc_text_extractor` | MIT | Dart טהור, כל הפלטפורמות | גרידה היוריסטית מהבינארי — **לא** parser של CFB/FIB | **נפסל** — נאמנות לא מספקת |
| `doc_text` | MIT | Android + iOS בלבד | גשר נייטיבי; ב-iOS "פונקציונליות מוגבלת" | **נפסל** — אין Windows/Linux/macOS |
| `libre_doc_converter` | — | דורש בינארי LibreOffice מותקן | המרה חיצונית | **נפסל** — ראו §2.3 |
| `docx_to_text` | — | Dart טהור | OOXML בלבד; קורס על ‎.doc‎ | לא רלוונטי |

**אין ולו חבילת Dart אחת** שמפרסרת מכולת CFB/OLE2 כראוי. חיפוש ייעודי העלה
רק חבילות בינאריות גנריות (`binary`, `pro_binary`, `binarize`) — כלי עזר
לקריאת בתים, לא parser.

`doc_text_extractor` הוא הפיתוי הגדול: MIT, Dart טהור, מתוחזק (v2.0.0,
נובמבר 2025). אבל התיעוד שלו עצמו מודה שהתמיכה ב-‎.doc‎ היא raw parsing שנכתב
מאפס בהיעדר parser קיים — כלומר בדיוק הגישה שסעיף 1 שולל. לספרייה תורנית
בעברית, עם הערות שוליים וכותרות, זה יפיק ג'יבריש שנראה כמו ספר תקין. זה
המצב הגרוע ביותר: כישלון שקט.

### 2.2 ספרייה נייטיבית דרך FFI

`antiword` ו-`catdoc` הם הפתרונות הבשלים בעולם ה-C, אך אין להם עטיפת Dart.
בנייתם דרך FFI מחייבת בינארי מהודר לכל אחת מחמש פלטפורמות היעד של אוצריא
(Windows, Linux, macOS, Android, iOS) — כולל חתימה ב-macOS/iOS, תוספת לגודל
ההתקנה, ותחזוקת שרשרת בנייה. **התועלת אינה מצדיקה זאת** עבור פורמט שוליים.

### 2.3 המרה חיצונית (LibreOffice / שרת)

נפסל משתי סיבות: הרצת executable חיצוני על מכשיר המשתמש היא בדיוק מה
שמדיניות הפרויקט אוסרת בלי נתיבות שקופה, והמרה בשרת מחייבת שליחת ספרים
פרטיים לרשת — בניגוד לעיקרון שהמרות רצות offline.

### 2.4 Parser פנימי ב-Dart טהור — **הנבחר**

הפורמט מתועד היטב ובאופן פתוח:
[MS-DOC] של מיקרוסופט, מפרט WW8 הישן, ומדריך b2xtranslator שמתאר בפירוט את
אלגוריתם חילוץ הטקסט. יש גם מימושי-ייחוס לקריאה (‎olefile‎ ב-Python,
‎cfb‎ ב-JavaScript, ‎HWPF‎ של Apache POI) שאפשר ללמוד מהם.

יתרון מכריע: הרכיב הראשון — קורא ה-CFB — הוא **גנרי ועצמאי**. הוא נדרש
ממילא לזיהוי אמין של WBK, וניתן לבדיקה מלאה בפני עצמו בלי שום ידע על Word.

---

## 3. תכנית המימוש המומלצת

### שלב א' — קורא מכולת CFB (עצמאי)

`lib/utils/file/cfb_reader.dart`: header, שרשראות FAT ו-miniFAT, עץ הספריות,
וקריאת stream לפי שם. ללא שום תלות ב-Word.

מספק מיד שני דברים מעבר ל-DOC:
- זיהוי מדויק של WBK בינארי (במקום חתימת OLE בלבד).
- הבחנה בין מסמך Word אמיתי לקובץ OLE אחר (‎.xls‎, ‎.msg‎) ששמו שונה.

### שלב ב' — טקסט מ-Word: FIB + piece table

`lib/utils/file/legacy_word_to_otzaria.dart`: קריאת ה-FIB, בחירת זרם הטבלה
לפי `fWhichTblStm`, פענוח ה-piece table, והרכבת הטקסט לפי CP→FC עם הקידוד
הנכון לכל piece (Windows-1255 מול UTF-16 — כאן נמצאת העברית).

בשלב זה הפלט הוא פסקאות בלבד.

### שלב ג' — עיצוב

כותרות דרך ה-stylesheet, מודגש/נטוי, הערות שוליים, טבלאות ותמונות. מומש
ב-`legacy_word_properties.dart` וב-`legacy_word_pictures.dart`.

## 4. מה שלא יעבוד — ולתעד זאת מראש

| מקרה | התנהגות נדרשת |
|---|---|
| מסמך מוצפן/מוגן בסיסמה | `EncryptedDocumentException` — לא ניסיון פענוח |
| ‎.doc‎ שהוא בעצם RTF או OOXML ששמו שונה | ניתוב לפי תוכן (כבר עובד — `resolveDocumentFormat`) |
| מסמך fast-save מורכב | best effort; אם ה-piece table לא נפתר — `CorruptedDocumentException` |
| Word 6/95 (WW6, לפני WW8) | לא נתמך בשלב זה; מזוהה ונדחה מפורשות |

## 5. קריטריון כניסה ל-production

- [x] מסמך עם קטעי קידוד מעורבים (דחוס + UTF-16) נקרא נכון ובסדר הלוגי.
- [x] קובץ פגום/מוצפן/ישן-מדי זורק חריגה מוקלדת ואינו מפיל סריקת תיקייה.
- [x] ‎.doc‎ שהוא למעשה OOXML — ו-WBK משני הסוגים — מנותב למנוע הנכון.
- [x] תוכן עניינים, מטמון ואיתור-שינוי עוברים כמו בכל פורמט אחר.
- [x] **קובץ DOC עברי אמיתי שנוצר ב-Word נפתח עם טקסט תקין.**
- [x] הרכבת piece table מרובת-חתיכות על מסמכים אמיתיים.

### תוצאות האימות מול מסמכים אמיתיים

נבדקו 8 קובצי ‎.doc‎ אמיתיים (עד 2.5MB, תוכן תורני בעברית):

| מדד | תוצאה |
|---|---|
| תווי החלפה (U+FFFD) | **0** |
| תווי בקרה זולגים | **0** |
| חתיכות ב-piece table | 2–27 למסמך |
| `nFib` | 193 בכולם |
| `cQuickSaves` | 15 (מקסימום) בכולם |

אפס תווי החלפה על מיליוני תווי עברית — זו הראיה שה-FIB, ה-piece table
והמעבר בין הקידודים נכונים.

**על fast-save:** אף אחד מהקבצים לא נשא `fComplex=1`, אך כולם נשמרו
בשמירה-מהירה שוב ושוב (`cQuickSaves` מלא) והכילו עד 27 חתיכות. הדגל
`fComplex` אינו משנה את *מסלול הקריאה* — ה-CLX הוא מקור האמת בשני המקרים,
והקוד קורא רק את מה שה-piece table מצביע עליו. לכן הסיכון שנותר כאן זניח.

**באג שהאימות מצא:** ספריית CFB היא עץ ולא רשימה. מסמך עם אובייקט OLE
מוטמע מכיל `WordDocument` ו-`1Table` פעמיים, וסריקה שטוחה זיווגה זרם ראשי
עם טבלה של האובייקט המוטמע. תוקן; ראו `cfb_reader_test.dart`.

## מקורות

- [MS-DOC: Word (.doc) Binary File Format](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc/)
- [How to Retrieve Text from a Binary .doc File — b2xtranslator](https://b2xtranslator.sourceforge.net/howtos/How_to_retrieve_text_from_a_binary_doc_file.pdf)
- [Microsoft Word 97 Binary File Format (WW8)](https://www.opennet.ru/docs/formats/wword8.html)
- [Compound File Binary Format — Wikipedia](https://en.wikipedia.org/wiki/Compound_File_Binary_Format)
- [oletools — מימוש ייחוס ב-Python](https://github.com/decalage2/oletools)
- [doc_text_extractor](https://pub.dev/packages/doc_text_extractor) ·
  [doc_text](https://pub.dev/packages/doc_text) ·
  [docx_to_text](https://pub.dev/packages/docx_to_text)
