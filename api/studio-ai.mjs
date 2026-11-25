export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const geminiKey = process.env.GEMINI_API_KEY || "";
  const groqKey = process.env.GROQ_API_KEY || "";
  const openrouterKey = process.env.OPENROUTER_API_KEY || "";
  const pexelsKey = process.env.PEXELS_API_KEY || "";

  if (req.method === "GET") {
    return res.status(200).json({
      configured: Boolean(geminiKey || groqKey || openrouterKey),
      providers: {
        gemini: Boolean(geminiKey),
        groq: Boolean(groqKey),
        openrouter: Boolean(openrouterKey),
        pexels: Boolean(pexelsKey),
      },
      recommendedModel: geminiKey
        ? "gemini-2.5-flash"
        : groqKey
          ? "llama-3.3-70b-versatile"
          : "google/gemini-2.0-flash-exp:free",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const action = body.action || "chat";

  if (action === "stock" && pexelsKey) {
    const query = String(body.query || "cinema").slice(0, 120);
    const orientation = body.orientation === "portrait" ? "portrait" : "landscape";
    try {
      const pexelsRes = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=4`,
        { headers: { Authorization: pexelsKey } },
      );
      if (!pexelsRes.ok) {
        return res.status(pexelsRes.status).json({ error: "Pexels request failed" });
      }
      const data = await pexelsRes.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(502).json({ error: err instanceof Error ? err.message : "Stock search error" });
    }
  }

  let endpoint = "";
  let apiKey = "";
  let defaultModel = "";

  if (geminiKey) {
    endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    apiKey = geminiKey;
    defaultModel = "gemini-2.5-flash";
  } else if (groqKey) {
    endpoint = "https://api.groq.com/openai/v1/chat/completions";
    apiKey = groqKey;
    defaultModel = "llama-3.3-70b-versatile";
  } else if (openrouterKey) {
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
    apiKey = openrouterKey;
    defaultModel = "google/gemini-2.0-flash-exp:free";
  } else {
    return res.status(503).json({
      error: "missing_server_key",
      message: "Nenhuma variável de ambiente (GEMINI_API_KEY ou GROQ_API_KEY) foi configurada no painel da Vercel.",
    });
  }

  try {
    const payload = {
      model: typeof body.model === "string" && body.model.trim() && body.model !== "server-auto" ? body.model : defaultModel,
      messages: Array.isArray(body.messages) ? body.messages : [],
      temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 2048,
    };
    if (Array.isArray(body.tools) && body.tools.length > 0) {
      payload.tools = body.tools;
    }
    if (body.tool_choice !== undefined) {
      payload.tool_choice = body.tool_choice;
    }

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(text);
  } catch (err) {
    return res.status(502).json({
      error: "upstream_failed",
      message: err instanceof Error ? err.message : "Failed to reach provider",
    });
  }
}
