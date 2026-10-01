const API_URL =
  "https://chatapi.begamob.com/api/v2/chatCustom";

const AVAILABLE_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "deepseek",
  "gemini-2.0-flash"
];

const REQUEST_TIMEOUT = 30000; // 30 ثانية

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}


/* =========================================================
   GET
   ========================================================= */

export async function GET() {
  return json({
    ok: true,
    service: "NOVA AI",
    status: "online"
  });
}


/* =========================================================
   POST
   ========================================================= */

export async function POST(request) {

  try {

    /* -----------------------------------------------------
       Authorization من Vercel
       ----------------------------------------------------- */

    const authorization =
      process.env.BEGAMOB_AUTHORIZATION || "";

    if (!authorization) {
      return json({
        ok: false,
        error:
          "BEGAMOB_AUTHORIZATION غير موجود في Vercel."
      }, 500);
    }


    /* -----------------------------------------------------
       قراءة JSON
       ----------------------------------------------------- */

    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        ok: false,
        error: "البيانات المرسلة ليست JSON صحيحة."
      }, 400);
    }


    /* -----------------------------------------------------
       الرسالة
       ----------------------------------------------------- */

    const message =
      typeof body?.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return json({
        ok: false,
        error: "الرسالة فارغة."
      }, 400);
    }


    /* -----------------------------------------------------
       Model
       ----------------------------------------------------- */

    let model =
      typeof body?.model === "string"
        ? body.model
        : "gpt-4o";

    if (!AVAILABLE_MODELS.includes(model)) {
      model = "gpt-4o";
    }


    /* -----------------------------------------------------
       History
       ----------------------------------------------------- */

    let history =
      Array.isArray(body?.history)
        ? body.history
        : [];

    history = history
      .filter(item =>
        item &&
        typeof item.content === "string" &&
        (
          item.role === "user" ||
          item.role === "assistant"
        )
      )
      .slice(-20);


    const messages = history.map(item => ({
      role: item.role,
      content: item.content
    }));


    /* -----------------------------------------------------
       إضافة الرسالة الحالية
       ----------------------------------------------------- */

    if (
      !messages.length ||
      messages[messages.length - 1].content !== message
    ) {
      messages.push({
        role: "user",
        content: message
      });
    }


    /* -----------------------------------------------------
       Payload
       ----------------------------------------------------- */

    const payload = {
      max_tokens: 4000,
      messages,
      model
    };


    /* -----------------------------------------------------
       Timeout
       ----------------------------------------------------- */

    const controller =
      new AbortController();

    const timeout =
      setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT);


    /* -----------------------------------------------------
       الاتصال بالخدمة الخارجية
       ----------------------------------------------------- */

    let response;

    try {

      response = await fetch(API_URL, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "authorization": authorization,

          "user-header":
            "bundleId:com.chatbot.ai.aichat.openaibot.chat/versionApp:35.0.2/OS:Android/osVersion:36/userId:BERO",

          "Accept-Encoding": "gzip",

          "User-Agent": "okhttp/4.12.0"
        },

        body: JSON.stringify(payload),

        signal: controller.signal
      });

    } catch (error) {

      clearTimeout(timeout);

      if (error?.name === "AbortError") {
        return json({
          ok: false,
          error:
            "الخدمة الخارجية لم تستجب خلال 30 ثانية."
        }, 504);
      }

      return json({
        ok: false,
        error:
          error?.message ||
          "فشل الاتصال بالخدمة الخارجية."
      }, 502);
    }

    clearTimeout(timeout);


    /* -----------------------------------------------------
       قراءة الرد
       ----------------------------------------------------- */

    const rawText =
      await response.text();


    /* -----------------------------------------------------
       JSON
       ----------------------------------------------------- */

    let data;

    try {

      data =
        JSON.parse(rawText);

    } catch {

      return json({
        ok: false,
        error:
          "الخدمة الخارجية أرسلت استجابة غير JSON.",
        status: response.status
      }, 502);
    }


    /* -----------------------------------------------------
       أخطاء الخدمة الخارجية
       ----------------------------------------------------- */

    if (!response.ok) {

      let errorMessage =
        data?.error?.message ||
        data?.error ||
        data?.message ||
        `الخدمة الخارجية رفضت الطلب (${response.status}).`;

      if (
        typeof errorMessage !== "string"
      ) {
        errorMessage =
          `الخدمة الخارجية رفضت الطلب (${response.status}).`;
      }

      return json({
        ok: false,
        error: errorMessage,
        status: response.status
      }, 502);
    }


    /* -----------------------------------------------------
       استخراج الرد
       ----------------------------------------------------- */

    let reply = "";


    if (
      Array.isArray(data?.choices) &&
      data.choices[0]?.message?.content
    ) {

      reply =
        data.choices[0].message.content;

    }


    else if (
      typeof data?.data === "string"
    ) {

      reply =
        data.data;

    }


    else if (
      typeof data?.content === "string"
    ) {

      reply =
        data.content;

    }


    else if (
      typeof data?.reply === "string"
    ) {

      reply =
        data.reply;

    }


    /* -----------------------------------------------------
       لم نستلم جواب
       ----------------------------------------------------- */

    if (!reply) {

      return json({
        ok: false,
        error:
          "تم الاتصال بالخدمة لكن لم يتم استلام نص الرد.",
        response: data
      }, 502);
    }


    /* -----------------------------------------------------
       نجاح
       ----------------------------------------------------- */

    return json({
      ok: true,
      reply,
      model
    });


  } catch (error) {

    console.error(
      "NOVA AI ERROR:",
      error
    );

    return json({
      ok: false,
      error:
        error?.message ||
        "حدث خطأ داخلي في الخادم."
    }, 500);
  }
}
