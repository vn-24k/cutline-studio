const ALLOWED_HOSTS = new Set([
  "upload.wikimedia.org",
  "thumb.wikimedia.org",
  "images.pexels.com",
  "videos.pexels.com",
  "player.vimeo.com",
]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawUrl = typeof req.query?.url === "string" ? req.query.url : "";
  if (!rawUrl) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: "Invalid url" });
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(403).json({ error: "Host not allowed" });
  }

  try {
    const upstream = await fetch(parsed.href, {
      headers: { "User-Agent": "CutlineStudio/1.0 (https://github.com/vn-24k/cutline-studio)" },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : "Proxy fetch failed" });
  }
}
