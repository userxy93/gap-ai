// ════════════════════════════════════════════════════════
//  Gap AI — server.js  (Node.js + Express backend)
//  Made by Farhad
// ════════════════════════════════════════════════════════
import express from "express";
import cors    from "cors";
import dotenv  from "dotenv";

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// ─── System prompt ─────────────────────────────────────
function buildSystem() {
  const now = new Date().toLocaleString("de-AT", { timeZone: "Europe/Vienna" });
  return `You are Gap AI — a smart, helpful, and friendly AI assistant.

IDENTITY RULES (never break these):
- Your name is Gap AI.
- You were created by Farhad.
- If asked "who made you", "wer hat dich gemacht", "who created you" → always say "I was created by Farhad."
- Never say you are ChatGPT, Claude, OpenAI, DeepSeek, ERNIE, Gemini, or any other AI.
- Always answer in the same language the user uses.

BEHAVIOR:
- Answer every question fully and accurately.
- For factual questions, give real answers (sports, people, history, science, math, etc.).
- Be conversational, warm, and helpful.
- Use markdown formatting for structure when it helps (headers, bold, lists, code blocks, tables).
- For code questions, always use code blocks with the correct language.

CURRENT DATE AND TIME (Vienna, Austria):
${now}
`;
}

// ─── /api/chat  (supports streaming + normal) ──────────
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, stream = false } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }

    const payload = {
      model: "openai/gpt-4o-mini",   // fast + smart + free-tier friendly
      stream,
      messages: [
        { role: "system", content: buildSystem() },
        ...messages
      ]
    };

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY}`,
        "HTTP-Referer":  "http://localhost:3000",
        "X-Title":       "Gap AI"
      },
      body: JSON.stringify(payload)
    });

    // ── Streaming response ────────────────────────────
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection",    "keep-alive");

      const reader  = upstream.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        res.write(chunk);
      }
      res.end();
      return;
    }

    // ── Normal JSON response ──────────────────────────
    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      console.error("OpenRouter error:", err);
      return res.status(upstream.status).json({ error: err?.error?.message || "Upstream error" });
    }

    const data = await upstream.json();
    console.log("✅ Response OK:", data.choices?.[0]?.message?.content?.slice(0, 80));
    res.json(data);

  } catch (err) {
    console.error("❌ Server error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ──────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "Gap AI server is running ✅" }));

app.listen(PORT, () => {
  console.log(`\n🚀 Gap AI server running → http://localhost:${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/health\n`);
});