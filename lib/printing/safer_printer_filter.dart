import 'package:printing/printing.dart';

/// מסנן המדפסות המותרות במצב סייפר: כל מדפסת שהפלט שלה הוא קובץ ולא נייר
/// פותחת דיאלוג "שמירה בשם" של המערכת, ודרכו המשתמש מגיע לכל קבצי המחשב.
abstract class SaferPrinterFilter {
  /// פורטים ב-Windows שאינם מדפיסים לנייר: `PORTPROMPT:` (Print to PDF, XPS),
  /// `FILE:` (הדפסה לקובץ), `nul:` (OneNote), `SHRFAX:` (פקס).
  static const _fileOutputPorts = {'portprompt:', 'file:', 'nul:', 'shrfax:'};

  /// זיהוי לפי שם הדרייבר/המדפסת — למערכות שבהן אין מידע על הפורט.
  static const _fileOutputKeywords = [
    'pdf',
    'xps',
    'onenote',
    'fax',
    'print to file',
    'cups-pdf',
  ];

  static bool isFileOutputPort(String? port) =>
      port != null && _fileOutputPorts.contains(port.trim().toLowerCase());

  static bool isFileOutputByName(Printer printer) {
    final haystack = '${printer.name} ${printer.model ?? ''}'.toLowerCase();
    return _fileOutputKeywords.any(haystack.contains);
  }

  /// המדפסות שמותר להציע במצב סייפר. [portsByName] — פורט לכל שם מדפסת
  /// (ב-Windows). שני הסימנים נבדקים תמיד: מדפסות PDF של צד שלישי משתמשות
  /// בפורט ייעודי משלהן, ורק שמן מסגיר אותן.
  static List<Printer> allowed(
    Iterable<Printer> printers,
    Map<String, String> portsByName,
  ) {
    return printers.where((printer) {
      if (!printer.isAvailable) return false;
      final port = portsByName[printer.name] ?? portsByName[printer.url];
      return !isFileOutputPort(port) && !isFileOutputByName(printer);
    }).toList();
  }
}
