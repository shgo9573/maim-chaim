# תכנון: החלפת מנגנון עדכוני ספריית אוצריא למערכת Delta DB החדשה

מסמך זה מתאר איך להחליף את מנגנון עדכוני הספרייה הקיים באוצריא כך שיעבוד מול ה־releases החדשים של `Otzaria/SeforimLibrary`, שמפרסמים:

- `seforim.db.zst` — DB מלא.
- `seforim.db.buildstate` — לשימוש צד הייצור בלבד, לא נדרש באפליקציה.
- `patch-vX-vY.db.zst` — קובץ patch דלתאי בפורמט SQLite.
- `patch-vX-vY.db.zst.manifest.json` — manifest לכל patch, עם versions, hashes וגדלים.

המטרה: עדכון אמין, מהיר, ניתן לשחזור אחרי קריסה, ועם fallback ברור להורדת DB מלא.

## תקציר החלטות

1. לא ממשיכים את מנגנון `N-M.DIFF.zst` הישן.
   הקוד הקיים ב־`lib/file_sync` מניח קובץ SQL דחוס בשם `133-134.DIFF.zst` וטבלה `db_meta.content_version_int`. זה לא הפורמט החדש.

2. מנגנון העדכון החדש צריך לעבוד מול `schema_meta`.
   ב־DB החדש מקור האמת הוא:

   - `schema_meta.db_version`
   - `schema_meta.db_schema_version`

3. בוחרים patch ישיר אם קיים.
   אם המשתמש על גרסה 1 וה־latest הוא 3, ויש `patch-v1-v3`, משתמשים בו. אם אין, בונים chain רציף כמו `1→2→3`.

4. כל apply חייב להיות מאומת ב־logical content hash.
   לא מספיק לבדוק `db_version`. ה־manifest מכיל:

   - `fromContentHash`
   - `toContentHash`

   לפני apply מחשבים hash ל־DB המקומי ומשווים ל־`fromContentHash`. אחרי apply מחשבים שוב ומשווים ל־`toContentHash`.

5. עדכון DB הוא atomic; אינדקס החיפוש אינו חלק מה־transaction.
   אחרי DB update מוצלח לא מוחקים את האינדקס, אלא מפעילים אינדוקס (`StartIndexing`) לפי הגדרת המשתמש. ראה סעיף "אינדקס חיפוש".

6. אם אין patch מתאים, או שה־hash המקומי לא מתאים, לא מנסים “לתקן בכוח”.
   עוברים למסלול full DB: הורדה של `seforim.db.zst`, חילוץ אטומי והחלפת DB.

## מה קיים היום

### עדכון/סנכרון ספרייה קיים

קבצים מרכזיים:

- `lib/file_sync/repository/file_sync_repository.dart`
- `lib/file_sync/library_diff_sync_worker.dart`
- `lib/file_sync/bloc/file_sync_bloc.dart`
- `lib/file_sync/file_sync_widget.dart`

זה המנגנון שצריך להחליף לגמרי עבור עדכון DB רשמי.

הוא מניח:

- release assets בשם `N-M.DIFF.zst`
- התוכן אחרי חילוץ הוא SQL text
- גרסת ספרייה נקראת מ־`db_meta.content_version_int`
- apply הוא רצף statements מול DB חי

המערכת החדשה שונה:

- asset בשם `patch-vX-vY.db.zst`
- התוכן אחרי חילוץ הוא SQLite patch DB, לא SQL text
- manifest נפרד מחייב בדיקות sha256, version ו־logical hash
- גרסה נמצאת ב־`schema_meta.db_version`

לכן אסור לבצע התאמות קטנות בתוך `FileSyncRepository`; עדיף להחליף את שכבת ה־repository/worker במודול חדש.

### DB runtime

קבצים מרכזיים:

- `lib/data/constants/database_constants.dart`
- `lib/data/data_providers/sqlite_data_provider.dart`
- `lib/navigation/navigation_repository.dart`

נקודות חשובות:

- `DatabaseConstants.getDatabasePath()` הוא הנתיב האמיתי ל־`seforim.db`.
- באנדרואיד ייתכן ש־`keyDbEffectivePath` מצביע ל־DB פנימי, גם אם `keyLibraryPath` מצביע לספרייה חיצונית.
- `SqliteDataProvider` פותח את DB ב־read-only בשגרה.
- כתיבות חייבות לסגור את החיבור הקיים דרך `closeForExternalWrite()` ולפתוח מחדש דרך `reopenAfterExternalWrite()`.
- יש כבר `DatabaseLibraryProvider.operationQueue` לסריאליזציה של פעולות DB כבדות. להשתמש בו גם לעדכון ספרייה.

### אינדקס חיפוש

קבצים מרכזיים:

- `lib/data/data_providers/tantivy_data_provider.dart`
- `lib/indexing/repository/indexing_repository.dart`
- `lib/indexing/bloc/indexing_bloc.dart`

הפרדת אחריות: מנגנון עדכון ה־DB **אינו** אחראי על נכונות האינדקס ואינו מוחק אותו. כל מה שהוא עושה בסיום עדכון מוצלח הוא להפעיל אינדוקס:

- אם `keyAutoUpdateIndex` פעיל: `IndexingBloc.add(StartIndexing(library))`.
- אם כבוי: להציג למשתמש שהחיפוש דורש אינדוקס.

הערה על מצב הקוד הנוכחי: כיום `IndexingRepository.isBookIndexed` מדלג על ספר שכבר קיים באינדקס לפי `filePath` בלבד, בלי לבדוק אם תוכנו השתנה (מזהי המסמכים בנויים מ־`catalogueOrder + ordinal`, לא מ־`line.id`). לכן `StartIndexing` היום קולט רק ספרים *חדשים*, וספר קיים שתוכנו השתנה יישאר עם אינדקס ישן. זו תקלה במנגנון האינדוקס שצריך לתקן בנפרד (זיהוי שינוי תוכן לכל ספר) — היא אינה חלק ממנגנון עדכון ה־DB. בעתיד אפשר להיעזר ב־`booksTouched` שב־manifest כדי לעדכן רק את הספרים שהשתנו.

## מבנה המודול החדש

להוסיף feature חדש:

```text
lib/library_update/
├── bloc/
│   ├── library_update_bloc.dart
│   ├── library_update_event.dart
│   └── library_update_state.dart
├── models/
│   ├── delta_manifest.dart
│   ├── library_release.dart
│   ├── library_update_plan.dart
│   └── patch_table_spec.dart
├── repository/
│   └── library_update_repository.dart
├── services/
│   ├── github_library_release_client.dart
│   ├── logical_content_hasher.dart
│   ├── patch_downloader.dart
│   ├── patch_applier.dart
│   ├── library_db_recovery_service.dart
│   └── library_runtime_refresh_service.dart
└── view/
    └── library_update_button.dart
```

אפשר לשמור את שם `FileSyncBloc` זמנית כדי לצמצם UI churn, אבל לא מומלץ. שם נכון יותר הוא `LibraryUpdateBloc`.

## מודלים

### `DeltaManifest`

שדות חובה לפי ה־manifest הנוכחי:

- `fromVersion`
- `toVersion`
- `fromSchemaVersion`
- `toSchemaVersion`
- `fromContentHash`
- `toContentHash`
- `patchFiles`

כל `patchFile`:

- `file`
- `compression`
- `sha256`
- `size`
- `uncompressedSha256`
- `uncompressedSize`

שדות אופציונליים עתידיים:

- `booksTouched`
- `booksRenamed`
- `catalogBlobName`

לא להיכשל אם קיימים שדות לא מוכרים. כן להיכשל אם חסר שדה חובה.

### `LibraryRelease`

מייצג release אחד מ־GitHub:

- tag
- prerelease/draft
- publishedAt
- assets
- `toVersion`, לפי `seforim.db` או לפי patch manifests שנמצאו

### `LibraryUpdatePlan`

סוגי תוכנית:

- `none` — הספרייה כבר מעודכנת.
- `delta` — רשימת manifest+patch files שצריך להחיל.
- `fullDownload` — אין מסלול דלתא בטוח; להוריד DB מלא.
- `blocked` — מצב לא תקין שדורש פעולה ידנית.

דוגמאות:

- local v1, latest v3, יש `patch-v1-v3`: תוכנית delta עם patch יחיד.
- local v1, latest v3, אין `patch-v1-v3`, אבל יש `patch-v1-v2` ו־`patch-v2-v3`: תוכנית delta chain עם שני patches.
- local hash לא תואם manifest של v1: תוכנית fullDownload.
- local schema version לא תואם: תוכנית fullDownload או blocked עם הסבר.

## בחירת release ו־patch

### שלב 1: קבלת releases

להשתמש ב־GitHub API:

- `GET https://api.github.com/repos/Otzaria/SeforimLibrary/releases`

לא להשתמש רק ב־`/releases/latest`, כי הוא לא מספיק כאשר הספרייה מפורסמת כ־prerelease.

מדיניות מוצעת:

- אם `SettingsRepository.keyDevChannel` פעיל: מותר לבחור prerelease.
- אם dev channel כבוי: לבחור רק release שאינו draft ואינו prerelease.
- אם בשלב המעבר כל releases של הספרייה הם prerelease, אפשר להוסיף flag ייעודי `key-library-dev-channel` או להחליט שספריית ספרים מתעדכנת גם מ־prerelease. ההחלטה צריכה להיות מוצרית, לא מוסתרת בקוד.

בכל מקרה לא לבחור draft.

### שלב 2: זיהוי latest DB version

ה־source of truth הוא `schema_meta.db_version` בתוך `seforim.db`, אבל לא רוצים להוריד DB מלא רק כדי לדעת גרסה.

לכן בסריקת releases:

- לקרוא assets מסוג `patch-vX-vY.db.zst.manifest.json`.
- ה־`toVersion` הגדול ביותר בין manifests תקינים הוא מועמד latest.
- אם יש `release-manifest.json` תקין בעתיד, להשתמש בו כמקור מועדף.
- אם אין manifests בכלל, fallback ל־full DB של release הנבחר.

### שלב 3: קריאת גרסה מקומית

לקרוא מ־`schema_meta`:

- `db_version`
- `db_schema_version`

לא להשתמש יותר ב־`db_meta.content_version_int`.

אם `schema_meta.db_version` חסר:

- אם DB ישן מאוד: להציג “נדרש עדכון מלא”.
- לא לנסות להחיל patch, כי manifest מבוסס על hash/גרסה של מערכת חדשה.

### שלב 4: בניית גרף patches

מכל ה־manifest assets ליצור edges:

- `fromVersion → toVersion`
- `size = sum(patchFiles.size)`
- `manifestUrl`
- `releaseUrl/baseUrl`

בחירת מסלול:

1. אם יש edge ישיר `localVersion → latestVersion`, לבחור אותו.
2. אחרת לבחור chain עם מספר patches מינימלי.
3. אם יש כמה chains באותו אורך, לבחור chain עם total compressed size נמוך יותר.
4. לא להשתמש ב־edge שמדלג לגרסה שאינה latest אם יש מסלול ל־latest.
5. אם אין מסלול: `fullDownload`.

## הורדה וחילוץ

### מיקום cache

להשתמש בתיקייה תחת data root:

```text
<AppPaths.getDataRootPath()>/library_update_cache/
├── delta-v1-v3/
│   ├── patch-v1-v3.db.zst.part
│   ├── patch-v1-v3.db.zst
│   └── patch-v1-v3.db
└── full-v3/
    ├── seforim.db.zst.part
    ├── seforim.db.zst
    └── seforim.db
```

להשתמש בתיקיית cache קבועה תחת data root (לא ב־`Directory.systemTemp`). קבצי הביניים נמחקים בסיום מוצלח או בכישלון. אין צורך במנגנון resume — קובצי ה־patch קטנים, ובמקרה של הורדה שנקטעה פשוט מורידים שוב.

### אימות

לכל patch file:

1. להוריד compressed.
2. לחשב sha256 compressed ולהשוות ל־`patchFiles[].sha256`.
3. לוודא גודל compressed לפי `patchFiles[].size`.
4. לחלץ zstd streaming לקובץ `.db`.
5. לחשב sha256 uncompressed ולהשוות ל־`uncompressedSha256`.
6. לוודא `uncompressedSize`.

אם אחד השלבים נכשל:

- למחוק את הקובץ הפגום ואת קבצי הביניים.
- לדווח שגיאה למשתמש.

## Logical content hash

חייבים לממש ב־Dart בדיוק כמו ב־SeforimLibrary.

האלגוריתם:

1. עוברים על טבלאות קבועות בסדר קבוע.
2. לכל טבלה:
   - אם הטבלה לא קיימת, מדלגים.
   - קוראים `PRAGMA table_info`.
   - מסדרים שמות עמודות אלפביתית.
   - מבצעים `SELECT <cols> FROM "<table>" ORDER BY id` אם יש עמודת `id`.
   - אם אין `id`, מסדרים לפי כל העמודות.
3. לכל תא כותבים ל־sha256 type tag:
   - null → `0`
   - blob → `1` + bytes
   - number → `2` + textual value
   - text/other → `3` + textual value
4. מפרידים בין תאים עם byte `0x1F`.
5. מפרידים בין rows עם byte `0xFF`.

טבלאות tracked:

```text
source
author
topic
pub_place
pub_date
connection_type
generation
category
category_closure
tocText
book
book_topic
book_author
book_pub_place
book_pub_date
book_generation
tocEntry
line
line_toc
link
book_has_links
book_acronym
alt_toc_structure
alt_toc_entry
line_alt_toc
default_commentator
default_targum
schema_meta
```

בדיקות חובה:

- hash של v1 מקומי צריך להתאים ל־`fromContentHash` של `patch-v1-v3`.
- אחרי apply של `patch-v1-v3`, hash צריך להתאים ל־`toContentHash`.
- אותו דבר ל־v2→v3.

## Apply של patch DB

### מבנה patch DB

ה־patch הוא SQLite DB עם:

- `patch_meta`
- `migrations`
- `blobs`
- לכל טבלה tracked:
  - `upsert_<table>`
  - `delete_<table>`

דוגמאות:

- `upsert_book`
- `delete_book`
- `upsert_line`
- `delete_line`
- `upsert_schema_meta`
- `delete_schema_meta`

### preflight

לפני כל apply:

1. לוודא שאין offline mode (`SettingsRepository.keyOfflineMode`).
2. לוודא שעדכוני תוכנה וספרים פעילים (`SettingsRepository.keySoftwareAndBookUpdatesEnabled`).
3. לוודא שיש DB מקומי.
4. לקרוא `db_version` ו־`db_schema_version`.
5. לקרוא manifest.
6. לוודא:
   - local version == `manifest.fromVersion`
   - local schema == `manifest.fromSchemaVersion`
   - local logical hash == `manifest.fromContentHash`
7. לבדוק מקום פנוי:
   - גודל `seforim.db`
   - גודל patch uncompressed
   - headroom של לפחות 64MB
   - במסלול full צריך מקום ל־DB מלא + compressed + backup.
8. להריץ recovery אם קיים marker ישן.

אם local version מתאים אבל hash לא מתאים:

- לא להחיל patch.
- להציע/להפעיל full DB update.
- הסיבה: DB מקומי יכול להיות שונה בגלל build ישן, תיקון ידני, corruption או גרסה לא רשמית.

### backup ו־marker

ליד DB:

```text
seforim.db
seforim.db.backup
seforim.db.applying
```

תהליך:

1. אם יש `seforim.db.applying` וגם `seforim.db.backup`, לשחזר backup לפני התחלת עדכון חדש.
2. לפני כתיבה:
   - להעתיק `seforim.db` ל־`seforim.db.backup`.
   - ליצור `seforim.db.applying` עם `fromVersion`, `toVersion`, timestamp.
3. אם apply נכשל:
   - rollback transaction אם אפשר.
   - להחזיר `seforim.db.backup` ל־`seforim.db`.
   - למחוק marker ו־backup.
4. אם apply מצליח:
   - למחוק marker ו־backup רק אחרי שה־DB נפתח מחדש והאפליקציה יודעת להמשיך.

חשוב: אינדקס חיפוש אינו סיבה ל־rollback של DB אחרי commit. אם DB עודכן ואינדוקס נכשל, נשארים עם DB החדש וניתן להפעיל אינדוקס שוב מאוחר יותר.

### סריאליזציה ונעילות

כל apply חייב לרוץ בתוך `DatabaseLibraryProvider.operationQueue`.

בתוך ה־queue:

1. `SqliteDataProvider.instance.closeForExternalWrite()`
2. apply
3. `SqliteDataProvider.instance.reopenAfterExternalWrite()`

ה־`closeForExternalWrite` חייב להיות בתוך `try`, וה־`reopenAfterExternalWrite` בתוך `finally`.

לא לסגור את ה־RO לפני כניסה ל־queue, אחרת קריאות DB רגילות ייחסמו גם בזמן המתנה בתור.

### סדר apply

הסדר צריך לשכפל את `PatchApplier` בצד הייצור:

1. לפתוח connection כתיב ל־`seforim.db`.
2. `PRAGMA foreign_keys = ON`.
3. להתחיל transaction.
4. `ATTACH DATABASE <patch.db> AS patch`.
5. לקרוא `patch.patch_meta.schema_version`.
6. אם `schema_version` גדול ממה שהאפליקציה תומכת בו: לעצור ולבקש עדכון תוכנה/DB מלא.
7. `PRAGMA defer_foreign_keys = ON`.
8. להריץ `patch.migrations` לפי `version ASC`.
9. להריץ upserts לפי FK order.
10. להריץ deletes לפי FK order הפוך.
11. לוודא ש־`pragma_foreign_key_check` לא גדל.
12. לחשב logical hash ולהשוות ל־`manifest.toContentHash`.
13. commit.
14. detach.

סדר הטבלאות ל־upsert הוא אותו סדר של logical hash, עם התאמה ל־FK order.
ה־delete הוא אותו סדר הפוך.

### upsert semantics

לכל טבלה:

- אם יש עמודות שאינן primary key: `INSERT ... ON CONFLICT(pk) DO UPDATE SET ...`.
- אם זו טבלת junction שכל העמודות הן primary key: `DO NOTHING`.

לא להשתמש ב־`INSERT OR REPLACE`, כי הוא מוחק ומכניס מחדש ועלול לשבור FK/side effects.

## Full DB fallback

מסלול full נדרש כאשר:

- אין patch path מגרסה מקומית ל־latest.
- `fromContentHash` לא מתאים ל־DB המקומי.
- `db_schema_version` לא מתאים.
- patch schema חדש מדי.
- DB מקומי חסר `schema_meta.db_version`.
- המשתמש מבקש “הורדה מלאה”.

תהליך full:

1. להוריד `seforim.db.zst` מה־release הנבחר.
2. לאמת sha256 אם GitHub API מחזיר digest או אם יש manifest מתאים.
3. לחלץ ל־cache כ־`seforim.db.new`.
4. להריץ `PRAGMA quick_check`.
5. לקרוא `schema_meta.db_version` ולוודא שזה latest.
6. לסגור DB דרך `closeForExternalWrite`.
7. ליצור backup.
8. להחליף DB אטומית:
   - באותו filesystem: rename/move.
   - אם atomic rename לא אפשרי: copy ואז verify ואז replace.
9. לפתוח מחדש DB.
10. לרענן runtime ולהפעיל אינדוקס (בלי למחוק את האינדקס).

באנדרואיד:

- אם `keyDbEffectivePath` מוגדר, להחליף את ה־DB בנתיב effective הפנימי.
- לא להניח שה־DB החיצוני המקורי ניתן לכתיבה.

## ריענון runtime אחרי עדכון

אחרי DB update מוצלח:

1. `SqliteDataProvider.instance.dispose()`
2. `LibraryProviderManager.instance.resetRuntimeState()`
3. ניקוי caches בזיכרון:
   - `BooksCache`
   - `AcronymsCache`
   - `GenerationCache`
   - `ReferenceBooksCache`
   - `FindRefRepository.clearAllCaches()`
   - `CommentaryService.clearEraCache()`
   - `TantivyDataProvider.clearGlobalCache()` — מנקה רק cache בזיכרון (facet cache); אינו מוחק את קבצי האינדקס.
4. `SqliteDataProvider.instance.initialize()`
5. `NavigationRepository.refreshLibrary()` או `LibraryBloc.add(RefreshLibrary())`.
6. אם `keyAutoUpdateIndex` פעיל: `IndexingBloc.add(StartIndexing(library))`. אין לקרוא ל־`TantivyDataProvider.instance.clear()` — הוא מוחק את כל האינדקס מהדיסק.

צריך להיזהר לא להפעיל `StartIndexing` לפני שהספרייה נטענה מחדש מה־DB החדש.

## UI/UX

### כפתור סנכרון בספרייה

הכפתור הקיים בספרייה (`library_browser.dart`) יכול להישאר באותו מקום, אבל הטקסט צריך להשתנות:

- “בודק עדכוני ספרייה”
- “מוריד עדכון ספרייה”
- “מאמת קובץ עדכון”
- “מחיל עדכון DB”
- “מרענן ספרייה”
- “בונה אינדקס חיפוש” / “נדרש אינדוקס”

אם אין עדכונים:

- להציג “הספרייה מעודכנת”.

אם נעשה full fallback:

- להציג מראש שהעדכון גדול יותר.
- לא להפתיע את המשתמש בהורדה של 1GB+ אם הוא לחץ על “סנכרון” וציפה ל־2MB.

### עדכון אוטומטי בעלייה

ב־`MainWindowScreen` הפונקציה `_startFileSync()` מפעילה היום את `FileSyncBloc` — מנגנון עדכון ה־DB הישן. יש להחליף אותה כך שתפעיל את המנגנון החדש, ולהריץ רק אחרי:

- ספרייה נטענה.
- החלטת indexing הסתיימה.
- אין indexing פעיל.

לא להריץ update DB בזמן שהאפליקציה עדיין פותחת ספר/חיפוש; זה יוצר lock contention.

### ביטול

ביטול בטוח בשלבים:

- בזמן הורדה: לעצור ולהשאיר `.part`.
- בזמן חילוץ: לעצור, למחוק output חלקי.
- בזמן apply transaction: לא להבטיח cancel מיידי בין כל statement אם זה מסבך. אפשר “ביטול ייכנס לתוקף אחרי הפעולה הנוכחית”.
- אחרי commit: לא לבטל DB; רק להמשיך לריענון runtime.

## בדיקות חובה

### Unit tests

להוסיף תחת `test/library_update/`:

1. parse manifest:
   - manifest תקין.
   - שדה חובה חסר.
   - compression שאינו `zstd`.

2. release discovery:
   - מתעלם מ־draft.
   - stable channel לא בוחר prerelease.
   - dev channel כן בוחר prerelease.

3. update path:
   - local 1, latest 3, direct 1→3 קיים: בוחר direct.
   - local 1, latest 3, רק 1→2 ו־2→3: בוחר chain.
   - חסר 2→3: full fallback.
   - שני chains אפשריים: בוחר קצר/קטן.

4. logical hash:
   - שתי DB עם אותן rows בסדר פיזי שונה נותנות אותו hash.
   - שינוי row משנה hash.
   - null/blob/int/text מקודדים נכון.

5. patch applier:
   - upsert רגיל.
   - delete רגיל.
   - junction table `DO NOTHING`.
   - migration לפני upsert.
   - schema_version חדש מדי נכשל.
   - hash mismatch אחרי apply עושה rollback.

6. recovery:
   - marker+backup קיימים בתחילת אפליקציה → restore.
   - marker בלי backup → error ברור ולא מחיקה שקטה.

### Integration tests עם הקבצים המקומיים

להשתמש בקבצים שכבר הורדו:

```text
/Users/david/Downloads/releases/v1
/Users/david/Downloads/releases/v2
/Users/david/Downloads/releases/v3
```

בדיקות:

1. v1→v3:
   - לחלץ v1 DB.
   - להחיל `patch-v1-v3.db.zst`.
   - לוודא:
     - `PRAGMA quick_check = ok`
     - `schema_meta.db_version = 3`
     - logical hash == `toContentHash`

2. v2→v3:
   - אותו דבר עם `patch-v2-v3.db.zst`.

3. corrupt patch:
   - לשנות byte בקובץ.
   - לוודא sha256 נכשל לפני apply.

4. wrong source:
   - לנסות patch v2→v3 על DB v1.
   - לוודא שנכשל לפני כתיבה בגלל version/hash.

5. crash recovery simulation:
   - ליצור backup+marker.
   - לשנות DB.
   - להריץ recovery.
   - לוודא DB חזר ל־backup.

### בדיקות UI/BLoC

- offline mode מחזיר state מתאים.
- updates disabled מחזיר state מתאים.
- אין עדכון → completed בלי `hasNewUpdate`.
- delta update → progress states לפי שלבים.
- full fallback → state דורש אישור משתמש או מציין הורדה מלאה.
- שגיאה → error עם הודעה קריאה.

## שלבי ביצוע מומלצים

### שלב 1 — תשתית קריאה ותכנון

1. להוסיף models ל־manifest/release/update plan.
2. להוסיף GitHub client שמחזיר releases ו־assets.
3. להוסיף version reader שקורא `schema_meta`.
4. להוסיף path planner.
5. בדיקות unit ל־planner.

אין עדיין apply.

### שלב 2 — hash ו־apply מקומי

1. לממש `LogicalContentHasher`.
2. לממש `PatchApplier`.
3. להריץ בדיקות עם patch DB מקומי.
4. לוודא rollback בכישלון.

אין עדיין UI.

### שלב 3 — download/cache/recovery

1. להוסיף downloader (בלי resume — קבצים קטנים).
2. להוסיף zstd streaming + sha verification.
3. להוסיף recovery service.
4. להוסיף integration tests מול v1/v2/v3 מקומיים.

### שלב 4 — חיבור ל־BLoC/UI

1. להחליף `FileSyncBloc` ב־`LibraryUpdateBloc`.
2. לחבר לכפתור הסנכרון בספרייה.
3. לחבר להפעלה אוטומטית אחרי startup.
4. להציג full fallback בצורה מפורשת.

### שלב 5 — ריענון runtime ואינדקס

1. אחרי update מוצלח לרענן providers/caches.
2. להפעיל אינדוקס (`StartIndexing`) אם ההגדרה פעילה — בלי למחוק את האינדקס.
3. לבדוק פתיחת ספרים וחיפוש אחרי update.

### שלב 6 — ניקוי הקוד הישן

אחרי שהמסלול החדש עובד:

- למחוק או להשבית את parse של `N-M.DIFF.zst`.
- למחוק שימוש ב־`db_meta.content_version_int` לצורך עדכוני ספרייה.
- להשאיר `migration/sync` עבור ספרים אישיים.
- לעדכן שמות UI מ־“סנכרון” כללי ל־“עדכון ספרייה” אם צריך.

## נקודות סיכון

1. Hash לא זהה ל־Kotlin.
   זה הסיכון הכי גדול. לבדוק מול DB אמיתי לפני כל UI.

2. Android effective path.
   לא להחליף את `keyLibraryPath/seforim.db` אם האפליקציה בפועל משתמשת ב־`keyDbEffectivePath`.

3. אינדקס חיפוש ישן.
   מנגנון עדכון ה־DB אינו מוחק את האינדקס; הוא רק מפעיל אינדוקס. כיום `StartIndexing` מדלג על ספר קיים שתוכנו השתנה (ראה "אינדקס חיפוש"), ולכן עד לתיקון מנגנון האינדוקס, חיפוש בספר שתוכנו עודכן עלול להציג תוצאות ישנות.

4. prerelease.
   אם הספרייה תפורסם כ־prerelease בלבד, `/releases/latest` לא מספיק.

5. DB locks.
   כל כתיבה דרך `operationQueue`, עם `closeForExternalWrite`/`reopenAfterExternalWrite` ב־try/finally.

6. מקום פנוי.
   patch קטן לא אומר שאין צורך במקום: backup של DB מלא הוא בערך 5.5GB.

7. Full fallback בלי אישור.
   אם המשתמש בלחיצה רגילה מצפה לעדכון קטן, לא להתחיל הורדה מלאה של 1GB+ בלי הסבר/אישור.

## קריטריוני קבלה

היישום נחשב מוכן כאשר:

1. עדכון ישיר מ־v1 ל־v3 מצליח באפליקציה/טסט.
2. עדכון ישיר מ־v2 ל־v3 מצליח באפליקציה/טסט.
3. wrong-source patch נכשל לפני כתיבה.
4. corrupt download נכשל לפני כתיבה.
5. marker+backup משחזרים DB אחרי סימולציית קריסה.
6. אחרי update:
   - הספרייה נטענת מחדש.
   - פתיחת ספר עובדת.
   - אינדוקס מופעל לקליטת ספרים חדשים, בלי מחיקת האינדקס הקיים.
7. `flutter analyze` עובר.
8. הטסטים החדשים עוברים.

