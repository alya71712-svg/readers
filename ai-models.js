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
    try { if (typeof navigator.share === 'function') navigator.share({ title: 'مقتطفات من «القراء العشرة»', text: prompt }).catch(function () {}); } catch (_) {}
    let target = item.url;
    let prefilled = false;
    if (item.deepLink) {
      const deep = item.deepLink + encodeURIComponent(prompt);
      if (deep.length <= MAX_DIRECT_URL) {
        target = deep;
        prefilled = true;
      }
    }
    window.open(target, '_blank', 'noopener');
    status.textContent = prefilled
      ? '✓ نُسخت الحزمة وطُلب فتح ' + item.name + ' مع السؤال والمقتطف في رابط المحادثة. إذا لم يظهر التبويب، اسمح بالنوافذ المنبثقة.'
      : (copied ? '✓ نُسخت الحزمة وطُلب فتح ' + item.name + '. الصقها في مربع المحادثة، وإذا لم يظهر التبويب اسمح بالنوافذ المنبثقة.' : 'طُلب فتح ' + item.name + '. الصق الحزمة في مربع المحادثة، وإذا لم يظهر التبويب اسمح بالنوافذ المنبثقة.');
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
