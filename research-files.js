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

  function write(data) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(data));
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
    const file = { id: uid('research'), title: name, createdAt: now, updatedAt: now, entries: [] };
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
    if (Object.prototype.hasOwnProperty.call(patch || {}, 'note')) entry.note = text(patch.note, MAX_NOTE);
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
        createdAt: Number(entry.createdAt) || Date.now()
      })) : []
    }));
    return write({ version: 1, files: replace ? normalized : read().files.concat(normalized) });
  }

  global.ReaderResearchFiles = Object.freeze({
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
