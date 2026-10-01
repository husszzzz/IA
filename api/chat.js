const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// النموذج الأساسي
const DEFAULT_MODEL = "gemini-2.5-flash";

export async function GET() {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "NOVA AI",
      provider: "Google Gemini",
      status: "online"
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );
}

export async function POST(request) {
  try {
    // =========================
    // فحص المفتاح
    // =========================

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "GEMINI_API_KEY_MISSING",
          message: "لم يتم إضافة GEMINI_API_KEY في Vercel."
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    // =========================
    // قراءة الطلب
    // =========================

    const body = await request.json();

    const messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "NO_MESSAGES",
          message: "لم يتم إرسال أي رسالة."
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    // =========================
    // تنظيف سجل المحادثة
    // =========================

    const history = messages
      .filter((msg) => msg && typeof msg.content === "string")
      .slice(-20)
      .map((msg) => {
        const role =
          msg.role === "assistant" || msg.role === "model"
            ? "model"
            : "user";

        return {
          role,
          parts: [
            {
              text: msg.content
            }
          ]
        };
      });

    if (history.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INVALID_MESSAGES"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    // =========================
    // اختيار الموديل
    // =========================
    // الواجهة القديمة قد ترسل:
    // gpt-4o
    // gpt-4o-mini
    // deepseek
    // gemini-2.0-flash
    //
    // كلها نحولها إلى Gemini
    // =========================

    const requestedModel = body.model;

    let model = DEFAULT_MODEL;

    if (requestedModel === "gemini-2.0-flash") {
      model = "gemini-2.5-flash";
    }

    if (
      requestedModel === "gemini-2.5-flash" ||
      requestedModel === "gemini-flash-latest"
    ) {
      model = requestedModel;
    }

    // =========================
    // Gemini API
    // =========================

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

    // =========================
    // قراءة رد Gemini
    // =========================

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      let errorMessage = "حدث خطأ من Gemini API.";

      if (data?.error?.message) {
        errorMessage = data.error.message;
      }

      return new Response(
        JSON.stringify({
          ok: false,
          error: "GEMINI_API_ERROR",
          status: response.status,
          message: errorMessage
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    // =========================
    // استخراج النص
    // =========================

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("") || "";

    if (!text) {
      console.error("Gemini returned no text:", data);

      return new Response(
        JSON.stringify({
          ok: false,
          error: "EMPTY_RESPONSE",
          message: "Gemini لم يرجع نصًا."
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    // =========================
    // الرد للواجهة
    // =========================

    return new Response(
      JSON.stringify({
        ok: true,
        model,
        content: text
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );

  } catch (error) {
    console.error("Chat API error:", error);

    if (error?.name === "AbortError") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "TIMEOUT",
          message: "انتهت مهلة الاتصال مع Gemini."
        }),
        {
          status: 504,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: false,
        error: "SERVER_ERROR",
        message: error?.message || "حدث خطأ غير متوقع."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  }
}
