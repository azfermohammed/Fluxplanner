import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { imageBase64, mimeType, prompt } = await req.json();

    if (!imageBase64 || !prompt) {
      return new Response(JSON.stringify({ error: "Missing imageBase64 or prompt" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `Gemini API ${res.status}: ${err}` }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!text) {
      return new Response(JSON.stringify({ error: "Gemini returned empty response", raw: JSON.stringify(data) }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ text }), {
      headers: { ...cors, "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});
