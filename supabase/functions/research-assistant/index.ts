// دالة Supabase Edge: وسيط آمن بين موقع القوارئ العشر ومزوّدي النماذج (xAI/Grok وOpenRouter وGemini).
//
// لماذا وسيط؟ المفاتيح تبقى سراً هنا ولا تظهر في الموقع ولا في GitHub.
// الأسرار المطلوبة (Supabase ← Edge Functions ← Secrets):
//   ASSISTANT_PASSPHRASE   كلمة مرور طويلة تختارها أنت (16 حرفاً أو أكثر) — تُدخلها في إعدادات المحادثة بالموقع
//   XAI_API_KEY            مفتاح xAI (يبدأ بـ xai-) — لازم فقط لاستعمال Grok
//   XAI_MODEL              اختياري: اسم نموذج Grok الافتراضي (مثلاً grok-4)
//   OPENROUTER_API_KEY     مفتاح OpenRouter (يبدأ بـ sk-or-) — لازم فقط للنماذج المفتوحة (DeepSeek وKimi وQwen وLlama…)
//   OPENROUTER_MODEL       اختياري: النموذج الافتراضي (الأصل openrouter/free = يختار نموذجاً مجانياً متاحاً)
//   OPENROUTER_PAID_PREFIXES اختياري: مزوّدون مدفوعون مسموحون فقط، مفصولون بفاصلة وينتهي كل منهم بـ /
//                          مثل: deepseek/,moonshotai/  (أنصح به بدل ALLOW_PAID)
//   OPENROUTER_ALLOW_PAID  اختياري: اجعله 1 للسماح بكل النماذج المدفوعة. الأصل: المسموح فقط وسم :free أو openrouter/free،
//                          فلا يستطيع أحد استهلاك رصيدك حتى لو وضعت فيه مالاً.
//   GEMINI_API_KEY         مفتاح Google AI Studio — لازم لاستعمال Gemini (المحادثة + أزرار شرح/بحث/بحث عميق في القوارئ)
//   GEMINI_MODEL           اختياري: نموذج Gemini الافتراضي (الأصل gemini-3.8-flash)
//   GEMINI_DEEP_MODEL      اختياري: نموذج مستقل للبحث العميق (الأصل = GEMINI_MODEL)
//   GEMINI_FALLBACK_MODEL  اختياري: نموذج احتياطي يُجرَّب إذا انشغلت Google أو تأخّرت (الأصل gemini-2.5-flash)
//
// مهم: عند نشر الدالة عطّل خيار «Verify JWT» لهذه الدالة، فالحماية هنا بكلمة المرور أعلاه.
// بدون كلمة المرور لا يستطيع أحد استعمال رصيدك حتى لو عرف عنوان الدالة.
//
// واجهة Gemini (provider = "gemini"):
//   • native: جسم Gemini الأصلي يُمرَّر كما هو (للمحادثة في الصفحة الرئيسية — تبقى أدوات الكتب وتوقيعات التفكير كما هي)
//   • mode = explain | search | deep: يبني الخادم التعليمات بنفسه ويبثّ أحداثاً بسيطة:
//       {t:"status",m}  {t:"delta",m}  {t:"sources",m:[{title,uri}]}  {t:"error",m}  {t:"done"}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-assistant-pass, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

// مقارنة بزمن ثابت (تقارن البصمتين لا النصّين، فلا يتسرب طول كلمة المرور)
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const MAX_BODY_CHARS = 600_000; // حدّ أمان لحجم الطلب (السياق + نتائج الأدوات)

// ====================== Gemini ======================

const GEM_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const GEM_DEFAULT = "gemini-3.8-flash";
const enc = new TextEncoder();

type Src = { title: string; uri: string };

function gemModel(wanted: unknown, deep: boolean): string {
  const w = typeof wanted === "string" ? wanted.trim() : "";
  if (/^gemini-[A-Za-z0-9._-]{1,48}$/.test(w)) return w;
  const base = Deno.env.get("GEMINI_MODEL") || GEM_DEFAULT;
  return deep ? (Deno.env.get("GEMINI_DEEP_MODEL") || base) : base;
}

function gemErrMsg(status: number, m: string): string {
  if ((status === 400 && /api key/i.test(m)) || status === 401) {
    return "مفتاح Gemini في أسرار الدالة غير صالح — راجع GEMINI_API_KEY.";
  }
  if (status === 403) return "رفضت Google الطلب (403): قد يكون المفتاح غير مفعّل لهذه الخدمة أو أن البلد غير مدعوم.";
  if (status === 404) return "اسم نموذج Gemini غير موجود — عدّله في الإعدادات.";
  if (status === 429) return "استنفدت الحصة المجانية أو تجاوزت حد الطلبات — انتظر قليلاً أو بدّل النموذج.";
  if (status >= 500) return "خدمة Gemini مشغولة حالياً — أعد المحاولة.";
  return "رفض Gemini الطلب (" + status + ").";
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// headerMs > 0: مهلة لوصول بداية الرد فقط (لا تقطع البثّ بعد أن يبدأ).
// سبب وجودها: إن علّق Gemini دون ردّ تقطع Supabase الدالة عند 150 ثانية (الخطأ 546) بلا رسالة مفهومة.
async function gemFetch(
  model: string,
  method: "generateContent" | "streamGenerateContent",
  payload: unknown,
  key: string,
  signal?: AbortSignal,
  headerMs = 0,
): Promise<Response> {
  const url = GEM_BASE + encodeURIComponent(model) + ":" + method +
    (method === "streamGenerateContent" ? "?alt=sse" : "");
  const ctl = new AbortController();
  if (signal) {
    if (signal.aborted) ctl.abort();
    else signal.addEventListener("abort", () => ctl.abort(), { once: true });
  }
  const timer = headerMs > 0 ? setTimeout(() => ctl.abort(), headerMs) : 0;
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const RETRYABLE = (st: number) => st === 429 || st === 500 || st === 502 || st === 503 || st === 504;
const GEM_FALLBACK = "gemini-2.5-flash";
const headerMs = () => Number(Deno.env.get("GEMINI_HEADER_MS")) || 25_000;

// يقرأ أحداث SSE من Gemini ويعيد كل حدث JSON
async function* gemEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const rd = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const parse = function* (block: string) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d) continue;
      try {
        yield JSON.parse(d);
      } catch { /* تجاهل */ }
    }
  };
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      yield* parse(block);
    }
  }
  if (buf.trim()) yield* parse(buf);
}

function evText(ev: any): string {
  let t = "";
  const parts = ev?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const p of parts) if (typeof p?.text === "string" && !p.thought) t += p.text;
  }
  return t;
}

function collectSources(ev: any, into: Map<string, Src>): void {
  const ch = ev?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(ch)) return;
  for (const c of ch) {
    const w = c?.web;
    if (w && typeof w.uri === "string" && w.uri && !into.has(w.uri)) {
      into.set(w.uri, { title: String(w.title || w.uri), uri: w.uri });
    }
  }
}

function blockReason(ev: any): string {
  const br = ev?.promptFeedback?.blockReason;
  return br ? String(br) : "";
}

function sseResponse(
  run: (send: (o: unknown) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const ac = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => {
        try {
          controller.enqueue(enc.encode("data: " + JSON.stringify(o) + "\n\n"));
        } catch { /* العميل أغلق الاتصال */ }
      };
      try {
        await run(send, ac.signal);
      } catch (e) {
        if (!ac.signal.aborted) send({ t: "error", m: errText(e) });
      }
      send({ t: "done" });
      try {
        controller.close();
      } catch { /* مغلق */ }
    },
    cancel() {
      ac.abort();
    },
  });
  return new Response(stream, {
    headers: { ...CORS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

// ---------- سياق الطلب (نص محدد + معلومات الكتاب) ----------
function clip(v: unknown, n: number): string {
  return typeof v === "string" ? v.trim().slice(0, n) : "";
}

type Subject = { text: string; q: string; book: string; author: string; pid: string; before: string; after: string };

function readSubject(body: Record<string, unknown>): Subject | null {
  const ctx = (body.ctx && typeof body.ctx === "object" ? body.ctx : {}) as Record<string, unknown>;
  const text = clip(body.text, 6000);
  const q = clip(body.q, 600);
  if (!text && !q) return null;
  return {
    text,
    q,
    book: clip(ctx.book, 200),
    author: clip(ctx.author, 200),
    pid: clip(ctx.pid, 20),
    before: clip(ctx.before, 1500),
    after: clip(ctx.after, 1500),
  };
}

function subjectBlock(s: Subject): string {
  const L: string[] = [];
  if (s.book) L.push("الكتاب: " + s.book);
  if (s.author) L.push("المؤلف: " + s.author);
  if (s.pid) L.push("رقم الفقرة: " + s.pid);
  if (s.text) L.push("النص المحدد:\n" + s.text);
  if (s.before) L.push("السياق قبله:\n" + s.before);
  if (s.after) L.push("السياق بعده:\n" + s.after);
  if (s.q) L.push("سؤال الباحث:\n" + s.q);
  return L.join("\n\n");
}

const PERSONA =
  "أنت مساعد بحثي لباحث عربي مستقل يعمل في التاريخ المقارن والدراسات الدينية: التاريخ الروماني والبيزنطي والمسيحية المبكرة " +
  "والفكر الإسكندري واليهودية الهلنستية والتقاليد الإسلامية والقانونية، على مصادر أولية بالعربية واليونانية والسريانية والفرنسية والإيطالية. " +
  "اكتب بالعربية الفصحى الواضحة، وأبقِ المصطلحات الفنية والأعلام بلغتها الأصلية بين قوسين عند أول ذكر. " +
  "ميّز دائماً بين ما يقوله النص نفسه وما تضيفه أنت من خارجه، وبين المتفق عليه والمختلف فيه بين الباحثين. " +
  "لا تخترع اقتباسات ولا مراجع ولا أرقام صفحات؛ وإن لم تكن متأكداً فقل ذلك صراحة. " +
  "لا تنقل مقاطع طويلة من المصادر حرفياً؛ لخّص بصياغتك.";

const EXPLAIN_SYS = PERSONA +
  "\n\nالمهمة: شرح النص المحدد. رتّب الجواب هكذا بعناوين قصيرة: " +
  "١) المعنى باختصار، ٢) شرح المفردات والعبارات الغامضة، ٣) الأعلام والأحداث والسياق التاريخي، " +
  "٤) نقاط الالتباس أو الاحتمالات في الفهم أو الترجمة. اجعل الجواب مركّزاً يُقرأ بسهولة على شاشة هاتف.";

const SEARCH_SYS = PERSONA +
  "\n\nالمهمة: ابحث على الويب عما يخص هذا النص أو سؤال الباحث، وقدّم خلاصة مركّزة: ما وجدته، ومن قاله (مصدر أولي أم دراسة حديثة أم موسوعة)، " +
  "وما الخلاف القائم إن وُجد. فضّل المصادر الأكاديمية والأولية على المواقع العامة، واذكر ما لم تجده بوضوح. " +
  "اجعل الجواب موجزاً ومنظماً بعناوين قصيرة.";

const PLAN_SYS = PERSONA +
  "\n\nالمهمة: خطّط لبحث عميق. أعد JSON فقط بهذا الشكل: {\"queries\":[\"...\",\"...\"]} " +
  "فيه من 4 إلى 6 استعلامات بحث ويب قصيرة ومتمايزة تغطي زوايا مختلفة: المصدر الأولي ونصّه الأصلي، الدراسات الأكاديمية الحديثة، " +
  "الخلاف بين الباحثين، السياق التاريخي، والترجمات أو الطبعات. اجعل بعضها بالإنجليزية وبعضها بالفرنسية أو العربية أو لغة المصدر الأصلية " +
  "كلما كان ذلك أنفع. لا تضف أي شرح خارج JSON.";

const NOTES_SYS = PERSONA +
  "\n\nالمهمة: ابحث على الويب في الاستعلام التالي فقط ودوّن ملاحظات موجزة ومحددة (حتى 250 كلمة): الوقائع والأسماء والتواريخ " +
  "وموقف كل مصدر. لا تخمّن، وصرّح بما لم تجده.";

const SYNTH_SYS = PERSONA +
  "\n\nالمهمة: اكتب تقريراً بحثياً مركّزاً بالعربية اعتماداً على الملاحظات المجمّعة وحدها (لا تضف وقائع من خارجها). " +
  "البنية: ملخص في سطرين، أهم النتائج، مواضع الخلاف أو عدم اليقين، ما لا يزال ناقصاً وكيف يُبحث عنه، ثم خلاصة. " +
  "استشهد داخل النص بأرقام المصادر بين معقوفتين مثل [1] [3] وبالأرقام المعطاة في قائمة المصادر فقط، ولا تذكر رقماً غير موجود فيها. " +
  "إن تعارضت المصادر فاذكر ذلك صراحة.";

function userContent(text: string) {
  return [{ role: "user", parts: [{ text }] }];
}

// ---------- شرح / بحث: بثّ مباشر ----------
async function runSingle(
  mode: "explain" | "search",
  s: Subject,
  model: string,
  key: string,
): Promise<Response> {
  const payload: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: mode === "explain" ? EXPLAIN_SYS : SEARCH_SYS }] },
    contents: userContent(subjectBlock(s)),
    generationConfig: { maxOutputTokens: 4096 },
  };
  if (mode === "search") payload.tools = [{ googleSearch: {} }];

  // محاولتان بالنموذج المطلوب ثم نموذج احتياطي؛ كل محاولة بمهلة لبداية الرد (الأسوأ ≈ 75 ثانية < حد 150)
  const fb = Deno.env.get("GEMINI_FALLBACK_MODEL") || GEM_FALLBACK;
  const plan: string[] = [model, model];
  if (fb && fb !== model) plan.push(fb);

  return sseResponse(async (send, signal) => {
    let primaryErr = "";
    for (let i = 0; i < plan.length; i++) {
      if (signal.aborted) return;
      if (i > 0) send({ t: "status", m: i === 2 ? "🔁 أجرّب نموذجاً احتياطياً…" : "🔁 أعيد المحاولة…" });

      let up: Response;
      try {
        up = await gemFetch(plan[i], "streamGenerateContent", payload, key, signal, headerMs());
      } catch {
        if (signal.aborted) return;
        if (i < 2) primaryErr = "تأخّر Gemini في الاستجابة (ضغط على الخدمة) — أعد المحاولة بعد قليل.";
        if (i < plan.length - 1) {
          await sleep(1000);
          continue;
        }
        throw new Error(primaryErr || "تأخّر Gemini في الاستجابة — أعد المحاولة بعد قليل.");
      }

      if (!up.ok || !up.body) {
        let m = "";
        try {
          const j = await up.json();
          m = (j && j.error && j.error.message) || "";
        } catch { /* ignore */ }
        const msg = gemErrMsg(up.status, m) + (m ? "\n" + m : "");
        if (i < 2) primaryErr = msg;
        if (RETRYABLE(up.status) && i < plan.length - 1) {
          await sleep(1500);
          continue;
        }
        // النموذج الاحتياطي غير موجود (404): الخطأ المفيد هو خطأ النموذج الأصلي لا هذا
        throw new Error(i === 2 && up.status === 404 && primaryErr ? primaryErr : msg);
      }

      const sources = new Map<string, Src>();
      let got = false;
      let finish = "";
      for await (const ev of gemEvents(up.body)) {
        const br = blockReason(ev);
        if (br) throw new Error("حجبت Google الطلب لأسباب تتعلق بالسلامة (" + br + ") — أعد صياغة السؤال.");
        const t = evText(ev);
        if (t) {
          got = true;
          send({ t: "delta", m: t });
        }
        collectSources(ev, sources);
        const fr = ev?.candidates?.[0]?.finishReason;
        if (fr) finish = String(fr);
      }
      if (!got && finish && finish !== "STOP" && finish !== "MAX_TOKENS") {
        throw new Error("لم يُنتج Gemini ردّاً (" + finish + ") — أعد صياغة السؤال.");
      }
      if (finish === "MAX_TOKENS") send({ t: "delta", m: "\n\n(انقطع الرد لبلوغ الحد الأقصى للطول.)" });
      if (sources.size) send({ t: "sources", m: [...sources.values()] });
      return;
    }
  });
}

// ---------- بحث عميق: تخطيط ← عدة عمليات بحث متوازية ← تقرير ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// طلب غير مبثوث مع إعادة محاولة واحدة عند 429/5xx
async function gemOnce(model: string, payload: unknown, key: string, signal: AbortSignal): Promise<any> {
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) throw new Error("أُلغي الطلب.");
    const res = await gemFetch(model, "generateContent", payload, key, AbortSignal.any([signal, AbortSignal.timeout(70_000)]));
    if (res.ok) return await res.json();
    let m = "";
    try {
      const j = await res.json();
      m = (j && j.error && j.error.message) || "";
    } catch { /* ignore */ }
    last = gemErrMsg(res.status, m);
    if (res.status === 429 || res.status >= 500) {
      await sleep(2500 * (attempt + 1));
      continue;
    }
    break;
  }
  throw new Error(last || "تعذّر إكمال الطلب.");
}

function jsonQueries(raw: string): string[] {
  const clean = raw.replace(/```json|```/g, "").trim();
  try {
    const j = JSON.parse(clean);
    const arr = Array.isArray(j) ? j : j?.queries;
    if (Array.isArray(arr)) {
      return arr.map((x) => String(x).trim().slice(0, 200)).filter((x) => x.length > 2).slice(0, 6);
    }
  } catch { /* نحاول التقاط المصفوفة يدوياً */ }
  const m = clean.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) return arr.map((x) => String(x).trim().slice(0, 200)).filter((x) => x.length > 2).slice(0, 6);
    } catch { /* ignore */ }
  }
  return [];
}

async function runDeep(s: Subject, model: string, key: string): Promise<Response> {
  return sseResponse(async (send, signal) => {
    const subject = subjectBlock(s);

    // 1) التخطيط
    send({ t: "status", m: "🧭 أخطّط لأسئلة البحث…" });
    const plan = await gemOnce(model, {
      systemInstruction: { parts: [{ text: PLAN_SYS }] },
      contents: userContent(subject),
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1024, temperature: 0.3 },
    }, key, signal);
    let queries = jsonQueries(evText({ candidates: plan?.candidates }));
    if (!queries.length) queries = [(s.q || s.text).slice(0, 180)];
    send({ t: "status", m: "🔎 أبحث في " + queries.length + " محاور…" });
    send({ t: "plan", m: queries });

    // 2) بحث متوازٍ
    const sources = new Map<string, Src>();
    let done = 0;
    const notes = await Promise.all(queries.map(async (q) => {
      try {
        const r = await gemOnce(model, {
          systemInstruction: { parts: [{ text: NOTES_SYS }] },
          contents: userContent(
            "الاستعلام: " + q + "\n\nسياق البحث (للتوجيه فقط):\n" + subject.slice(0, 2500),
          ),
          tools: [{ googleSearch: {} }],
          generationConfig: { maxOutputTokens: 1500, temperature: 0.2 },
        }, key, signal);
        collectSources({ candidates: r?.candidates }, sources);
        return { q, text: evText({ candidates: r?.candidates }).trim() };
      } catch (e) {
        return { q, text: "(تعذّر هذا المحور: " + errText(e) + ")" };
      } finally {
        done++;
        send({ t: "status", m: "🔎 اكتمل " + done + " من " + queries.length });
      }
    }));

    const usable = notes.filter((n) => n.text && !n.text.startsWith("(تعذّر"));
    if (!usable.length) throw new Error("لم أحصل على نتائج بحث — " + (notes[0]?.text || "أعد المحاولة بعد قليل."));

    // 3) التقرير المبثوث
    const list = [...sources.values()];
    send({ t: "status", m: "✍️ أكتب التقرير…" });
    const notesTxt = notes.map((n, i) => "### المحور " + (i + 1) + ": " + n.q + "\n" + n.text).join("\n\n");
    const srcTxt = list.length
      ? list.map((x, i) => "[" + (i + 1) + "] " + x.title + " — " + x.uri).join("\n")
      : "(لم تُرجع الأداة روابط محددة)";
    const res = await gemFetch(model, "streamGenerateContent", {
      systemInstruction: { parts: [{ text: SYNTH_SYS }] },
      contents: userContent(
        subject + "\n\n===== الملاحظات المجمّعة =====\n" + notesTxt + "\n\n===== قائمة المصادر =====\n" + srcTxt,
      ),
      generationConfig: { maxOutputTokens: 6144, temperature: 0.3 },
    }, key, signal, 40_000);
    if (!res.ok || !res.body) {
      let m = "";
      try {
        const j = await res.json();
        m = (j && j.error && j.error.message) || "";
      } catch { /* ignore */ }
      throw new Error(gemErrMsg(res.status, m));
    }
    let finish = "";
    for await (const ev of gemEvents(res.body)) {
      const br = blockReason(ev);
      if (br) throw new Error("حجبت Google الطلب لأسباب تتعلق بالسلامة (" + br + ").");
      const t = evText(ev);
      if (t) send({ t: "delta", m: t });
      const fr = ev?.candidates?.[0]?.finishReason;
      if (fr) finish = String(fr);
    }
    if (finish === "MAX_TOKENS") send({ t: "delta", m: "\n\n(انقطع التقرير لبلوغ الحد الأقصى للطول.)" });
    if (list.length) send({ t: "sources", m: list });
  });
}

// ---------- مدخل Gemini ----------
const NATIVE_KEYS = ["systemInstruction", "contents", "generationConfig", "tools", "toolConfig"];

async function handleGemini(body: Record<string, unknown>): Promise<Response> {
  const key = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!key) return json({ error: "السر GEMINI_API_KEY غير مضبوط في أسرار الدالة." }, 500);

  // محادثة الصفحة الرئيسية: جسم Gemini الأصلي يُمرَّر كما هو (مع قائمة بيضاء للحقول)
  if (body.native && typeof body.native === "object") {
    const nat = body.native as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const k of NATIVE_KEYS) if (nat[k] !== undefined) payload[k] = nat[k];
    if (!Array.isArray(payload.contents) || payload.contents.length === 0 || payload.contents.length > 200) {
      return json({ error: "حقل contents غير صالح." }, 400);
    }
    if (Array.isArray(payload.tools)) {
      payload.tools = (payload.tools as any[])
        .filter((t) => t && (Array.isArray(t.functionDeclarations) || t.googleSearch))
        .slice(0, 6);
    }
    const gc = (payload.generationConfig && typeof payload.generationConfig === "object"
      ? payload.generationConfig
      : {}) as Record<string, unknown>;
    gc.maxOutputTokens = Math.max(256, Math.min(Number(gc.maxOutputTokens) || 4096, 8192));
    payload.generationConfig = gc;

    const model = gemModel(body.model, false);
    let up: Response;
    try {
      up = await gemFetch(model, "streamGenerateContent", payload, key, undefined, 40_000);
    } catch {
      return json({ error: "تأخّر Gemini في الاستجابة أو تعذّر الوصول إليه — أعد المحاولة بعد قليل." }, 504);
    }
    // نمرّر الرد كما هو (بثّ SSE عند النجاح، أو JSON الخطأ كما أرسلته Google)
    return new Response(up.body, {
      status: up.status,
      headers: {
        ...CORS,
        "Content-Type": up.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  // فحص: هل يصل الخادم إلى Google وهل المفتاح صالح وما النماذج المتاحة وهل يردّ النموذج المختار
  if (body.mode === "ping") {
    const model = gemModel(body.model, false);
    const out: Record<string, unknown> = { model, fallback: Deno.env.get("GEMINI_FALLBACK_MODEL") || GEM_FALLBACK };
    const t0 = Date.now();
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(10_000),
      });
      out.list_status = r.status;
      out.list_ms = Date.now() - t0;
      if (r.ok) {
        const j = await r.json();
        out.models = (j.models || []).map((m: any) => String(m.name || "").replace("models/", ""))
          .filter((n: string) => /^gemini-/.test(n) && !/embedding|image|tts|live|audio/.test(n)).slice(0, 40);
      } else {
        try { out.list_error = (await r.json())?.error?.message; } catch { /* ignore */ }
      }
    } catch (e) {
      out.list_status = 0;
      out.list_error = "لا ردّ خلال 10 ثوانٍ: " + errText(e);
    }
    const t1 = Date.now();
    try {
      const r = await gemFetch(model, "generateContent", { contents: userContent("قل: تم"), generationConfig: { maxOutputTokens: 16 } }, key, undefined, 15_000);
      out.test_status = r.status;
      out.test_ms = Date.now() - t1;
      if (!r.ok) { try { out.test_error = (await r.json())?.error?.message; } catch { /* ignore */ } }
    } catch (e) {
      out.test_status = 0;
      out.test_error = "لا ردّ خلال 15 ثانية: " + errText(e);
    }
    return json(out);
  }

  const mode = body.mode;
  if (mode !== "explain" && mode !== "search" && mode !== "deep") {
    return json({ error: "الوضع غير معروف (المسموح: explain أو search أو deep)." }, 400);
  }
  const s = readSubject(body);
  if (!s) return json({ error: "لا يوجد نص أو سؤال لإرساله." }, 400);

  const model = gemModel(body.model, mode === "deep");
  if (mode === "deep") return await runDeep(s, model, key);
  return await runSingle(mode, s, model, key);
}

// ====================== المدخل العام ======================

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "الطريقة غير مدعومة." }, 405);

  const pass = Deno.env.get("ASSISTANT_PASSPHRASE") ?? "";
  if (pass.length < 16) {
    return json({ error: "السر ASSISTANT_PASSPHRASE غير مضبوط أو أقصر من 16 حرفاً." }, 500);
  }

  const given = req.headers.get("x-assistant-pass") ?? "";
  if (!(await safeEqual(given, pass))) {
    return json({ error: "كلمة مرور المساعد غير صحيحة." }, 401);
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return json({ error: "تعذّرت قراءة الطلب." }, 400);
  }
  if (raw.length > MAX_BODY_CHARS) return json({ error: "الطلب أكبر من الحد المسموح." }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "الطلب ليس JSON صالحاً." }, 400);
  }

  // Gemini له مسار مستقل (محادثة أصلية أو أوضاع شرح/بحث/بحث عميق)
  if (body.provider === "gemini") return await handleGemini(body);

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 120) {
    return json({ error: "حقل messages غير صالح." }, 400);
  }

  // المزوّد: xai (الأصل، للتوافق مع الموقع الحالي) أو openrouter (للنماذج المفتوحة)
  const provider = body.provider === "openrouter" ? "openrouter" : "xai";
  const wanted = typeof body.model === "string" ? body.model.trim() : "";

  let model: string;
  let endpoint: string;
  let apiKey: string;
  const extraHeaders: Record<string, string> = {};

  if (provider === "openrouter") {
    apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
    if (!apiKey) return json({ error: "السر OPENROUTER_API_KEY غير مضبوط في أسرار الدالة." }, 500);
    const allowPaid = Deno.env.get("OPENROUTER_ALLOW_PAID") === "1";
    // إذن انتقائي: مزوّدون محددون فقط (مثل deepseek/,moonshotai/) — أأمن من فتح كل المدفوع
    const paidPrefixes = (Deno.env.get("OPENROUTER_PAID_PREFIXES") ?? "")
      .split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9._-]{1,40}\/$/.test(s));
    const fallback = Deno.env.get("OPENROUTER_MODEL") || "openrouter/free";
    // صيغة المعرّف: مزوّد/نموذج أو مزوّد/نموذج:وسم — مثل deepseek/deepseek-chat:free
    const okShape = /^[A-Za-z0-9._-]{1,40}\/[A-Za-z0-9._-]{1,80}(:[A-Za-z0-9._-]{1,20})?$/.test(wanted);
    model = okShape ? wanted : fallback;
    const prefixOk = paidPrefixes.some((p) => model.toLowerCase().startsWith(p));
    if (!allowPaid && !prefixOk && model !== "openrouter/free" && !model.endsWith(":free")) {
      return json({
        error: "هذا النموذج غير مجاني وغير مسموح به في الدالة. المسموح: ما ينتهي بـ :free أو openrouter/free، " +
          "أو مزوّدون تحددهم في السر OPENROUTER_PAID_PREFIXES (مثل deepseek/,moonshotai/).",
      }, 403);
    }
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
    extraHeaders["HTTP-Referer"] = "https://alya71712-svg.github.io/readers/";
    extraHeaders["X-Title"] = "Readers";
  } else {
    apiKey = Deno.env.get("XAI_API_KEY") ?? "";
    if (!apiKey) return json({ error: "السر XAI_API_KEY غير مضبوط في أسرار الدالة." }, 500);
    model = /^grok-[A-Za-z0-9._-]{1,48}$/.test(wanted)
      ? wanted
      : (Deno.env.get("XAI_MODEL") || "grok-4");
    endpoint = "https://api.x.ai/v1/chat/completions";
  }

  const maxTokens = Math.max(256, Math.min(Number(body.max_tokens) || 4096, 8192));
  const payload: Record<string, unknown> = { model, messages, stream: true, max_tokens: maxTokens };
  if (Array.isArray(body.tools) && body.tools.length > 0 && body.tools.length <= 12) {
    payload.tools = body.tools;
  }

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey, ...extraHeaders },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ error: "تعذّر الوصول إلى " + (provider === "openrouter" ? "OpenRouter" : "xAI") + " من الدالة." }, 502);
  }

  // نمرّر الرد كما هو (بثّ SSE عند النجاح، أو JSON الخطأ كما أرسلته xAI)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS,
      "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
});
