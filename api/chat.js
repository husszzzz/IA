const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const DEFAULT_MODEL = "gemini-2.5-flash";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function GET() {
  return json({
    ok: true,
    service: "NOVA AI",
    provider: "Google Gemini",
    status: "online"
  });
}

export async function POST(request) {
  try {
    // ==============================
    // API KEY
    // ==============================

    if (!GEMINI_API_KEY) {
      return json(
        {
          ok: false,
          error: "GEMINI_API_KEY_MISSING",
          message: "أضف GEMINI_API_KEY في Vercel."
        },
        500
      );
    }

    // ==============================
    // قراءة الطلب
    // ==============================

    let body;

    try {
      body = await request.json();
    } catch {
      return json(
        {
          ok: false,
          error: "INVALID_JSON",
          message: "الطلب المرسل غير صالح."
        },
        400
      );
    }

    // ==============================
    // استقبال جميع الصيغ
    // ==============================

    let messages = [];

    // الصيغة الأساسية
    if (Array.isArray(body.messages)) {
      messages = body.messages;
    }

    // إذا الواجهة ترسل message فقط
    else if (typeof body.message === "string" && body.message.trim()) {
      messages = [
        {
          role: "user",
          content: body.message.trim()
        }
      ];
    }

    // إذا الواجهة ترسل prompt
    else if (typeof body.prompt === "string" && body.prompt.trim()) {
      messages = [
        {
          role: "user",
          content: body.prompt.trim()
        }
      ];
    }

    // ==============================
    // التحقق
    // ==============================

    if (messages.length === 0) {
      return json(
        {
          ok: false,
          error: "NO_MESSAGES",
          message: "لم يتم العثور على رسالة."
        },
        400
      );
    }

    // ==============================
    // تحويل الرسائل إلى Gemini
    // ==============================

    const history = messages
      .filter(
        (msg) =>
          msg &&
          typeof msg.content === "string" &&
          msg.content.trim()
      )
      .slice(-20)
      .map((msg) => {
        let role = "user";

        if (
          msg.role === "assistant" ||
          msg.role === "model"
        ) {
          role = "model";
        }

        return {
          role,
          parts: [
            {
              text: msg.content.trim()
            }
          ]
        };
      });

    if (history.length === 0) {
      return json(
        {
          ok: false,
          error: "NO_VALID_MESSAGES"
        },
        400
      );
    }

    // ==============================
    // اختيار النموذج
    // ==============================

    const requestedModel =
      typeof body.model === "string"
        ? body.model
        : DEFAULT_MODEL;

    let model = DEFAULT_MODEL;

    if (
      requestedModel === "gemini-2.0-flash"
    ) {
      model = "gemini-2.5-flash";
    }

    if (
      requestedModel === "gemini-2.5-flash"
    ) {
      model = "gemini-2.5-flash";
    }

    if (
      requestedModel === "gemini-2.5-flash-lite"
    ) {
      model = "gemini-2.5-flash-lite";
    }

    // ==============================
    // Gemini
    // ==============================

    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 45000);

    let response;

    try {
      response = await fetch(apiUrl, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },

        body: JSON.stringify({
          contents: history,

          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4000
          }
        }),

        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    // ==============================
    // رد Gemini
    // ==============================

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", data);

      return json(
        {
          ok: false,
          error: "GEMINI_API_ERROR",
          status: response.status,
          message:
            data?.error?.message ||
            "حدث خطأ أثناء الاتصال بـ Gemini."
        },
        response.status
      );
    }

    // ==============================
    // استخراج الإجابة
    // ==============================

    const content =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("") || "";

    if (!content.trim()) {
      console.error(
        "Gemini Empty Response:",
        data
      );

      return json(
        {
          ok: false,
          error: "EMPTY_RESPONSE",
          message: "Gemini لم يرجع إجابة."
        },
        502
      );
    }

    // ==============================
    // إرسال الإجابة للموقع
    // ==============================

    return json({
      ok: true,
      model,
      content: content.trim()
    });

  } catch (error) {
    console.error("API ERROR:", error);

    if (error?.name === "AbortError") {
      return json(
        {
          ok: false,
          error: "TIMEOUT",
          message: "انتهت مهلة الاتصال بـ Gemini."
        },
        504
      );
    }

    return json(
      {
        ok: false,
        error: "SERVER_ERROR",
        message:
          error?.message ||
          "حدث خطأ غير متوقع."
      },
      500
    );
  }
}
