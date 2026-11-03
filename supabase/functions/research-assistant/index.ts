// دالة Supabase Edge: وسيط آمن بين موقع القوارئ العشر وواجهة xAI (Grok).
//
// لماذا وسيط؟ مفتاح xAI يبقى سراً هنا ولا يظهر في الموقع ولا في GitHub.
// الأسرار المطلوبة (Supabase ← Edge Functions ← Secrets):
//   XAI_API_KEY          مفتاح xAI (يبدأ بـ xai-)
//   ASSISTANT_PASSPHRASE كلمة مرور طويلة تختارها أنت (20 حرفاً أو أكثر) — تُدخلها في إعدادات المحادثة بالموقع
//   XAI_MODEL            اختياري: اسم النموذج الافتراضي (مثلاً grok-4)
//
// مهم: عند نشر الدالة عطّل خيار «Verify JWT» لهذه الدالة، فالحماية هنا بكلمة المرور أعلاه.
// بدون كلمة المرور لا يستطيع أحد استعمال رصيدك حتى لو عرف عنوان الدالة.

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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "الطريقة غير مدعومة." }, 405);

  const apiKey = Deno.env.get("XAI_API_KEY") ?? "";
  const pass = Deno.env.get("ASSISTANT_PASSPHRASE") ?? "";
  if (!apiKey) return json({ error: "السر XAI_API_KEY غير مضبوط في أسرار الدالة." }, 500);
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

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 120) {
    return json({ error: "حقل messages غير صالح." }, 400);
  }

  const wanted = typeof body.model === "string" ? body.model : "";
  const model = /^grok-[A-Za-z0-9._-]{1,48}$/.test(wanted)
    ? wanted
    : (Deno.env.get("XAI_MODEL") || "grok-4");

  const maxTokens = Math.max(256, Math.min(Number(body.max_tokens) || 4096, 8192));
  const payload: Record<string, unknown> = { model, messages, stream: true, max_tokens: maxTokens };
  if (Array.isArray(body.tools) && body.tools.length > 0 && body.tools.length <= 12) {
    payload.tools = body.tools;
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ error: "تعذّر الوصول إلى xAI من الدالة." }, 502);
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
