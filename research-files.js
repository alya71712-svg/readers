/* ملفات البحث المشتركة بين صفحات القرّاء. تخزين محلي على هذا المتصفح؛ يمكن تصدير نسخة JSON احتياطية. */
(function (global) {
  'use strict';

  const KEY = 'readerResearchFiles.v1';
  const MAX_QUOTE = 6000;
  const MAX_NOTE = 5000;

  function read() {
    try {
      const value = JSON.parse(global.localStorage.getItem(KEY) || 'null');
      if (value && value.version === 1 && Array.isArray(value.files)) return value;
    } catch (_) {}
    return { version: 1, files: [] };
  }

  let localStamp = 0, suppress = 0;
  function write(data) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(data));
      if (!suppress) { localStamp++; scheduleSync(); }
      return true;
    } catch (_) {
      return false;
    }
  }

  function uid(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return prefix + '-' + global.crypto.randomUUID();
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function text(value, limit) {
    return String(value == null ? '' : value).trim().slice(0, limit);
  }

  function listFiles() {
    return read().files.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function getFile(fileId) {
    return read().files.find(file => file.id === fileId) || null;
  }

  function createFile(title) {
    const name = text(title, 120);
    if (!name) return null;
    const data = read();
    const now = Date.now();
    const file = { id: uid('research'), title: name, tts: now, createdAt: now, updatedAt: now, entries: [] };
    data.files.push(file);
    return write(data) ? file : null;
  }

  function renameFile(fileId, title) {
    const name = text(title, 120);
    if (!name) return false;
    const data = read();
    const file = data.files.find(item => item.id === fileId);
    if (!file) return false;
    file.title = name;
    file.tts = Date.now();
    file.updatedAt = Date.now();
    return write(data);
  }

  function deleteFile(fileId) {
    const data = read();
    const next = data.files.filter(file => file.id !== fileId);
    if (next.length === data.files.length) return false;
    data.files = next;
    return write(data);
  }

  function addEntry(fileId, item) {
    const data = read();
    const file = data.files.find(value => value.id === fileId);
    const quote = text(item && item.text, MAX_QUOTE);
    if (!file || !quote) return false;
    file.entries.push({
      id: uid('excerpt'),
      text: quote,
      reader: text(item.reader, 180),
      book: text(item.book, 240),
      author: text(item.author, 180),
      paragraph: text(item.paragraph, 80),
      url: text(item.url, 1000),
      note: text(item.note, MAX_NOTE),
      kind: text(item.kind, 30),
      createdAt: Date.now()
    });
    file.updatedAt = Date.now();
    return write(data);
  }

  function updateEntry(fileId, entryId, patch) {
    const data = read();
    const file = data.files.find(value => value.id === fileId);
    const entry = file && file.entries.find(value => value.id === entryId);
    if (!entry) return false;
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'note')) { entry.note = text(patch.note, MAX_NOTE); entry.nts = Date.now(); }
    file.updatedAt = Date.now();
    return write(data);
  }

  function deleteEntry(fileId, entryId) {
    const data = read();
    const file = data.files.find(value => value.id === fileId);
    if (!file) return false;
    const next = file.entries.filter(entry => entry.id !== entryId);
    if (next.length === file.entries.length) return false;
    file.entries = next;
    file.updatedAt = Date.now();
    return write(data);
  }

  function slug(value) {
    return text(value, 80).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'research';
  }

  function markdown(fileId) {
    const file = getFile(fileId);
    if (!file) return '';
    const lines = [
      '# ' + file.title,
      '',
      '- تاريخ التصدير: ' + new Date().toISOString().slice(0, 10),
      '- عدد المقتطفات: ' + file.entries.length,
      '',
      '## المقتطفات'
    ];
    file.entries.forEach((entry, index) => {
      const source = [entry.author, entry.book, entry.reader, entry.paragraph ? 'الفقرة ' + entry.paragraph : ''].filter(Boolean).join(' — ');
      lines.push('', '### ' + (index + 1) + '. ' + (entry.book || 'مقتطف بلا عنوان مصدر'), '');
      lines.push('> ' + entry.text.replace(/\n/g, '\n> '));
      if (source) lines.push('', '**بيانات المصدر:** ' + source);
      if (entry.url) lines.push('', '**الرابط:** ' + entry.url);
      if (entry.note) lines.push('', '**ملاحظتي:** ' + entry.note);
      lines.push('', '**تاريخ الإضافة:** ' + new Date(entry.createdAt || Date.now()).toISOString().slice(0, 10));
    });
    if (!file.entries.length) lines.push('', 'لا توجد مقتطفات في هذا الملف بعد.');
    lines.push('', '---', '', 'أُنشئ هذا الملف من مساحة البحث في موقع القرّاء العشرة.');
    return lines.join('\n');
  }

  function exportBackup() {
    return JSON.stringify(read(), null, 2);
  }

  function importBackup(raw, replace) {
    let incoming;
    try { incoming = JSON.parse(raw); } catch (_) { return false; }
    if (!incoming || incoming.version !== 1 || !Array.isArray(incoming.files)) return false;
    const normalized = incoming.files.map(file => ({
      id: text(file.id, 120) || uid('research'),
      title: text(file.title, 120) || 'ملف بحث مستورد',
      tts: Number(file.tts) || 0,
      createdAt: Number(file.createdAt) || Date.now(),
      updatedAt: Number(file.updatedAt) || Date.now(),
      entries: Array.isArray(file.entries) ? file.entries.filter(entry => entry && text(entry.text, MAX_QUOTE)).map(entry => ({
        id: text(entry.id, 120) || uid('excerpt'),
        text: text(entry.text, MAX_QUOTE),
        reader: text(entry.reader, 180),
        book: text(entry.book, 240),
        author: text(entry.author, 180),
        paragraph: text(entry.paragraph, 80),
        url: text(entry.url, 1000),
        note: text(entry.note, MAX_NOTE),
        kind: text(entry.kind, 30),
        nts: Number(entry.nts) || 0,
        createdAt: Number(entry.createdAt) || Date.now()
      })) : []
    }));
    return write({ version: 1, files: replace ? normalized : read().files.concat(normalized) });
  }

  /* ================= المزامنة السحابية =================
     نفس رمز المزامنة والجدول المستعملين للتظليل والملاحظات (reader_key = research_files_v1).
     الدمج لا يفقد شيئاً: اتحاد الملفات والمقتطفات من الجهازين، والحذف يُنقل بشواهد حذف (tombstones). */
  const RKEY = 'research_files_v1', CKEY = 'readerResearchFiles.cloud.v1', TOMB_TTL = 180 * 86400000;
  const listeners = [];
  const st = { running: false, pending: false, lastOk: 0, lastError: '' };
  let timer = null;
  function cloud() { return global.ReaderCloud; }
  function status() {
    const c = cloud();
    return { configured: !!(c && c.configured && c.configured()), hasCode: !!(c && c.getCode && c.getCode()), running: st.running, pending: st.pending, lastOk: st.lastOk, lastError: st.lastError };
  }
  function emit() { listeners.slice().forEach(f => { try { f(status()); } catch (_) {} }); }
  function cState() {
    try { const v = JSON.parse(global.localStorage.getItem(CKEY) || 'null'); if (v && v.snap) return v; } catch (_) {}
    return { snap: { f: [], e: [] }, tomb: { f: {}, e: {} } };
  }
  function saveCState(v) { try { global.localStorage.setItem(CKEY, JSON.stringify(v)); } catch (_) {} }
  function mergeTomb(a, b, now) {
    const out = { f: {}, e: {} };
    [a, b].forEach(src => ['f', 'e'].forEach(g => {
      const o = (src && src[g]) || {};
      Object.keys(o).forEach(k => {
        const ts = o[k] || 0;
        if (now - ts > TOMB_TTL) return;
        if (!(k in out[g]) || ts > out[g][k]) out[g][k] = ts;
      });
    }));
    return out;
  }
  const entTs = e => e.nts || e.createdAt || 0;
  function mergeResearch(local, remote, state, now) {
    const snap = state.snap || { f: [], e: [] };
    const lf = (local && local.files) || [];
    const curF = {}, curE = {};
    lf.forEach(f => { curF[f.id] = 1; (f.entries || []).forEach(e => { curE[f.id + '|' + e.id] = 1; }); });
    const goneF = snap.f.filter(id => !curF[id]), goneE = snap.e.filter(k => !curE[k]);
    const snapCount = snap.f.length + snap.e.length, goneCount = goneF.length + goneE.length;
    // صمّام أمان: اختفاء معظم اللقطة دفعة واحدة يُعدّ فقداناً محلياً لا حذفاً
    const suspicious = goneCount > 20 && snapCount && goneCount / snapCount > 0.6;
    const localTomb = { f: {}, e: {} };
    if (!suspicious) { goneF.forEach(id => { localTomb.f[id] = now; }); goneE.forEach(k => { localTomb.e[k] = now; }); }
    const tomb = mergeTomb(mergeTomb(state.tomb, remote && remote.tomb, now), localTomb, now);
    const acc = {}, order = [];
    ((remote && remote.files) || []).concat(lf).forEach(f => {
      if (!f || !f.id || tomb.f[f.id]) return;
      let a = acc[f.id];
      if (!a) { a = acc[f.id] = { id: f.id, title: f.title, tts: f.tts || 0, createdAt: f.createdAt, updatedAt: f.updatedAt || 0, ents: {} }; order.push(f.id); }
      else {
        if ((f.tts || 0) >= a.tts) { a.title = f.title; a.tts = f.tts || 0; }
        a.createdAt = Math.min(a.createdAt || Infinity, f.createdAt || Infinity);
        a.updatedAt = Math.max(a.updatedAt, f.updatedAt || 0);
      }
      (f.entries || []).forEach(e => {
        if (!e || !e.id || tomb.e[f.id + '|' + e.id]) return;
        const ex = a.ents[e.id];
        if (!ex || entTs(e) >= entTs(ex)) a.ents[e.id] = e;
      });
    });
    const files = order.map(id => {
      const a = acc[id];
      return { id: a.id, title: a.title, tts: a.tts, createdAt: a.createdAt, updatedAt: a.updatedAt,
        entries: Object.keys(a.ents).map(k => a.ents[k]).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0)) };
    }).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
    return { files, tomb, suspicious };
  }
  function filesSig(files) {
    return (files || []).map(f => [f.id, f.title, f.tts || 0, (f.entries || []).map(e => e.id + '~' + (e.nts || 0) + '~' + (e.note || '').length).sort().join(',')].join('|')).sort().join('\n');
  }
  function tombSig(t) { return Object.keys((t && t.f) || {}).sort().join(',') + '#' + Object.keys((t && t.e) || {}).sort().join(','); }
  function snapOf(files) {
    const f = [], e = [];
    files.forEach(x => { f.push(x.id); (x.entries || []).forEach(en => e.push(x.id + '|' + en.id)); });
    return { f, e };
  }
  async function syncOnce(keepalive) {
    const c = cloud();
    if (!c || !c.configured || !c.configured()) throw new Error('not-configured');
    if (!c.getCode()) throw new Error('no-code');
    const hash = await c._hash();
    for (let attempt = 0; attempt < 5; attempt++) {
      const remote = await c._rpc('rs_get', { p_hash: hash, p_reader: RKEY });
      const rp = remote && remote.payload ? remote.payload : null;
      const stamp0 = localStamp, local = read();
      const m = mergeResearch(local, rp, cState(), Date.now());
      const out = { v: 1, files: m.files, tomb: m.tomb };
      const need = !rp || filesSig(out.files) !== filesSig(rp.files) || tombSig(out.tomb) !== tombSig(rp.tomb);
      let res = { ok: true, updated_at: remote ? remote.updated_at : null };
      if (need) {
        res = await c._rpc('rs_put', { p_hash: hash, p_reader: RKEY, p_payload: out, p_expected: remote ? remote.updated_at : null }, keepalive);
        if (!res || !res.ok) { if (res && res.error === 'conflict') continue; throw new Error('put-failed:' + (res && res.error)); }
      }
      if (localStamp !== stamp0) continue;      // تغيّر شيء محلياً أثناء الاتصال: أعد الدمج
      const changed = filesSig(m.files) !== filesSig(local.files);
      if (changed) {
        suppress++;
        try { write({ version: 1, files: m.files }); } finally { suppress--; }
      }
      saveCState({ snap: snapOf(m.files), tomb: m.tomb, rev: res.updated_at });
      return changed;
    }
    throw new Error('busy');
  }
  let inFlight = false, again = false;
  function syncNow() {
    if (inFlight) { again = true; return Promise.resolve(null); }
    inFlight = true; st.running = true; emit();
    return syncOnce(false).then(changed => {
      st.lastOk = Date.now(); st.lastError = ''; st.pending = false;
      if (changed) { try { global.dispatchEvent(new CustomEvent('researchfiles:changed')); } catch (_) {} }
      return changed;
    }).catch(err => { st.lastError = String(err && err.message || err); st.pending = true; return null; })
      .then(r => { inFlight = false; st.running = false; emit(); if (again) { again = false; scheduleSync(); } return r; });
  }
  function scheduleSync() {
    const s = status();
    if (!s.configured || !s.hasCode) { st.pending = true; emit(); return; }
    st.pending = true; emit();
    clearTimeout(timer); timer = setTimeout(syncNow, 2500);
  }
  function flush() {
    const s = status();
    if (!st.pending || !s.configured || !s.hasCode || inFlight) return;
    clearTimeout(timer);
    syncOnce(true).then(changed => { st.lastOk = Date.now(); st.pending = false; st.lastError = ''; emit(); }).catch(() => {});
  }
  let lastPull = 0;
  global.addEventListener('pagehide', flush);
  global.addEventListener('online', () => syncNow());
  if (global.document) global.document.addEventListener('visibilitychange', () => {
    if (global.document.visibilityState === 'hidden') flush();
    else if (Date.now() - lastPull > 20000) { lastPull = Date.now(); syncNow(); }
  });
  function boot() { const s = status(); if (s.configured && s.hasCode) { lastPull = Date.now(); setTimeout(syncNow, 600); } }
  if (global.document && global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  global.ReaderResearchFiles = Object.freeze({
    syncNow,
    syncStatus: status,
    onSyncStatus: f => { listeners.push(f); },
    _merge: mergeResearch,
    listFiles,
    getFile,
    createFile,
    renameFile,
    deleteFile,
    addEntry,
    updateEntry,
    deleteEntry,
    markdown,
    slug,
    exportBackup,
    importBackup
  });
})(window);
