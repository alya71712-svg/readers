/* واجهة مساعد البحث الأكاديمي لموقع القراء العشر.
   تُحمّل بعد تعريف قائمة READERS في index.html.
   لا تضع مفتاح OpenAI هنا؛ المفتاح محفوظ في Supabase Edge Function Secrets. */
(function () {
  "use strict";
  const SUPABASE_URL = "https://usylwbhpzkfyquhzoisg.supabase.co";
  const SUPABASE_PUBLIC_KEY = "sb_publishable_ds20e03PIrsYnz7_xiEudg_scUTF-27";
  const FUNCTION_URL = SUPABASE_URL + "/functions/v1/research-assistant";
  let clientPromise;

  function loadSupabase() {
    if (window.supabase?.createClient) return Promise.resolve(window.supabase);
    if (clientPromise) return clientPromise;
    clientPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
      s.onload = () => window.supabase?.createClient ? resolve(window.supabase) : reject(new Error("تعذّر تحميل مكتبة Supabase."));
      s.onerror = () => reject(new Error("تعذّر تحميل مكتبة الاتصال؛ تحقق من الإنترنت."));
      document.head.appendChild(s);
    });
    return clientPromise;
  }
  async function getClient() {
    const sdk = await loadSupabase();
    const c = sdk.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    const { data } = await c.auth.getSession();
    if (!data.session) {
      const { error } = await c.auth.signInAnonymously();
      if (error) throw new Error("تعذّر بدء جلسة المساعد. فعّل Anonymous Sign-ins في Supabase ثم أعد المحاولة.");
    }
    return c;
  }
  function readLocalResearchNotes() {
    const found = [];
    const seen = new Set();
    const interesting = /note|comment|highlight|bookmark|annotation|quote|تظليل|ملاحظة|تعليق|إشارة/i;
    function walk(value, path, depth) {
      if (depth > 7 || value == null) return;
      if (typeof value === "string") return;
      if (Array.isArray(value)) {
        value.slice(0, 500).forEach((v, i) => walk(v, path + "[" + i + "]", depth + 1));
        return;
      }
      if (typeof value !== "object") return;
      const keys = Object.keys(value);
      const label = keys.filter(k => interesting.test(k));
      const hasText = keys.some(k => /note|comment|highlight|quote|text|content|ملاحظة|تظليل/i.test(k) && typeof value[k] === "string" && value[k].trim());
      if ((label.length || hasText) && found.length < 180) {
        const clean = {};
        keys.forEach(k => {
          const v = value[k];
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            if (/note|comment|highlight|bookmark|annotation|quote|text|content|title|book|pid|paragraph|ملاحظة|تظليل|كتاب|فقرة|لون/i.test(k)) clean[k] = String(v).slice(0, 1200);
          }
        });
        if (Object.keys(clean).length) {
          const signature = JSON.stringify(clean);
          if (!seen.has(signature)) { seen.add(signature); found.push({ source: path, data: clean }); }
        }
      }
      keys.forEach(k => {
        if (/note|bookmark|highlight|annotation|userdata|ملاحظة|تظليل/i.test(k) || depth < 2) walk(value[k], path + "." + k, depth + 1);
      });
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !/^myreader_userdata_/i.test(key)) continue;
        try { walk(JSON.parse(localStorage.getItem(key)), key, 0); } catch (_) {}
      }
    } catch (_) {}
    return found;
  }
  async function getContext(reader, includeNotes, includeBook) {
    const chunks = [];
    if (includeBook && reader?.file) {
      try {
        const response = await fetch(reader.file, { cache: "no-store" });
        if (response.ok) {
          const html = await response.text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          doc.querySelectorAll("script,style,noscript,svg,template").forEach(n => n.remove());
          let text = (doc.body?.innerText || doc.body?.textContent || "").replace(/\s+/g, " ").trim();
          if (text) chunks.push("مقتطف من ملف القارئ " + (reader.title || reader.id) + ":\n" + text.slice(0, 26000));
        } else {
          chunks.push("تعذّر جلب ملف النص المحدد تلقائياً (HTTP " + response.status + ").");
        }
      } catch (_) {
        chunks.push("تعذّر قراءة ملف الكتاب آلياً؛ يمكن أن تظل الملاحظات المحلية متاحة.");
      }
    }
    if (includeNotes) {
      const notes = readLocalResearchNotes();
      if (notes.length) chunks.push("ملاحظات/تظليلات مستخرجة من التخزين المحلي (قد لا تمثل كل الحقول):\n" + JSON.stringify(notes).slice(0, 22000));
      else chunks.push("لم أستطع العثور على ملاحظات قابلة للاستخراج من مفاتيح myreader_userdata_* في هذا المتصفح.");
    }
    return chunks.join("\n\n---\n\n").slice(0, 48000);
  }
  function el(tag, props = {}, children = []) {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "text") n.textContent = v;
      else if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    children.forEach(c => c && n.appendChild(c));
    return n;
  }
  function addStyles() {
    if (document.getElementById("research-ai-style")) return;
    const style = el("style", { id: "research-ai-style", text: `
      .rai-modal{position:fixed;inset:0;z-index:99999;background:#111827aa;display:flex;align-items:center;justify-content:center;padding:10px}
      .rai-card{width:min(900px,100%);height:min(90vh,850px);display:flex;flex-direction:column;background:#fffdf8;color:#33291f;border-radius:18px;overflow:hidden;box-shadow:0 20px 70px #0005;font:15px/1.7 Tahoma,Arial,sans-serif}
      .rai-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;background:#f3e7d5;border-bottom:1px solid #ddc8a8}
      .rai-head h2{margin:0;font-size:18px}.rai-body{display:flex;flex-direction:column;gap:10px;padding:12px;min-height:0;flex:1}
      .rai-row{display:flex;gap:8px;flex-wrap:wrap}.rai-row select{flex:1;min-width:180px}
      .rai-input,.rai-select{font:inherit;padding:10px;border:1px solid #d4c1a4;border-radius:10px;background:white;color:#33291f}
      .rai-question{width:100%;min-height:78px;resize:vertical}
      .rai-result{flex:1;min-height:100px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #e1d1b8;border-radius:12px;padding:12px;background:#fff}
      .rai-actions{display:flex;gap:8px;flex-wrap:wrap}.rai-btn{border:0;border-radius:10px;padding:10px 14px;background:#8b4e3a;color:white;font:inherit;font-weight:bold;cursor:pointer}
      .rai-btn.alt{background:#e9dcc8;color:#503a2b}.rai-status{font-size:13px;color:#76523d;min-height:20px}
      .rai-check{display:flex;align-items:center;gap:6px;font-size:13px}
      @media(max-width:600px){.rai-card{height:94vh}.rai-body{padding:9px}.rai-head h2{font-size:16px}}
    `});
    document.head.appendChild(style);
  }
  function openAssistant() {
    addStyles();
    let readers = [];
    try { readers = typeof READERS !== "undefined" ? READERS : []; } catch (_) {}
    const select = el("select", { class: "rai-select rai-input", "aria-label": "اختر القارئ" });
    select.appendChild(el("option", { value: "", text: "كل المكتبة / دون تحديد كتاب" }));
    readers.forEach(r => select.appendChild(el("option", { value: r.id, text: r.title + " — " + (r.sub || "") })));
    const bookCheck = el("input", { type: "checkbox" }); bookCheck.checked = true;
    const notesCheck = el("input", { type: "checkbox" }); notesCheck.checked = true;
    const question = el("textarea", { class: "rai-input rai-question", placeholder: "مثال: اجمع تظليلاتي عن العقل والحواس في فيلون، ثم قارنها بالشواهد من النص المحدد." });
    const result = el("div", { class: "rai-result", role: "status", text: "اختر كتاباً أو اترك البحث على مستوى المكتبة، ثم اكتب سؤالك." });
    const status = el("div", { class: "rai-status", text: "لا تُعدّل هذه الواجهة ملاحظاتك أو تظليلاتك." });
    const close = () => overlay.remove();
    const overlay = el("div", { class: "rai-modal", onclick: e => { if (e.target === overlay) close(); } });
    const send = el("button", { class: "rai-btn", text: "ابحث وحلّل", onclick: async () => {
      const q = question.value.trim();
      if (!q) { status.textContent = "اكتب سؤالاً أولاً."; return; }
      send.disabled = true; status.textContent = "جارٍ تجهيز السياق والاتصال بالمساعد…";
      result.textContent = "";
      try {
        const reader = readers.find(r => r.id === select.value);
        const context = await getContext(reader, notesCheck.checked, bookCheck.checked && !!reader);
        const client = await getClient();
        const { data: { session } } = await client.auth.getSession();
        if (!session?.access_token) throw new Error("لم تتوفر جلسة آمنة؛ أعد فتح المساعد.");
        status.textContent = "جارٍ تحليل السؤال…";
        const response = await fetch(FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + session.access_token, "apikey": SUPABASE_PUBLIC_KEY },
          body: JSON.stringify({ question: q, context, bookTitle: reader?.title || "كل المكتبة" })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "تعذّر الاتصال بالمساعد (" + response.status + ").");
        result.textContent = data.answer || "لم يصل نص في الرد.";
        status.textContent = "اكتمل التحليل. راجع كل اقتباس في مصدره الأصلي.";
      } catch (e) {
        result.textContent = "لم يكتمل الطلب.\n" + (e?.message || "خطأ غير معروف.");
        status.textContent = "راجع إعدادات Supabase والدالة ومفتاح OpenAI.";
      } finally { send.disabled = false; }
    }});
    const top = el("div", { class: "rai-head" }, [
      el("h2", { text: "مساعد البحث الأكاديمي — ChatGPT" }),
      el("button", { class: "rai-btn alt", text: "إغلاق", onclick: close })
    ]);
    const checks = el("div", { class: "rai-row" }, [
      el("label", { class: "rai-check" }, [bookCheck, document.createTextNode("ضمّ نص الكتاب المحدد")]),
      el("label", { class: "rai-check" }, [notesCheck, document.createTextNode("ضمّ ملاحظاتي وتظليلاتي المحلية")])
    ]);
    const card = el("section", { class: "rai-card" }, [
      top,
      el("div", { class: "rai-body" }, [
        el("div", { class: "rai-row" }, [select]),
        checks, question, el("div", { class: "rai-actions" }, [send]),
        status, result,
        el("div", { class: "rai-status", text: "النسخة الأولى للقراءة والتحليل فقط. السياق المختار يُرسل إلى OpenAI لمعالجة السؤال." })
      ])
    ]);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }
  function installButton() {
    const nav = document.querySelector(".nav-grid");
    if (!nav || document.getElementById("openResearchAssistant")) return;
    const button = el("button", { id: "openResearchAssistant", type: "button", class: "nav-btn", onclick: openAssistant }, [
      el("span", { class: "nav-icon", text: "🤖" }),
      document.createTextNode("مساعد البحث الأكاديمي — ChatGPT")
    ]);
    nav.appendChild(button);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installButton);
  else installButton();
  // احتياط إذا رسمت لوحة التحكم بعد تحميل هذا الملف
  setTimeout(installButton, 800);
})();
