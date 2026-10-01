const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
    if (!GEMINI_API_KEY) {
      return json({
        ok: false,
        error: "GEMINI_API_KEY_MISSING",
        message: "GEMINI_API_KEY غير موجود في Vercel."
      }, 500);
    }

    const body = await request.json();

    let messages = [];

    if (Array.isArray(body.messages)) {
      messages = body.messages;
    } else if (typeof body.message === "string") {
      messages = [{
        role: "user",
        content: body.message
      }];
    } else if (typeof body.prompt === "string") {
      messages = [{
        role: "user",
        content: body.prompt
      }];
    }

    const history = messages
      .filter(
        m =>
          m &&
          typeof m.content === "string" &&
          m.content.trim()
      )
      .slice(-20)
      .map(m => ({
        role:
          m.role === "assistant" || m.role === "model"
            ? "model"
            : "user",
        parts: [
          {
            text: m.content.trim()
          }
        ]
      }));

    if (!history.length) {
      return json({
        ok: false,
        error: "NO_MESSAGES",
        message: "لم يتم استلام نص الرسالة من الواجهة."
      }, 400);
    }

    const model = "gemini-2.5-flash";

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 45000);

    let response;

    try {
      response = await fetch(url, {
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

    const data = await response.json();

    if (!response.ok) {
      console.error("GEMINI ERROR:", data);

      return json({
        ok: false,
        error: "GEMINI_API_ERROR",
        status: response.status,
        message:
          data?.error?.message ||
          "Gemini رفض الطلب."
      }, response.status);
    }

    const content =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "";

    if (!content.trim()) {
      return json({
        ok: false,
        error: "EMPTY_RESPONSE",
        message: "Gemini لم يرجع نصًا."
      }, 502);
    }

    return json({
      ok: true,
      model,
      content: content.trim()
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return json({
      ok: false,
      error: error.name === "AbortError"
        ? "TIMEOUT"
        : "SERVER_ERROR",
      message: error.message || "حدث خطأ غير معروف."
    }, 500);
  }
}
