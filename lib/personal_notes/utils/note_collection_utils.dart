import 'package:otzaria/personal_notes/models/personal_note.dart';

List<PersonalNote> sortPersonalNotes(List<PersonalNote> notes) {
  final located = notes.where((n) => n.hasLocation).toList()
    ..sort((a, b) => a.lineNumber!.compareTo(b.lineNumber!));
  final missing = notes.where((n) => !n.hasLocation).toList()
    ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  return [...located, ...missing];
}
