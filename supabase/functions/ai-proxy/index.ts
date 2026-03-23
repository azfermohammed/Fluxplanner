import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { system, messages, imageBase64, mimeType } = await req.json();
    if (!messages || !Array.isArray(messages)) return json({ error: "Invalid request" }, 400);

    // Image → Gemini Vision
    if (imageBase64) {
      const geminiKey = Deno.env.get("GEMINI_API_KEY");
      if (!geminiKey) return json({ error: "GEMINI_API_KEY not set in Supabase secrets" }, 500);

      const lastMsg = messages[messages.length - 1]?.content || "Please analyze this image.";
      const prompt = (system ? system + "\n\n" : "") + lastMsg;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
                { text: prompt }
              ]
            }]
          })
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return json({ error: `Gemini error: ${err?.error?.message || res.status}` }, 500);
      }

      const d = await res.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return json({ error: "Gemini returned no content. Check GEMINI_API_KEY." }, 500);
      return json({ content: [{ type: "text", text }] });
    }

    // Text → Groq
    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) return json({ error: "GROQ_API_KEY not set in Supabase secrets" }, 500);

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2048,
        messages: [...(system ? [{ role: "system", content: system }] : []), ...messages]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return json({ error: `Groq error: ${err?.error?.message || res.status}` }, 500);
    }

    const d = await res.json();
    const text = d.choices?.[0]?.message?.content;
    if (!text) return json({ error: "Groq returned no content" }, 500);
    return json({ content: [{ type: "text", text }] });

  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
