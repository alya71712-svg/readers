/* ترقيم موحّد لكل التظليلات والملاحظات والإشارات في القراء العشرة.
   القاعدة (يستعملها «تصدير مرتب» في اللوحة الرئيسية ولوحة «الإشارات المرجعية» داخل كل قارئ):
   كل القراء بترتيب اللوحة ← الكتب بترتيبها الأبجدي داخل القارئ ← العناصر بترتيب الفقرة ثم وقت الإنشاء.
   الرقم ثابت ما لم تُضَف أو تُحذف عناصر؛ وعند الإضافة أو الحذف تُعاد أرقام ما بعدها في اللوحتين معاً. */
(function (root) {
  'use strict';
  var KEYS = ['myreader_userdata_origen_v1', 'myreader_userdata_philo_v1', 'myreader_userdata_josephus_v1',
    'myreader_userdata_heraclius_main_v1', 'myreader_userdata_another_heraclius_v1', 'myreader_userdata_filo_leop_v1',
    'myreader_userdata_heraclius_legend_v1', 'myreader_userdata_motherhood_v1', 'myreader_userdata_woman_filo_v1',
    'myreader_userdata_template_base_v1'];

  function idOf(reader, isNote, bookId, ts) { return (isNote ? 'n' : 'b') + '|' + reader + '|' + bookId + '|' + ts; }
  function cmp(a, b) {
    var pa = a.pid == null || isNaN(a.pid) ? 1e12 : a.pid, pb = b.pid == null || isNaN(b.pid) ? 1e12 : b.pid;
    return pa - pb || (a.ts - b.ts);
  }
  // entries: [{reader, isNote, bookId, book, pid, ts}] ؛ rord(reader) → ترتيب القارئ. يعيد خريطة id → رقم.
  function assign(entries, rord) {
    var groups = {}, order = [], map = {}, n = 0;
    entries.forEach(function (e) {
      var k = e.reader + '\u0001' + (e.bookId || e.book);
      if (!groups[k]) { groups[k] = { rord: rord(e.reader), book: e.book, entries: [] }; order.push(groups[k]); }
      groups[k].entries.push(e);
    });
    order.sort(function (a, b) { return a.rord - b.rord || String(a.book).localeCompare(String(b.book), 'ar'); });
    order.forEach(function (g) {
      g.entries.sort(cmp);
      g.entries.forEach(function (e) { map[idOf(e.reader, e.isNote, e.bookId, e.ts)] = ++n; });
    });
    return map;
  }

  function parse(raw) {
    if (!raw) return null;
    try { var d = JSON.parse(raw); return d && d._type === 'my-reader-userdata' ? d : null; } catch (e) { return null; }
  }
  function ls(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }

  // داخل صفحة قارئ: يقرأ بيانات كل القراء من التخزين المحلي، ويستعمل بيانات هذا القارئ الحيّة (live) كما هي في الذاكرة
  function forReader(selfKey, live) {
    var entries = [];
    KEYS.forEach(function (key) {
      var d = key === selfKey && live ? live : parse(ls(key));
      if (!d) return;
      (d.bookmarks || []).forEach(function (b) { entries.push({ reader: key, isNote: false, bookId: b.bookId, book: b.title || b.bookId || '', pid: b.pid == null ? null : Number(b.pid), ts: b.ts || 0 }); });
      (d.notes || []).forEach(function (n) { entries.push({ reader: key, isNote: true, bookId: n.bookId, book: n.book || n.bookId || '', pid: n.pid == null ? null : Number(n.pid), ts: n.ts || 0 }); });
    });
    var map = assign(entries, function (r) { var i = KEYS.indexOf(r); return i < 0 ? 999 : i; });
    return { numOf: function (isNote, bookId, ts) { return map[idOf(selfKey, isNote, bookId, ts)] || null; } };
  }

  var cssDone = false;
  function addCss() {
    if (cssDone || !root.document) return; cssDone = true;
    var st = root.document.createElement('style');
    st.textContent = '.bm-no{display:inline-block;min-width:24px;padding:0 6px;margin-inline-end:6px;border-radius:10px;background:#7c4a2d;color:#fff;font:700 12px/1.7 sans-serif;text-align:center;vertical-align:middle}';
    root.document.head.appendChild(st);
  }

  root.ReaderNumbers = { KEYS: KEYS, idOf: idOf, assign: assign, forReader: forReader, addCss: addCss };
  if (root.document) { if (root.document.head) addCss(); else root.document.addEventListener('DOMContentLoaded', addCss); }
})(typeof window !== 'undefined' ? window : globalThis);
