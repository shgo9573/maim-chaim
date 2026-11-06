import 'package:otzaria/core/app_runtime_reset.dart';
import 'package:otzaria/data/data_providers/sqlite_data_provider.dart';
import 'package:otzaria/data/data_providers/tantivy_data_provider.dart';

/// מרענן את מצב ה-runtime אחרי שה-DB עודכן בדיסק, כך שהאפליקציה תקרא את
/// התוכן החדש בלי restart.
///
/// אחריות: ניקוי caches בזיכרון, איפוס providers, ופתיחה מחדש של ה-DB.
/// **אינו** נוגע באינדקס החיפוש על הדיסק — הפעלת אינדוקס מחדש (StartIndexing)
/// נעשית בשכבת ה-BLoC, שיש לה גישה ל-IndexingBloc ולספרייה.
class LibraryRuntimeRefreshService {
  const LibraryRuntimeRefreshService();

  /// קוראים אחרי החלפת/עדכון `seforim.db`, בתוך אותו תור פעולות ה-DB.
  Future<void> refreshAfterDbUpdate() async {
    // מנקה רק את ה-facet cache בזיכרון — לא מוחק את קבצי האינדקס.
    TantivyDataProvider.clearGlobalCache();

    // dispose ל-sqlite, איפוס providers וניקוי כל ה-caches המבוססים על ה-DB.
    await resetRuntimeStateForAppRestart();

    // פתיחה מחדש של ה-DB החדש (read-only) לקריאות הבאות.
    await SqliteDataProvider.instance.initialize();
  }
}
