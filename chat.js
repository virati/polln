const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export default async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });

  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return json({ content: [{ type: "text", text: "Server error: GEMINI_API_KEY environment variable is not set." }] }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ content: [{ type: "text", text: "Invalid request body." }] }, 400);
  }

  // Anthropic uses "assistant"; Gemini uses "model"
  const contents = body.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const geminiBody = {
    system_instruction: { parts: [{ text: body.system }] },
    contents,
    generationConfig: { maxOutputTokens: 1000 },
  };

  let upstream, data;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      }
    );
    data = await upstream.json();
  } catch (err) {
    return json({ content: [{ type: "text", text: `Network error reaching Gemini: ${err.message}` }] }, 502);
  }

  // Surface any API-level error directly into the chat bubble so it's visible
  if (!upstream.ok || data.error) {
    const msg = data.error?.message ?? JSON.stringify(data);
    return json({ content: [{ type: "text", text: `Gemini API error (${upstream.status}): ${msg}` }] }, upstream.status);
  }

  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    `Gemini returned an unexpected structure: ${JSON.stringify(data)}`;

  return json({ content: [{ type: "text", text }] });
};

export const config = { path: "/api/chat" };
