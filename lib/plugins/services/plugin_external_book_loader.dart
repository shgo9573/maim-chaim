import 'package:otzaria/data/data_providers/file_system_data_provider.dart';
import 'package:otzaria/data/repository/data_repository.dart';
import 'package:otzaria/external_catalog/repository/external_catalog_repository.dart';
import 'package:otzaria/models/books.dart';
import 'package:otzaria/plugins/models/plugin_book_identity.dart';

/// טוען ספרים לפי זהות חיצונית — המוקד היחיד שמתאים בין שם ספק
/// (`external.provider`) לספרייה החיצונית המתאימה בצד המארח.
///
/// ספק לא מוכר מוחזר כרשימה ריקה. משמש הן את פתרון הזהויות הדקלרטיבי
/// (library.resolveBooks / reader.openBook) והן את מנוע המהדורות
/// המקבילות הגנרי.
Future<List<Book>> loadExternalBooksByProvider(
  String provider,
  Set<Object> externalIds,
) {
  return switch (provider) {
    'hebrewbooks' => _loadHebrewBooksByIds(externalIds),
    'otzar' => DataRepository.instance.otzarBooks,
    _ => Future.value(const <Book>[]),
  };
}

Future<List<Book>> _loadHebrewBooksByIds(Set<Object> externalIds) async {
  final ids = externalIds.map(PluginBookIdentity.parseId).nonNulls.toSet();
  if (ids.isEmpty) return const [];
  final localMatches = (await DataRepository.instance.localHebrewBooks).where((
    book,
  ) {
    final external = PluginBookIdentity.externalOf(book);
    return external?.provider == 'hebrewbooks' &&
        ids.contains(PluginBookIdentity.parseId(external?.id));
  }).toList();
  final localIds = localMatches
      .map(PluginBookIdentity.externalOf)
      .nonNulls
      .map((external) => PluginBookIdentity.parseId(external.id))
      .nonNulls
      .toSet();
  final missingIds = ids.difference(localIds);
  if (missingIds.isEmpty) return localMatches;
  final catalogBooks = await ExternalCatalogRepository.instance
      .getHebrewBooksByIds(missingIds);
  // מטמון הסריקה מתיישן בזמן שהורדות רצות ברקע; בדיקה נקודתית של הקבצים
  // המבוקשים מאפשרת לפתוח מקומית ספר שירד זה עתה, בלי רענון ספרייה.
  final probed = await FileSystemData.probeHebrewBooksPdfFilesByIds(
    missingIds,
  );
  if (probed.isEmpty) return [...localMatches, ...catalogBooks];
  return [
    ...localMatches,
    ...FileSystemData.mapHebrewBooksToLocal(catalogBooks, probed),
  ];
}
