# Personal Notes System - API Reference

## סקירה כללית

מסמך זה מתאר את הממשק החדש של מערכת ההערות האישיות באוצריא. המערכת מבוססת על קבצי JSON ו-TXT לכל ספר, עם זיהוי לפי מספר שורה ועשר המילים הראשונות.

## מודל הנתונים

```dart
class PersonalNote {
  final String id;
  final String bookId;
  final int? lineNumber;
  final List<String> referenceWords;
  final int? lastKnownLineNumber;
  final PersonalNoteStatus status; // located / missing
  final PersonalNotePointer pointer; // מיקום בתוך קובץ ה-TXT
  final String content;
  final DateTime createdAt;
  final DateTime updatedAt;
}
```

* הערות ממוקמות נשמרות עם מספר שורה תקין.
* הערות שאיבדו עוגן נשמרות עם `status = PersonalNoteStatus.missing` והמספר הקודם בשדה `lastKnownLineNumber`.

## שכבת האחסון

```dart
class PersonalNotesStorage {
  static final PersonalNotesStorage instance;

  Future<List<PersonalNote>> readNotes(String bookId);
  Future<List<PersonalNote>> writeNotes(String bookId, List<PersonalNote> notes);
  Future<List<StoredBookNotes>> listStoredBooks();
  Future<String> notesDirectoryPath();
  static String safeFileName(String bookId);
}
```

* קובץ ה-TXT: `הערות אישיות על <safeName>.txt`
* קובץ ה-JSON: `<safeName>_annotations.json`
* `StoredBookNotes` מכיל `bookId`, שם קובץ מסונן, ותאריך עדכון.

## שכבת השירות

```dart
class PersonalNotesService {
  Future<List<PersonalNote>> loadNotes({required String bookId, required String bookContent});
  Future<List<PersonalNote>> addNote({required String bookId, required String bookContent, required int lineNumber, required String content});
  Future<List<PersonalNote>> updateNote({required String bookId, required String bookContent, required String noteId, required String content});
  Future<List<PersonalNote>> deleteNote({required String bookId, required String bookContent, required String noteId});
  Future<List<PersonalNote>> repositionNote({required String bookId, required String bookContent, required String noteId, required int lineNumber});
}
```

* השירות מבצע התאמה מחודשת של שורות על סמך 10 המילים הראשונות.
* במקרה של כשל בהתאמה, ההערה מסומנת כ"ללא מיקום".

## הריפוזיטורי וה-BLoC

```dart
class PersonalNotesRepository {
  Future<List<PersonalNote>> loadNotes(String bookId);
  Future<List<PersonalNote>> addNote({required String bookId, required int lineNumber, required String content});
  Future<List<PersonalNote>> updateNote({required String bookId, required String noteId, required String content});
  Future<List<PersonalNote>> deleteNote({required String bookId, required String noteId});
  Future<List<PersonalNote>> repositionNote({required String bookId, required String noteId, required int lineNumber});
  Future<LegacyConversionSummary> convertLegacyNotes();
  Future<List<StoredBookNotes>> listBooksWithNotes();
}
```

```dart
class PersonalNotesBloc extends Bloc<PersonalNotesEvent, PersonalNotesState> {
  // אירועים: LoadPersonalNotes, AddPersonalNote, UpdatePersonalNote,
  //          DeletePersonalNote, RepositionPersonalNote, ConvertLegacyNotes
}
```

`PersonalNotesState` מחזיק:
* `locatedNotes` – הערות עם מיקום תקין.
* `missingNotes` – הערות חסרות מיקום.
* `bookId`, `isLoading`, `errorMessage` ו-`conversionSummary`.

## ממשקי משתמש

### סרגל הצד בספר הטקסט

`PersonalNotesSidebar` מציג שתי קטגוריות:
* "הערות" – רשימה ממוינת לפי מספר שורה.
* "הערות חסרות מיקום" – מציגות גם את השורה האחרונה הידועה, ומאפשרות מיקום מחדש.

קריאה על הערה ממוקמת מפעילה גלילה ובוהק של השורה במסך הטקסט.

### מסך "הערות אישיות" תחת "עזרים"

`PersonalNotesManagerScreen` מאפשר:
* בחירת ספר מתוך רשימת הספרים עם הערות קיימות.
* צפייה בשתי כרטיסיות (הערות / הערות חסרות מיקום).
* עריכה, מחיקה ומיקום מחדש של הערות.

## גיבוי ושחזור

הגיבוי (`BackupService`) שומר רשימה של מפות עם:

```json
{
  "bookId": "שם הספר",
  "safeName": "שם קובץ מסונן",
  "annotations": { ... },
  "text": "תוכן ההערות"
}
```

בעת שחזור:
* הקבצים הקיימים בתיקיית "הערות" נמחקים.
* נכתבים מחדש קובצי ה-JSON וה-TXT על פי הנתונים שבגיבוי.

## הגירת נתונים ישנים

`LegacyNotesConverter` קורא את מסד הנתונים הישן (SQLite) וממיר כל ספר לפורמט החדש. הערות ללא התאמה מסומנות כ"ללא מיקום".

## דגשים לאינטגרציה

1. בעת הוספת הערה חדשה יש להזין מספר שורה בלבד – אין עוד תלות בבחירת מילים.
2. מומלץ לקרוא ל-`PersonalNotesBloc` עם `LoadPersonalNotes(bookId)` בעת פתיחת ספר.
3. לצורך הבלטה של השורה במסך, יש לשלוח את האירוע `HighlightLine` ל-`TextBookBloc` עם אינדקס השורה (0-based).
