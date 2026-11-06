import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:otzaria_icons/otzaria_icons.dart';
import 'package:flutter/material.dart';
import 'package:otzaria/tabs/models/external_book_matches.dart';
import 'package:otzaria/tabs/models/pdf_tab.dart';
import 'package:otzaria/widgets/misc/rtl_icon.dart';
import 'package:otzaria/widgets/text/rtl_text_field.dart';

/// סרגל ניווט בין עמודי התאמה שסופקו על-ידי מנוע חיפוש חיצוני (תוסף).
///
/// מוצג מתחת לסרגל העליון של קורא ה-PDF רק כשלטאב יש [ExternalBookMatches].
/// ההדגשה בתוך העמוד אינה באחריותו — ספרי היברובוקס הם לרוב סריקות ללא שכבת
/// טקסט, ולכן הערך המרכזי הוא הקפיצה המדויקת בין עמודי ההתאמה.
class PdfExternalMatchesBar extends StatefulWidget {
  final PdfBookTab tab;
  final Future<void> Function(int page) onNavigateToPage;

  /// חיפוש מחדש בתוך הספר דרך הספק החיצוני. null = אין ספק רשום, ושדה
  /// החיפוש מוסתר (הניווט בין ההתאמות הקיימות עדיין פעיל).
  final Future<ExternalBookMatches?> Function(String query)? onProviderSearch;

  const PdfExternalMatchesBar({
    super.key,
    required this.tab,
    required this.onNavigateToPage,
    this.onProviderSearch,
  });

  @override
  State<PdfExternalMatchesBar> createState() => _PdfExternalMatchesBarState();
}

class _PdfExternalMatchesBarState extends State<PdfExternalMatchesBar> {
  late final TextEditingController _queryController;
  int _currentIndex = 0;
  bool _searching = false;
  String? _error;

  ExternalBookMatches? get _matches => widget.tab.externalMatches.value;

  @override
  void initState() {
    super.initState();
    _queryController = TextEditingController(text: _matches?.query ?? '');
    widget.tab.externalMatches.addListener(_onMatchesChanged);
  }

  @override
  void dispose() {
    widget.tab.externalMatches.removeListener(_onMatchesChanged);
    _queryController.dispose();
    super.dispose();
  }

  void _onMatchesChanged() {
    if (!mounted) return;
    setState(() {
      _currentIndex = 0;
      final query = _matches?.query;
      if (query != null && query.isNotEmpty) _queryController.text = query;
    });
  }

  Future<void> _goToIndex(int index) async {
    final matches = _matches;
    if (matches == null || matches.pages.isEmpty) return;
    final clamped = index.clamp(0, matches.pages.length - 1);
    setState(() => _currentIndex = clamped);
    await widget.onNavigateToPage(matches.pages[clamped]);
  }

  Future<void> _runProviderSearch() async {
    final search = widget.onProviderSearch;
    final query = _queryController.text.trim();
    if (search == null || query.isEmpty || _searching) return;
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final result = await search(query);
      if (!mounted) return;
      if (result == null || result.isEmpty) {
        setState(() => _error = 'לא נמצאו התאמות');
        return;
      }
      widget.tab.externalMatches.value = result;
      await _goToIndex(0);
    } catch (_) {
      if (mounted) setState(() => _error = 'החיפוש בספר נכשל');
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ExternalBookMatches?>(
      valueListenable: widget.tab.externalMatches,
      builder: (context, matches, _) {
        if (matches == null) return const SizedBox.shrink();
        final theme = Theme.of(context);
        final pages = matches.pages;
        final hasPages = pages.isNotEmpty;
        final current = hasPages
            ? pages[_currentIndex.clamp(0, pages.length - 1)]
            : null;
        return Material(
          color: theme.colorScheme.surfaceContainerHighest,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            child: Row(
              children: [
                Icon(
                  OtzariaIcons.book_search_24_regular,
                  size: 18,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 8),
                if (widget.onProviderSearch != null)
                  SizedBox(
                    width: 220,
                    child: RtlTextField(
                      controller: _queryController,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => _runProviderSearch(),
                      decoration: InputDecoration(
                        hintText: 'חיפוש בספר...',
                        isDense: true,
                        border: InputBorder.none,
                        errorText: _error,
                        suffixIcon: _searching
                            ? const Padding(
                                padding: EdgeInsets.all(8),
                                child: SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              )
                            : IconButton(
                                icon: const Icon(
                                  OtzariaIcons.search_24_regular,
                                  size: 16,
                                ),
                                tooltip: 'חפש',
                                onPressed: _runProviderSearch,
                              ),
                      ),
                    ),
                  )
                else if (matches.query.isNotEmpty)
                  Flexible(
                    child: Text(
                      '"${matches.query}"',
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                const Spacer(),
                if (hasPages) ...[
                  IconButton(
                    icon: const RtlIcon(
                      FluentIcons.chevron_right_24_regular,
                    ),
                    iconSize: 18,
                    tooltip: 'המופע הקודם',
                    onPressed: _currentIndex > 0
                        ? () => _goToIndex(_currentIndex - 1)
                        : null,
                  ),
                  PopupMenuButton<int>(
                    tooltip: 'רשימת עמודי ההתאמה',
                    onSelected: _goToIndex,
                    itemBuilder: (context) => [
                      for (var i = 0; i < pages.length; i++)
                        PopupMenuItem(
                          value: i,
                          height: 32,
                          child: Text('עמוד ${pages[i]}'),
                        ),
                    ],
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Text(
                        'עמוד $current · ${_currentIndex + 1}/${pages.length}',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const RtlIcon(
                      FluentIcons.chevron_left_24_regular,
                    ),
                    iconSize: 18,
                    tooltip: 'המופע הבא',
                    onPressed: _currentIndex < pages.length - 1
                        ? () => _goToIndex(_currentIndex + 1)
                        : null,
                  ),
                ] else
                  Text('אין התאמות', style: theme.textTheme.bodySmall),
                IconButton(
                  icon: const Icon(FluentIcons.dismiss_24_regular),
                  iconSize: 16,
                  tooltip: 'סגור את סרגל ההתאמות',
                  onPressed: () => widget.tab.externalMatches.value = null,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
