import 'package:flutter_inappwebview/flutter_inappwebview.dart';

// החלפת צומת טקסט מנתקת אותו מה-DOM. ספריית רינדור שמחזיקה הפניה לצומת
// (React/Vue) תעדכן אחר כך צומת מנותק והשינוי ייעלם — לכן המצב האוטומטי הוא
// opt-in במניפסט, ולא ברירת מחדל לכל התוספים.
const String _linkifyJs = r'''
(function () {
  var PREFIX = 'otzaria://';
  var PATTERN = /otzaria:\/\/[^\s<>"'`]+/g;
  var TRAILING = /[.,;:!?)\]}'"]+$/;
  var SKIP_TAGS = {
    A: 1, SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1,
    NOSCRIPT: 1, TEMPLATE: 1, IFRAME: 1
  };
  var busy = false;

  function shouldSkip(node) {
    for (var el = node.parentNode; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP_TAGS[el.nodeName]) return true;
      if (el.isContentEditable) return true;
      if (el.hasAttribute && el.hasAttribute('data-otzaria-no-linkify')) return true;
    }
    return false;
  }

  function linkifyTextNode(node) {
    var text = node.nodeValue;
    var frag = document.createDocumentFragment();
    var cursor = 0;
    var match;
    PATTERN.lastIndex = 0;
    while ((match = PATTERN.exec(text)) !== null) {
      var url = match[0].replace(TRAILING, '');
      if (match.index > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      }
      var anchor = document.createElement('a');
      anchor.setAttribute('href', url);
      anchor.className = 'otzaria-link';
      anchor.textContent = url;
      frag.appendChild(anchor);
      cursor = match.index + url.length;
    }
    if (cursor === 0) return false;
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }
    node.parentNode.replaceChild(frag, node);
    return true;
  }

  function linkify(root) {
    var scope = root || document.body;
    if (!scope) return 0;
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
    var pending = [];
    var node;
    while ((node = walker.nextNode()) !== null) {
      if (node.nodeValue.indexOf(PREFIX) !== -1 && !shouldSkip(node)) {
        pending.push(node);
      }
    }
    busy = true;
    try {
      var count = 0;
      for (var i = 0; i < pending.length; i++) {
        if (linkifyTextNode(pending[i])) count++;
      }
      return count;
    } finally {
      busy = false;
    }
  }

  window.__otzariaLinkify = linkify;
  if (window.Otzaria) window.Otzaria.linkify = linkify;

  if (!window.__otzariaAutoLinkify) return;

  var scheduled = false;
  function schedule() {
    if (busy || scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      linkify(document.body);
    });
  }

  function start() {
    linkify(document.body);
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
''';

/// סקריפט שהופך כתובות `otzaria://` שנכתבו כטקסט רגיל לקישורים לחיצים.
///
/// [auto] מגיע מ-`contributes.autoLinkify` במניפסט: כשהוא כבוי הסקריפט רק חושף
/// את `Otzaria.linkify(root)` לקריאה יזומה של התוסף.
UserScript buildPluginLinkifyScript({required bool auto}) {
  return UserScript(
    source: 'window.__otzariaAutoLinkify = $auto;\n$_linkifyJs',
    injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
  );
}
