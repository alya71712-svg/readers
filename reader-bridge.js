/* ============================================================
   جسر القوارئ العشر — يتيح لمحادثة Claude (في الصفحة الرئيسية) الوصول إلى:
     • بيانات المستخدم التي تحفظها القوارئ في هذا المتصفح (تظليل، إشارات، ملاحظات، مواضع التوقف)
     • نصوص الكتب نفسها، مع البحث فيها وقراءة فقرات بأرقامها (pid) كما تظهر في القارئ.
   قراءة فقط: لا شيء هنا يكتب في بيانات القوارئ أو يعدّلها.

   دوال الترقيم أدناه (بين علامتي NUMBERING) منسوخة حرفياً من قوالب القوارئ،
   وهي متطابقة بايتاً ببايت في القوارئ العشرة، فيتطابق رقم الفقرة هنا مع ما يعرضه القارئ.
   لا تعدّلها يدوياً؛ إن تغيّر ترقيم الفقرات في القوارئ فانسخ الدوال الجديدة كما هي.
   ============================================================ */
(function(root){

var CFG = { readers: [], storage: null, fetchText: null, onStatus: null, budgetChars: 90e6 };
function configure(o){ for(var k in o) CFG[k] = o[k]; }
function ls(k){ try{ return (CFG.storage || root.localStorage).getItem(k); }catch(e){ return null; } }
function status(t){ try{ if(CFG.onStatus) CFG.onStatus(t); }catch(e){} }

/* NUMBERING:BEGIN — منسوخ حرفياً من القوارئ */
function extractSections(content){
  const lines = content.split('\n');
  const sections = [];
  for(let li=0; li<lines.length; li++){
    if(/^=+$/.test(lines[li].trim()) && lines[li+1] && lines[li+1].trim() && lines[li+2] && /^=+$/.test(lines[li+2].trim())){
      const title = lines[li+1].trim();
      if(title.length < 80) sections.push({title, lineIdx: li});
    }
  }
  return sections;
}
function paragraphStartLines(lines, sections){
  const skip = new Set();
  (sections||[]).forEach(s=>{ skip.add(s.lineIdx); skip.add(s.lineIdx+1); skip.add(s.lineIdx+2); });
  const starts = [];
  let atStart = true;
  let curLen = 0; // طول الفقرة الحالية منذ آخر بداية — يفرض حد 600 حرف تلقائياً حتى بلا سطر فارغ، لضمان الكتب المضافة مستقبلاً بلا تجهيز يدوي
  for(let li=0; li<lines.length; li++){
    if(skip.has(li) || lines[li].trim() === ''){ atStart = true; curLen = 0; continue; }
    if(atStart || curLen > 600){ starts.push(li); atStart = false; curLen = 0; }
    curLen += lines[li].length + 1;
  }
  return starts;
}
function splitParagraphOffsets(content){
  // معرّف فقرة ثابت: تقسيم عند كل سطرين فارغين متتاليين أو أكثر (\n{2,})، ثم
  // أي فقرة ناتجة أطول من 600 حرف تُقسم تكرارياً عند أقرب مسافة لمنتصفها —
  // يضمن التزام الكتب المضافة مستقبلاً بلا تجهيز يدوي. نفس منهج قارئ another_heraclius.
  const re = /\n{2,}/g;
  const rawStarts = [0];
  let m;
  while((m = re.exec(content))) rawStarts.push(m.index + m[0].length);
  // نتحقق أن المقطع من كل حد وحتى الحد التالي (لا حتى نهاية الكتاب كله) يحوي
  // نصاً حقيقياً؛ الفحص القديم (بقية النص كله) كان يمرّر أي حد تقريباً بلا
  // استثناء، فبقايا فاصل صفحة مُزال (سطر مسافات وحيد بين فقرتين حقيقيتين
  // مثلاً) كانت تُرقَّم كفقرة مستقلة فارغة تماماً رغم خلوّها من أي محتوى.
  const bounds = [];
  for(let i=0; i<rawStarts.length; i++){
    const s = rawStarts[i];
    const segEnd = (i+1<rawStarts.length) ? rawStarts[i+1] : content.length;
    if(s < content.length && content.slice(s, segEnd).trim().length) bounds.push(s);
  }
  const PLIMIT = 600;
  function splitLongRange(lo, hi){
    if(hi - lo <= PLIMIT) return [lo];
    const mid = Math.floor((lo+hi)/2);
    let left = content.lastIndexOf(' ', mid), right = content.indexOf(' ', mid);
    if(left <= lo) left = -1;
    if(right === -1 || right >= hi) right = -1;
    let c;
    if(left === -1 && right === -1) c = mid;
    else if(left === -1) c = right + 1;
    else if(right === -1) c = left + 1;
    else c = (mid - left) <= (right - mid) ? left + 1 : right + 1;
    if(c <= lo || c >= hi) c = mid;
    return splitLongRange(lo, c).concat(splitLongRange(c, hi));
  }
  const paras = [];
  for(let i=0; i<bounds.length; i++){
    const lo = bounds[i], hi = (i+1<bounds.length ? bounds[i+1] : content.length);
    paras.push(...splitLongRange(lo, hi));
  }
  return paras;
}
function detectInlinePageMarkers(content){
  const re = /\(p\.\s?([ivxlcdm]+|\d+)\)/gi;
  const items = []; let m;
  while((m = re.exec(content)) !== null){
    const isNum = /^\d+$/.test(m[1]);
    items.push({start:m.index, end:m.index+m[0].length, page: isNum?parseInt(m[1],10):null});
  }
  return items;
}
function detectIsolatedPageMarkers(content){
  const items = [];
  const lines = content.split('\n');
  let idx = 0;
  for(const line of lines){
    const t = line.trim();
    if(/^\d{1,4}$/.test(t)) items.push({start:idx, end:idx+line.length, page:parseInt(t,10)});
    idx += line.length + 1;
  }
  return items;
}
function longestIncreasingSubsequenceIndices(items){
  const withPage = items.map((it,i)=>({i,page:it.page})).filter(x=>x.page!==null);
  const n = withPage.length; if(n===0) return [];
  const tails = [], prev = new Array(n).fill(-1);
  for(let k=0;k<n;k++){
    const p = withPage[k].page;
    let lo=0, hi=tails.length;
    while(lo<hi){ const mid=(lo+hi)>>1; if(withPage[tails[mid]].page < p) lo=mid+1; else hi=mid; }
    if(lo>0) prev[k] = tails[lo-1];
    if(lo===tails.length) tails.push(k); else tails[lo]=k;
  }
  const chain = []; let k = tails[tails.length-1];
  while(k !== -1){ chain.push(withPage[k].i); k = prev[k]; }
  chain.reverse();
  return chain; // فهارس ضمن items الأصلية
}
function buildAnchorsFromItems(content, items){
  const lisIdx = new Set(longestIncreasingSubsequenceIndices(items));
  const sorted = items.map((it,i)=>({...it, origIdx:i})).sort((a,b)=>a.start-b.start);
  let display = '', cursor = 0, removed = 0;
  const shiftedStart = new Array(items.length);
  for(const it of sorted){
    display += content.slice(cursor, it.start);
    shiftedStart[it.origIdx] = it.start - removed;
    removed += it.end - it.start;
    cursor = it.end;
  }
  display += content.slice(cursor);
  const anchors = items
    .map((it,i)=> lisIdx.has(i) ? {page:it.page, offset:shiftedStart[i]} : null)
    .filter(Boolean);
  return {display, anchors};
}
function isReliablePageSequence(anchors, contentLength){
  // ملاحظة: anchors هنا مضمونة تصاعدية صارماً بالفعل (ناتجة عن LIS)
  if(!anchors || anchors.length < 6) return false;
  const pageSpan = anchors[anchors.length-1].page - anchors[0].page;
  if(pageSpan <= 0) return false;
  const offSpan = anchors[anchors.length-1].offset - anchors[0].offset;
  const charsPerPage = offSpan / pageSpan;
  if(charsPerPage < 300 || charsPerPage > 9000) return false; // كثافة معقولة لصفحة مطبوعة فعلية
  if(offSpan < contentLength * 0.5) return false; // يجب أن تغطي المراسي نصف النص الفعلي على الأقل، وإلا فهي جزئية جداً لتُعتمَد
  return true;
}
/* NUMBERING:END */

/* مطابق لمنطق getPageMap(book).displayContent في القوارئ (طبقة التقريب/المعايرة لا تغيّر النص المعروض) */
function displayContentOf(content){
  var inl = buildAnchorsFromItems(content, detectInlinePageMarkers(content));
  if(isReliablePageSequence(inl.anchors, content.length)) return inl.display;
  var iso = buildAnchorsFromItems(content, detectIsolatedPageMarkers(content));
  if(isReliablePageSequence(iso.anchors, content.length)) return iso.display;
  return content;
}

/* ---------- أدوات ---------- */
function norm(s){
  return String(s == null ? '' : s).normalize('NFD')
    .replace(/[̀-ًͯ-ٰٟـ]/g, '')
    .replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .toLowerCase().replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function cut(s, n){ s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }
function clampInt(v, lo, hi, dflt){ v = parseInt(v, 10); if(!isFinite(v)) return dflt; return Math.max(lo, Math.min(hi, v)); }
function dayOf(ts){ if(!ts) return ''; try{ return new Date(ts).toISOString().slice(0, 10); }catch(e){ return ''; } }
function countOcc(hay, needle, cap){ var c = 0, i = 0; while(c < cap && (i = hay.indexOf(needle, i)) !== -1){ c++; i += needle.length; } return c; }
function allReaders(){ return CFG.readers || []; }
function readerIds(){ return allReaders().map(function(r){ return r.id; }); }

function findReader(q){
  q = String(q == null ? '' : q).trim();
  if(!q) return [];
  var rs = allReaders();
  var ex = rs.filter(function(r){ return r.id === q; });
  if(ex.length) return ex;
  var nq = norm(q);
  if(!nq) return [];
  return rs.filter(function(r){ return norm(r.title + ' ' + (r.sub || '') + ' ' + (r.desc || '')).indexOf(nq) >= 0; });
}
function bookMatches(b, q){
  q = String(q == null ? '' : q).trim();
  if(!q) return true;
  if(b.id === q) return true;
  var nq = norm(q);
  return !!nq && norm(b.title + ' ' + (b.author || '')).indexOf(nq) >= 0;
}
function matchRef(bookId, title, q){
  q = String(q == null ? '' : q).trim();
  if(!q) return true;
  if(bookId === q) return true;
  var nq = norm(q);
  return !!nq && norm(title || '').indexOf(nq) >= 0;
}
function resolveBook(lib, q){
  var ex = lib.books.filter(function(b){ return b.id === q; });
  if(ex.length) return ex;
  return lib.books.filter(function(b){ return bookMatches(b, q); });
}

/* ---------- بيانات المستخدم (localStorage) ---------- */
function userOf(r){
  var raw = ls(r.key);
  if(!raw) return null;
  try{ var d = JSON.parse(raw); return (d && d._type === 'my-reader-userdata') ? d : null; }catch(e){ return null; }
}

/* ---------- تحميل نصوص القوارئ (عند الطلب فقط) ---------- */
var loadCache = {}, pending = {};
function defaultFetchText(url){
  return fetch(url, { cache: 'default' }).then(function(res){
    if(!res.ok) throw new Error('تعذّر تحميل الملف (' + res.status + ')');
    return res.text();
  });
}
function evict(keepId){
  var total = 0, ids = Object.keys(loadCache);
  ids.forEach(function(id){ total += loadCache[id].chars; });
  while(total > CFG.budgetChars){
    var victim = null;
    Object.keys(loadCache).forEach(function(id){ if(id !== keepId && (!victim || loadCache[id].used < loadCache[victim].used)) victim = id; });
    if(!victim) break;
    total -= loadCache[victim].chars; delete loadCache[victim];
  }
}
async function loadReader(r){
  var c = loadCache[r.id];
  if(c){ c.used = Date.now(); return c; }
  if(!pending[r.id]){
    pending[r.id] = (async function(){
      status('جارٍ تحميل «' + r.title + '»…');
      var html = await (CFG.fetchText ? CFG.fetchText(r.file) : defaultFetchText(r.file));
      var tag = 'id="library-data">';
      var a = html.indexOf(tag);
      if(a < 0) throw new Error('لم أجد مكتبة النصوص داخل ملف «' + r.title + '»');
      a += tag.length;
      var z = html.indexOf('</script>', a);
      var books = JSON.parse(html.slice(a, z));
      html = null;
      var chars = 0;
      books.forEach(function(b){ b.content = b.content || ''; chars += b.content.length; });
      var rec = { books: books, chars: chars, used: Date.now() };
      loadCache[r.id] = rec;
      evict(r.id);
      status('');
      return rec;
    })();
  }
  try{ return await pending[r.id]; } finally { delete pending[r.id]; }
}

/* ---------- الفقرات بترقيم القارئ نفسه (pid يبدأ من 1) ---------- */
function paras(b){
  if(b._p) return b._p;
  var content = b.content || '', sections = extractSections(content), out = [], k;
  if(sections.length){
    var lines = content.split('\n');
    var starts = paragraphStartLines(lines, sections);
    var skip = {};
    sections.forEach(function(s){ skip[s.lineIdx] = 1; skip[s.lineIdx + 1] = 1; skip[s.lineIdx + 2] = 1; });
    var lineOff = new Array(lines.length + 1), o = 0, i;
    for(i = 0; i < lines.length; i++){ lineOff[i] = o; o += lines[i].length + 1; }
    lineOff[lines.length] = content.length;
    var si = 0;
    for(k = 0; k < starts.length; k++){
      var a = starts[k], z = (k + 1 < starts.length) ? starts[k + 1] : lines.length, parts = [];
      for(i = a; i < z; i++) if(!skip[i]) parts.push(lines[i]);
      while(si + 1 < sections.length && sections[si + 1].lineIdx <= a) si++;
      out.push({ pid: k + 1, text: parts.join('\n').trim(), off: lineOff[a], section: (sections[si] && sections[si].lineIdx <= a) ? sections[si].title : '' });
    }
    b._len = content.length;
  }else{
    var disp = displayContentOf(content), offs = splitParagraphOffsets(disp);
    for(k = 0; k < offs.length; k++){
      out.push({ pid: k + 1, text: disp.slice(offs[k], (k + 1 < offs.length) ? offs[k + 1] : disp.length).trim(), off: offs[k], section: '' });
    }
    b._len = disp.length;
  }
  b._p = out;
  return out;
}
function approxPid(b, ratio){
  var P = paras(b);
  if(!P.length || !(ratio >= 0)) return null;
  var target = ratio * (b._len || 0), lo = 0, hi = P.length - 1;
  while(lo < hi){ var mid = (lo + hi + 1) >> 1; if(P[mid].off <= target) lo = mid; else hi = mid - 1; }
  return P[lo].pid;
}

/* ---------- الأدوات ---------- */
async function listLibrary(a){
  if(!a.reader){
    return { readers: allReaders().filter(function(r){ return r.texts !== 0; }).map(function(r){
      var d = userOf(r) || {}, bms = d.bookmarks || [], rs = d.readStatus || {};
      return {
        id: r.id, title: r.title, english: r.sub, about: r.desc, books_listed: r.texts,
        my_highlights: bms.filter(function(b){ return b.color; }).length,
        my_bookmarks: bms.filter(function(b){ return !b.color; }).length,
        my_notes: (d.notes || []).length,
        my_books_marked_read: Object.keys(rs).filter(function(k){ return rs[k]; }).length,
        my_saved_positions: Object.keys(d.readingPosition || {}).length
      };
    }) };
  }
  var rs = findReader(a.reader);
  if(rs.length !== 1) return { error: rs.length ? 'عدة قوارئ تطابق — حدّد المعرّف' : 'لا قارئ بهذا المعرّف', reader_ids: readerIds() };
  var r = rs[0], lib = await loadReader(r), d = userOf(r) || {};
  var hl = {}, bm = {}, nt = {};
  (d.bookmarks || []).forEach(function(x){ (x.color ? hl : bm)[x.bookId] = ((x.color ? hl : bm)[x.bookId] || 0) + 1; });
  (d.notes || []).forEach(function(x){ nt[x.bookId] = (nt[x.bookId] || 0) + 1; });
  return { reader: r.id, reader_title: r.title, books: lib.books.map(function(b){
    var o = { book_id: b.id, title: cut(b.title, 90), paragraphs: paras(b).length };
    if(b.author) o.author = cut(b.author, 40);
    if(b.isPD === false) o.full_text = false;
    if(hl[b.id]) o.my_highlights = hl[b.id];
    if(bm[b.id]) o.my_bookmarks = bm[b.id];
    if(nt[b.id]) o.my_notes = nt[b.id];
    return o;
  }) };
}

function lastRead(){
  var out = null;
  try{
    var det = JSON.parse(ls('readers_last_detail') || 'null'), base = det && det.file ? String(det.file).split('/').pop() : '';
    var r = allReaders().filter(function(x){ return String(x.file).split('/').pop() === base; })[0];
    if(r) out = { reader: r.id, reader_title: r.title, book: det.title || '', pid: det.pid == null ? null : det.pid, date: dayOf(det.ts) };
  }catch(e){}
  return out;
}

async function positionsOf(rs, a, limit){
  var items = [];
  for(var ri = 0; ri < rs.length; ri++){
    var r = rs[ri], d = userOf(r);
    if(!d || !d.readingPosition) continue;
    var ids = Object.keys(d.readingPosition);
    if(!ids.length) continue;
    var lib = await loadReader(r), byId = {};
    lib.books.forEach(function(b){ byId[b.id] = b; });
    ids.forEach(function(id){
      var pos = d.readingPosition[id] || {}, b = byId[id], title = b ? b.title : '';
      if(a.book && !matchRef(id, title, a.book)) return;
      var ts = Math.max(pos.ts || 0, pos.pidTs || 0);
      items.push({ ts: ts, item: {
        reader: r.id, reader_title: r.title, book_id: id, book: title || undefined,
        mode: pos.activeMode || 'page',
        saved_pid: pos.pid == null ? undefined : pos.pid,
        saved_pid_snippet: pos.pidSnip ? cut(pos.pidSnip, 160) : undefined,
        page: pos.page == null ? undefined : pos.page,
        ratio_percent: typeof pos.ratio === 'number' ? Math.round(pos.ratio * 1000) / 10 : undefined,
        approx_pid: (b && typeof pos.ratio === 'number') ? approxPid(b, pos.ratio) : undefined,
        marked_read: !!(d.readStatus && d.readStatus[id]),
        last_activity: dayOf(ts)
      } });
    });
  }
  items.sort(function(x, y){ return y.ts - x.ts; });
  return { kind: 'positions', last_opened: lastRead(), total: items.length, items: items.slice(0, limit).map(function(x){ return x.item; }),
    note: 'mode=pid يعني أن المستخدم حفظ فقرة بعينها (saved_pid دقيق). mode=page يعني موضع تمرير تلقائي: ratio_percent وpage ثم approx_pid تقريبي.' };
}

async function getUserData(a){
  var kind = a.kind || 'summary';
  var rs = a.reader ? findReader(a.reader) : allReaders();
  if(a.reader && !rs.length) return { error: 'لا قارئ بهذا المعرّف', reader_ids: readerIds() };
  var limit = clampInt(a.limit, 1, a.export ? 500 : 60, 25);
  if(kind === 'summary'){
    var l = await listLibrary({});
    return { kind: 'summary', last_opened: lastRead(), readers: l.readers.filter(function(x){ return !a.reader || rs.some(function(r){ return r.id === x.id; }); }) };
  }
  if(kind === 'positions') return await positionsOf(rs, a, limit);
  var q = a.query ? norm(a.query) : '', colorQ = a.color ? String(a.color).toLowerCase() : '', items = [];
  rs.forEach(function(r){
    var d = userOf(r);
    if(!d) return;
    if(kind === 'highlights' || kind === 'bookmarks'){
      (d.bookmarks || []).forEach(function(bm){
        if((kind === 'highlights') !== !!bm.color) return;
        if(a.book && !matchRef(bm.bookId, bm.title, a.book)) return;
        if(colorQ && String(bm.color || '').toLowerCase() !== colorQ) return;
        if(q && norm((bm.snip || '') + ' ' + (bm.note || '')).indexOf(q) < 0) return;
        items.push({ ts: bm.ts || 0, item: {
          reader: r.id, reader_title: r.title, book_id: bm.bookId, book: bm.title,
          pid: bm.pid == null ? null : bm.pid, color: bm.color || undefined,
          text: cut(bm.snip, 500), note: bm.note ? cut(bm.note, 1200) : undefined, date: dayOf(bm.ts)
        } });
      });
    }else if(kind === 'notes'){
      (d.notes || []).forEach(function(n){
        if(a.book && !matchRef(n.bookId, n.book, a.book)) return;
        if(q && norm((n.text || '') + ' ' + (n.snip || '')).indexOf(q) < 0) return;
        items.push({ ts: n.ts || 0, item: {
          reader: r.id, reader_title: r.title, book_id: n.bookId, book: n.book,
          pid: n.pid == null ? null : n.pid, note: cut(n.text, 1500), about_text: cut(n.snip, 200), date: dayOf(n.ts)
        } });
      });
    }
  });
  items.sort(function(x, y){ return y.ts - x.ts; });
  return { kind: kind, total: items.length, items: items.slice(0, limit).map(function(x){ return x.item; }) };
}

function snippetOf(p, n, stems){
  var t = p.text;
  if(t.length <= 480) return t;
  var pos = -1;
  for(var i = 0; i < stems.length && pos < 0; i++) pos = n.indexOf(stems[i]);
  if(pos < 0) pos = 0;
  var center = Math.floor(pos / Math.max(1, n.length) * t.length);
  var s = Math.max(0, center - 200), e = Math.min(t.length, center + 280);
  if(s > 0){ var sp = t.indexOf(' ', s); if(sp > 0 && sp < s + 40) s = sp + 1; }
  if(e < t.length){ var sp2 = t.lastIndexOf(' ', e); if(sp2 > e - 40) e = sp2; }
  return (s > 0 ? '…' : '') + t.slice(s, e) + (e < t.length ? '…' : '');
}

async function searchTexts(a){
  var terms = norm(a.query).split(' ').filter(Boolean);
  if(!terms.length) return { error: 'query فارغ أو لا يحوي حروفاً' };
  var stems = terms.map(function(t){ return (t.length > 4 && t.indexOf('ال') === 0) ? t.slice(2) : t; });
  var phrase = terms.join(' ');
  var mode = (a.mode === 'phrase' || a.mode === 'any') ? a.mode : 'all_words';
  if(mode === 'phrase' && terms.length === 1) mode = 'all_words';
  var limit = clampInt(a.limit, 1, 30, 10);
  var rs;
  if(!a.reader || a.reader === 'all') rs = allReaders().filter(function(r){ return r.texts !== 0; });
  else{ rs = findReader(a.reader); if(!rs.length) return { error: 'لا قارئ بهذا المعرّف', reader_ids: readerIds() }; }
  var hits = [], perBook = {}, scanned = 0;
  for(var ri = 0; ri < rs.length; ri++){
    var r = rs[ri], lib = await loadReader(r);
    for(var bi = 0; bi < lib.books.length; bi++){
      var b = lib.books[bi];
      if(a.book && !bookMatches(b, a.book)) continue;
      var P = paras(b);
      if(!b._n) b._n = P.map(function(p){ return norm(p.text); });
      scanned++;
      for(var i = 0; i < P.length; i++){
        var n = b._n[i];
        if(!n) continue;
        var score = 0, c, t;
        if(mode === 'phrase'){
          c = countOcc(n, phrase, 5);
          if(!c) continue;
          score = 10 + c * 2;
        }else{
          var matched = 0;
          for(t = 0; t < stems.length; t++){ c = countOcc(n, stems[t], 5); if(c){ matched++; score += c; } }
          if(mode === 'all_words' ? matched < stems.length : matched === 0) continue;
          score += matched / stems.length * 10;
          if(terms.length > 1 && n.indexOf(phrase) !== -1) score += 8;
        }
        hits.push({ r: r, b: b, i: i, score: score });
        var key = r.id + '|' + b.id;
        if(!perBook[key]) perBook[key] = { reader: r.id, book_id: b.id, book: b.title, hits: 0 };
        perBook[key].hits++;
      }
    }
  }
  hits.sort(function(x, y){ return y.score - x.score || x.b._p[x.i].text.length - y.b._p[y.i].text.length; });
  var results = hits.slice(0, limit).map(function(h){
    var p = h.b._p[h.i];
    return { reader: h.r.id, reader_title: h.r.title, book_id: h.b.id, book: h.b.title, pid: p.pid,
      section: p.section || undefined, text: a.full ? p.text : snippetOf(p, h.b._n[h.i], stems) };
  });
  return { query: a.query, mode: mode, books_scanned: scanned, total_hits: hits.length,
    hits_by_book: Object.keys(perBook).map(function(k){ return perBook[k]; }).sort(function(x, y){ return y.hits - x.hits; }).slice(0, 12),
    results: results };
}

async function readPassage(a){
  var rs = findReader(a.reader);
  if(rs.length !== 1) return { error: rs.length ? 'عدة قوارئ تطابق — حدّد المعرّف' : 'حدّد reader بمعرّف قارئ صحيح', reader_ids: readerIds() };
  var lib = await loadReader(rs[0]), bs = resolveBook(lib, a.book);
  if(bs.length !== 1){
    return { error: bs.length ? 'عدة كتب تطابق — استخدم book_id' : 'لا كتاب بهذا الاسم في هذا القارئ',
      candidates: (bs.length ? bs : lib.books).slice(0, 15).map(function(b){ return { book_id: b.id, title: b.title }; }) };
  }
  var b = bs[0], P = paras(b), N = P.length, from, to;
  if(a.around_pid != null){
    var ctx = clampInt(a.context, 0, 8, 2), ap = clampInt(a.around_pid, 1, Math.max(1, N), 1);
    from = ap - ctx; to = ap + ctx;
  }else{
    from = clampInt(a.from_pid, 1, Math.max(1, N), 1);
    to = a.to_pid != null ? clampInt(a.to_pid, from, N, from) : from + 4;
  }
  from = Math.max(1, from); to = Math.min(N, to);
  if(from > N) return { error: 'رقم الفقرة خارج النطاق', total_paragraphs: N };
  var out = [], used = 0, pid;
  for(pid = from; pid <= to && out.length < 30; pid++){
    var p = P[pid - 1];
    if(used + p.text.length > 9000 && out.length){ break; }
    out.push({ pid: p.pid, section: p.section || undefined, text: p.text });
    used += p.text.length;
  }
  var last = out.length ? out[out.length - 1].pid : from - 1;
  return { reader: rs[0].id, book_id: b.id, book: b.title, author: b.author, total_paragraphs: N,
    from_pid: from, to_pid: last, next_pid: last < N ? last + 1 : null, paragraphs: out };
}


/* ---------- تصدير سياق كنص واحد يُلصق في تطبيق Claude (بلا API) ---------- */
function exportHeader(){
  return [
    '# سياق من موقعي «القوارئ العشر»',
    'هذه بيانات قراءتي وبحثي من مكتبتي، منسوخة من الموقع. «pid» هو رقم الفقرة كما يظهر في القارئ.',
    'اعتمد عليها وحدها فيما تنقله عن المصادر، ولا تخترع اقتباساً أو رقم فقرة غير مذكور هنا، وإن كان ما أحتاجه غير موجود فقل ذلك.',
    'النصوص الأصلية في المكتبة إنجليزية ويونانية ولاتينية وفرنسية في معظمها؛ اشرح لي بالعربية مع إبقاء المصطلحات الفنية بين قوسين.'
  ].join('\n');
}
function loc(it){
  var parts = [it.reader_title, it.book].filter(Boolean);
  if(it.pid != null) parts.push('فقرة ' + it.pid);
  return parts.join(' › ');
}
function oneLine(s){ return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

async function exportText(o){
  o = o || {};
  var kinds = o.kinds || { highlights: true, notes: true };
  var maxChars = clampInt(o.maxChars, 4000, 120000, 45000);
  var reader = o.reader && o.reader !== 'all' ? o.reader : undefined;
  var filter = o.filter ? String(o.filter) : undefined;
  var question = o.question ? String(o.question).trim() : '';
  var sections = [];   // {title, lines:[...], total}
  var counts = {};

  function userSec(kind, title, fmt){
    return getUserData({ kind: kind, reader: reader, query: filter, limit: 500, export: true }).then(function(r){
      if(r.error) throw new Error(r.error);
      counts[kind] = r.total;
      if(r.total) sections.push({ title: title + ' (' + r.total + ')', lines: r.items.map(fmt), total: r.total });
    });
  }
  if(kinds.highlights) await userSec('highlights', 'تظليلي', function(it){
    return '- [' + loc(it) + (it.date ? ' · ' + it.date : '') + '] «' + oneLine(it.text) + '»' + (it.note ? '\n  ↳ ملاحظتي: ' + oneLine(it.note) : '');
  });
  if(kinds.notes) await userSec('notes', 'ملاحظاتي', function(it){
    return '- [' + loc(it) + (it.date ? ' · ' + it.date : '') + '] ' + oneLine(it.note) + (it.about_text ? '\n  ↳ عن: «' + oneLine(it.about_text) + '»' : '');
  });
  if(kinds.bookmarks) await userSec('bookmarks', 'إشاراتي', function(it){
    return '- [' + loc(it) + (it.date ? ' · ' + it.date : '') + '] «' + oneLine(it.text) + '»' + (it.note ? '\n  ↳ ملاحظتي: ' + oneLine(it.note) : '');
  });
  if(kinds.positions){
    var pr = await getUserData({ kind: 'positions', reader: reader, limit: 500, export: true });
    if(pr.error) throw new Error(pr.error);
    counts.positions = pr.total;
    var plines = [];
    if(pr.last_opened) plines.push('- آخر ما فتحته: ' + [pr.last_opened.reader_title, pr.last_opened.book, pr.last_opened.pid != null ? 'فقرة ' + pr.last_opened.pid : ''].filter(Boolean).join(' › ') + (pr.last_opened.date ? ' · ' + pr.last_opened.date : ''));
    pr.items.forEach(function(it){
      var where = it.mode === 'pid' && it.saved_pid != null
        ? 'فقرة محفوظة ' + it.saved_pid + (it.saved_pid_snippet ? ' («' + oneLine(it.saved_pid_snippet) + '»)' : '')
        : 'موضع تقريبي' + (it.approx_pid != null ? ' (فقرة ~' + it.approx_pid + ')' : '') + (it.ratio_percent != null ? ' ' + it.ratio_percent + '%' : '') + (it.page != null ? ' صفحة ' + it.page : '');
      plines.push('- ' + [it.reader_title, it.book || it.book_id].filter(Boolean).join(' › ') + ': ' + where + (it.last_activity ? ' · آخر نشاط ' + it.last_activity : '') + (it.marked_read ? ' · تمت قراءته' : ''));
    });
    if(plines.length) sections.push({ title: 'مواضع توقفي (' + pr.total + ')', lines: plines, total: plines.length });
  }
  var sq = o.search && o.search.query ? o.search : null;
  if(sq){
    var sr = await searchTexts({ query: sq.query, mode: sq.mode, reader: reader || 'all', book: sq.book, limit: clampInt(sq.limit, 1, 30, 10), full: true });
    if(sr.error) throw new Error(sr.error);
    counts.search = sr.total_hits;
    if(sr.results.length){
      sections.push({ title: 'نتائج البحث في النصوص عن «' + oneLine(sq.query) + '» (' + sr.total_hits + ' فقرة، المعروض ' + sr.results.length + ')',
        lines: sr.results.map(function(x){ return '### ' + loc(x) + (x.section ? ' — ' + x.section : '') + '\n' + oneLine(x.text); }), total: sr.total_hits });
    }
  }

  var head = exportHeader();
  var tail = question ? '\n\n## سؤالي\n' + question : '';
  var rem = maxChars - head.length - tail.length - 200;
  var out = [head], truncated = false;
  if(!sections.length) out.push('\n(لم يُعثر على بيانات مطابقة لما اخترته.)');
  sections.forEach(function(sec, i){
    var cap = Math.max(300, Math.floor(rem / (sections.length - i))), used = 0, kept = [];
    for(var k = 0; k < sec.lines.length; k++){
      var L = sec.lines[k].length + 1;
      if(used + L > cap && kept.length){ break; }
      kept.push(sec.lines[k]); used += L;
    }
    var omitted = sec.lines.length - kept.length;
    if(omitted > 0){ truncated = true; kept.push('(… ' + omitted + ' عنصراً إضافياً لم يُدرج لطول النص؛ ضيّق الاختيار بالقارئ أو بكلمة فلترة.)'); }
    rem -= used;
    out.push('\n## ' + sec.title + '\n' + kept.join('\n'));
  });
  var text = out.join('\n') + tail;
  return { text: text, counts: counts, truncated: truncated, chars: text.length };
}

/* ---------- تعريف الأدوات لواجهة Anthropic ---------- */
var TOOLS = [
  { name: 'list_library',
    description: "Without arguments: list the ten readers (id, title, number of books, and counts of the user's own highlights, bookmarks, notes and saved positions). With `reader`: list that reader's books (book_id, title, author, category, paragraph count, and the user's own highlight/note counts per book). Call this first to learn reader ids and book ids.",
    input_schema: { type: 'object', properties: { reader: { type: 'string', description: 'Reader id such as philo or origen. Omit to list all readers.' } }, required: [] } },
  { name: 'get_user_data',
    description: "Read the user's own annotations stored by the readers on this device. kind=summary: counts per reader. kind=highlights: bookmarks that have a color, i.e. passages the user highlighted. kind=bookmarks: plain bookmarks without color. kind=notes: the user's free-text notes. kind=positions: where the user stopped reading in each book (mode=pid with saved_pid is an explicit paragraph bookmark; mode=page gives page, ratio_percent and an approximate approx_pid). Items carry pid (paragraph number as shown in the reader), book, text and note. Newest first.",
    input_schema: { type: 'object', properties: {
      kind: { type: 'string', enum: ['summary', 'highlights', 'bookmarks', 'notes', 'positions'] },
      reader: { type: 'string', description: 'Reader id filter.' },
      book: { type: 'string', description: 'Book id or a fragment of the title.' },
      query: { type: 'string', description: "Keep only items whose text or note contains this (diacritics-insensitive)." },
      color: { type: 'string', description: 'Highlight color filter (highlights only).' },
      limit: { type: 'integer', description: 'Max items, default 25, max 60.' } }, required: ['kind'] } },
  { name: 'search_texts',
    description: "Full-text search across the texts of the library. The texts are overwhelmingly English, Greek, Latin and French translations/editions and contain almost no Arabic, so TRANSLATE the user's Arabic terms into the language of the text (usually English; Greek in Greek letters) before searching. Matching ignores Arabic diacritics and hamza/alef forms and Latin/Greek accents, and works on word fragments (a stem like 'زوج' also finds 'الزوجة'). mode=all_words (default): every word in the same paragraph; any: at least one word; phrase: the exact phrase. Scope with `reader` (id) and/or `book` (id or title fragment); without a reader every reader is searched, which downloads the texts on first use and can take a while. Returns paragraphs with pid (the paragraph number shown in the reader), book and a snippet, plus hit counts per book. Texts include OCR noise, so retry with variant spellings or other languages before concluding something is absent.",
    input_schema: { type: 'object', properties: {
      query: { type: 'string' },
      mode: { type: 'string', enum: ['all_words', 'any', 'phrase'] },
      reader: { type: 'string', description: 'Reader id; omit or "all" for all readers.' },
      book: { type: 'string', description: 'Book id or a fragment of the title.' },
      limit: { type: 'integer', description: 'Max results, default 10, max 30.' } }, required: ['query'] } },
  { name: 'read_passage',
    description: "Read consecutive paragraphs of one book by pid (paragraph numbers exactly as shown in the reader). Use from_pid/to_pid, or around_pid with context. Requires `reader` (id) and `book` (id or a unique fragment of the title). Returns at most about 9000 characters per call and next_pid when more remains.",
    input_schema: { type: 'object', properties: {
      reader: { type: 'string' }, book: { type: 'string' },
      from_pid: { type: 'integer' }, to_pid: { type: 'integer' },
      around_pid: { type: 'integer' }, context: { type: 'integer', description: 'Paragraphs on each side of around_pid, default 2, max 8.' } },
      required: ['reader', 'book'] } }
];

function fit(obj, max){
  max = max || 14000;
  var s = JSON.stringify(obj);
  if(s.length <= max) return s;
  var keys = ['results', 'items', 'paragraphs', 'books', 'readers'], key = null;
  keys.forEach(function(k){ if(!key && Array.isArray(obj[k])) key = k; });
  if(!key) return s.slice(0, max);
  var total = obj[key].length;
  while(obj[key].length > 1 && JSON.stringify(obj).length > max) obj[key].pop();
  obj.truncated = true; obj.shown = obj[key].length; obj.available = total;
  return JSON.stringify(obj);
}
async function execTool(name, input){
  input = input || {};
  try{
    var out;
    if(name === 'list_library') out = await listLibrary(input);
    else if(name === 'get_user_data') out = await getUserData(input);
    else if(name === 'search_texts') out = await searchTexts(input);
    else if(name === 'read_passage') out = await readPassage(input);
    else out = { error: 'أداة غير معروفة: ' + name };
    return fit(out, name === 'list_library' ? 24000 : 14000);
  }catch(e){
    return JSON.stringify({ error: String(e && e.message || e) });
  }
}
function clearCache(){ loadCache = {}; }

root.ReaderBridge = {
  configure: configure, tools: function(){ return TOOLS; }, execTool: execTool, clearCache: clearCache, exportText: exportText,
  _t: { norm: norm, paras: paras, loadReader: loadReader, findReader: findReader, displayContentOf: displayContentOf,
        extractSections: extractSections, paragraphStartLines: paragraphStartLines, splitParagraphOffsets: splitParagraphOffsets,
        searchTexts: searchTexts, readPassage: readPassage, getUserData: getUserData, listLibrary: listLibrary }
};
})(typeof window !== 'undefined' ? window : globalThis);
