(function () {
  'use strict';

  const MAX_PASSAGE = 6000;
  const MAX_DIRECT_URL = 24000;
  const DEFAULT_QUESTION = 'حلّل الفكرة أو الادعاء الوارد في المقتطف، وبيّن الأدلة المؤيدة والمعارضة والسياق البحثي والمصادر الأولية ذات الصلة.';
  const MODELS = {
    claude: { name: 'Claude', url: 'https://claude.ai/', deepLink: 'https://claude.ai/new?q=' },
    gemini: { name: 'Gemini', url: 'https://gemini.google.com/' },
    kimi: { name: 'Kimi', url: 'https://www.kimi.com/' },
    chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/', deepLink: 'https://chatgpt.com/?q=' },
    manus: { name: 'Manus', url: 'https://manus.im/' },
    grok: { name: 'Grok', url: 'https://grok.com/' },
    deepseek: { name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
    youmind: { name: 'YouMind', url: 'https://youmind.com/' },
    perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/', deepLink: 'https://www.perplexity.ai/search?q=' },
    qwen: { name: 'Qwen', url: 'https://chat.qwen.ai/' },
    genspark: { name: 'Genspark', url: 'https://www.genspark.ai/' },
    meta: { name: 'Meta AI', url: 'https://www.meta.ai/' }
  };

  const handoff = new URLSearchParams(location.hash.replace(/^#/, ''));
  const passage = document.getElementById('passage');
  const question = document.getElementById('question');
  const model = document.getElementById('model');
  const openButton = document.getElementById('openModel');
  const copyButton = document.getElementById('copyPrompt');
  const pasteButton = document.getElementById('pasteClipboard');
  const status = document.getElementById('status');
  const source = document.getElementById('source');
  const sourceBits = [];
  let payload = null;
  const token = handoff.get('handoff') || '';
  if (/^[A-Za-z0-9_-]{8,100}$/.test(token)) {
    const key = 'readerAiHandoff:' + token;
    try {
      payload = JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.removeItem(key);
    } catch (_) { try { localStorage.removeItem(key); } catch (_) {} }
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (!payload || !payload.createdAt || Date.now() - Number(payload.createdAt) > 30 * 60 * 1000) payload = null;
  if (!payload) {
    try {
      const recent = JSON.parse(localStorage.getItem('readerRecentCopy.v1') || 'null');
      if (recent && recent.text && recent.createdAt && Date.now() - Number(recent.createdAt) <= 30 * 60 * 1000) payload = recent;
      else localStorage.removeItem('readerRecentCopy.v1');
    } catch (_) {}
  }
  const book = payload && payload.title || '';
  const author = payload && payload.author || '';
  const paragraph = payload && payload.pid || '';

  passage.value = (payload && payload.text || '').slice(0, MAX_PASSAGE);
  if (book) sourceBits.push(book);
  if (author) sourceBits.push(author);
  if (paragraph) sourceBits.push('الفقرة ' + paragraph);
  if (sourceBits.length) {
    source.textContent = 'مصدر المقتطف: ' + sourceBits.join(' — ');
    source.classList.add('show');
  }

  function promptText() {
    const quote = passage.value.trim();
    const q = question.value.trim() || DEFAULT_QUESTION;
    const lines = [
      'السؤال البحثي: ' + q,
      '',
      'أجب باللغة العربية، وميّز بين ما يقوله المقتطف وما تضيفه من معلومات. اذكر الأدلة والمصادر القابلة للتحقق عند توفرها، ولا تختلق مراجع أو اقتباسات.',
      '',
      'المقتطف:',
      '«' + quote + '»'
    ];
    const metadata = [];
    if (book) metadata.push('الكتاب: ' + book);
    if (author) metadata.push('المؤلف: ' + author);
    if (paragraph) metadata.push('رقم الفقرة في القارئ: ' + paragraph);
    if (metadata.length) lines.push('', 'بيانات المصدر:', metadata.join('\n'));
    return lines.join('\n');
  }

  function syncButtons() {
    const ready = passage.value.trim().length > 0;
    openButton.disabled = !ready || !model.value;
    copyButton.disabled = !ready;
  }

  function copySync(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-10000px;left:-10000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    try { area.setSelectionRange(0, text.length); } catch (_) {}
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    area.remove();
    try {
      localStorage.setItem('readerRecentCopy.v1', JSON.stringify({
        kind: 'selection', text: text.slice(0, MAX_PASSAGE), title: book, author: author,
        pid: paragraph || null, createdAt: Date.now()
      }));
    } catch (_) {}
    if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        status.textContent = '✓ نُسخت الحزمة إلى الحافظة.';
      }).catch(() => {
        status.textContent = 'تعذّر النسخ تلقائياً؛ حدّد النص وانسخه يدوياً.';
      });
    }
    return copied;
  }

  function copyOnly() {
    const shareTxt = promptText();
    const ok = copySync(shareTxt);
    try { if (typeof navigator.share === 'function') navigator.share({ title: 'مقتطفات من «القراء العشرة»', text: shareTxt }).catch(function () {}); } catch (_) {}
    status.textContent = ok ? '✓ نُسخت الحزمة البحثية كاملةً.' : 'جارٍ نسخ الحزمة؛ إذا لم تنجح تلقائياً فانسخ النص يدوياً.';
  }

  function openSelectedModel() {
    const item = MODELS[model.value];
    if (!item) return;
    const prompt = promptText();
    const copied = copySync(prompt);
    let target = item.url;
    let prefilled = false;
    if (item.deepLink) {
      const deep = item.deepLink + encodeURIComponent(prompt);
      if (deep.length <= MAX_DIRECT_URL) {
        target = deep;
        prefilled = true;
      }
    }
    // نفتح النافذة أولاً وفي الضغطة نفسها: استدعاء navigator.share قبلها يستهلك إذن الضغطة فيحظر المتصفح النافذة المنبثقة.
    // (لذلك لا نستدعي مشاركة الهاتف هنا؛ زر «نسخ فقط» يبقى معه فتح المشاركة.)
    let w = null;
    try { w = window.open(target, '_blank'); } catch (_) {}
    if (w) { try { w.opener = null; } catch (_) {} }
    status.textContent = '';
    const msg = document.createElement('span');
    if (w) {
      msg.textContent = prefilled
        ? '✓ نُسخت الحزمة وفُتح ' + item.name + ' مع السؤال والمقتطف في رابط المحادثة.'
        : (copied ? '✓ نُسخت الحزمة وفُتح ' + item.name + '. الصقها في مربع المحادثة.' : 'فُتح ' + item.name + '. الصق الحزمة في مربع المحادثة.');
      status.appendChild(msg);
    } else {
      // حُظرت النافذة رغم ذلك (إعداد المتصفح): نعرض رابطاً يُفتح بضغطة مباشرة
      msg.textContent = (copied ? '✓ نُسخت الحزمة. ' : '') + 'حظر المتصفح الفتح التلقائي، اضغط هنا لفتح ' + item.name + ': ';
      const a = document.createElement('a');
      a.href = target; a.target = '_blank'; a.rel = 'noopener'; a.textContent = item.name + ' ↗';
      status.appendChild(msg); status.appendChild(a);
    }
  }

  pasteButton.addEventListener('click', function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      passage.focus();
      status.textContent = 'لا يتيح هذا المتصفح قراءة الحافظة تلقائياً؛ اضغط مطولاً داخل حقل الفقرة واختر «لصق». ';
      return;
    }
    navigator.clipboard.readText().then(function (text) {
      if (!text.trim()) {
        status.textContent = 'الحافظة فارغة. انسخ فقرة أولاً ثم حاول مرة أخرى.';
        return;
      }
      passage.value = text.slice(0, MAX_PASSAGE);
      syncButtons();
      status.textContent = text.length > MAX_PASSAGE
        ? 'لُصق النص مع الاقتصار على أول ' + MAX_PASSAGE + ' حرفاً.'
        : '✓ لُصقت الفقرة من الحافظة.';
    }).catch(function () {
      passage.focus();
      status.textContent = 'رفض المتصفح الوصول إلى الحافظة؛ اضغط مطولاً داخل حقل الفقرة واختر «لصق». ';
    });
  });

  passage.addEventListener('input', syncButtons);
  question.addEventListener('input', syncButtons);
  model.addEventListener('change', syncButtons);
  copyButton.addEventListener('click', copyOnly);
  openButton.addEventListener('click', openSelectedModel);
  syncButtons();
})();
