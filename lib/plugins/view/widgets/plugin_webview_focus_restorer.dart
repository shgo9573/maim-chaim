import 'package:flutter/widgets.dart';

/// מחזיר את פוקוס המקלדת אל ה-WebView של תוסף כשהחלון חוזר לחזית.
///
/// בחזרה לחלון (Alt-Tab) המערכת מוסרת את המקלדת לחלון של Flutter, לא
/// ל-WebView שהחזיק אותה קודם — ובלי [onRestore] אי אפשר להקליד בתוסף עד
/// קליק. השחזור נעשה רק אם הפוקוס של Flutter יושב בתוך [child]: כך שדה
/// טקסט או ספר בחלונית השנייה של טאב מפוצל אינם מאבדים את המקלדת.
class PluginWebViewFocusRestorer extends StatefulWidget {
  const PluginWebViewFocusRestorer({
    super.key,
    required this.onRestore,
    required this.child,
  });

  final VoidCallback onRestore;
  final Widget child;

  @override
  State<PluginWebViewFocusRestorer> createState() =>
      PluginWebViewFocusRestorerState();
}

class PluginWebViewFocusRestorerState extends State<PluginWebViewFocusRestorer>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  bool get _ownsPrimaryFocus =>
      FocusManager.instance.primaryFocus?.context
          ?.findAncestorStateOfType<PluginWebViewFocusRestorerState>() ==
      this;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || !_ownsPrimaryFocus) return;
    widget.onRestore();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
