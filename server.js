// ════════════════════════════════════════════════════════
//  Gap AI — server.js
//  Made by Farhad
// ════════════════════════════════════════════════════════

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

function buildSystem() {
  const now = new Date().toLocaleString("de-AT", {
    timeZone: "Europe/Vienna"
  });

  return `
You are Gap AI.

IDENTITY:
- Your name is Gap AI.
- You were created by Farhad.
- If the user asks who made you, answer: "I was created by Farhad."
- If the user asks in German, answer: "Ich wurde von Farhad erstellt."
- Never say you are ChatGPT, Claude, OpenAI, DeepSeek, ERNIE, Gemini, or another AI.

BEHAVIOR:
- Answer in the same language as the user.
- Be helpful, clear, and beginner-friendly.
- Use markdown when useful.
- For code, always use code blocks.

CURRENT DATE AND TIME:
${now}
`;
}

app.get("/", (req, res) => {
  res.send("Gap AI backend is running ✅");
});

app.get("/health", (req, res) => {
  res.json({
    status: "Gap AI server is running ✅",
    time: new Date().toISOString()
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, stream = false } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: "messages array required"
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENROUTER_API_KEY in Render environment variables"
      });
    }

    const payload = {
      model: "openrouter/free",
      stream,
      messages: [
        {
          role: "system",
          content: buildSystem()
        },
        ...messages
      ]
    };

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://gap-ai.onrender.com",
        "X-Title": "Gap AI"
      },
      body: JSON.stringify(payload)
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error("OpenRouter error:", text);

      return res.status(upstream.status).json({
        error: text || "OpenRouter error"
      });
    }

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value));
      }

      res.end();
      return;
    }

    const data = await upstream.json();
    res.json(data);

  } catch (err) {
    console.error("Server error:", err);

    res.status(500).json({
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Gap AI server running on port ${PORT}`);
});