// Same-origin relay for BumiAtlas MCP and OAuth metadata/token HTTP requests.
// This avoids browser CORS restrictions without turning this endpoint into an open proxy.
export const config = { api: { bodyParser: false } };

const UPSTREAM_ORIGIN = "https://bumiatlas.com";
const ALLOWED_METHODS = new Set(["GET", "POST", "DELETE", "OPTIONS"]);
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "last-event-id",
  "mcp-protocol-version",
  "mcp-session-id",
  "origin",
  "pragma",
  "cache-control"
];
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "www-authenticate",
  "mcp-protocol-version",
  "mcp-session-id",
  "last-event-id",
  "location",
  "retry-after"
];

export default async function handler(req, res) {
  if (!ALLOWED_METHODS.has(req.method || "GET")) {
    res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const incoming = new URL(req.url || "/", "https://vercel.invalid");
  const prefix = "/api/mcp-proxy";
  if (!incoming.pathname.startsWith(prefix + "/")) {
    return res.status(404).json({ error: "Not found" });
  }

  const upstreamPath = incoming.pathname.slice(prefix.length);
  if (
    !upstreamPath.startsWith("/") ||
    upstreamPath.includes("\\") ||
    upstreamPath.split("/").some((part) => part === "." || part === "..")
  ) {
    return res.status(400).json({ error: "Invalid upstream path" });
  }

  const upstreamUrl = new URL(upstreamPath + incoming.search, UPSTREAM_ORIGIN);
  if (upstreamUrl.origin !== UPSTREAM_ORIGIN) {
    return res.status(400).json({ error: "Invalid upstream host" });
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === "string") headers.set(name, value);
  }

  // The proxy is same-origin from the browser's perspective. Do not forward the
  // Vercel site's Origin header to the upstream service as an authorization signal.
  headers.delete("origin");

  try {
    const init = {
      method: req.method,
      headers,
      redirect: "follow"
    };
    if (req.method !== "GET" && req.method !== "OPTIONS" && req.body) {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      init.body = Buffer.concat(chunks);
    }

    const upstream = await fetch(upstreamUrl, init);
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(upstream.status);

    if (req.method === "HEAD" || upstream.status === 204 || upstream.status === 304) {
      return res.end();
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Length", String(body.length));
    return res.end(body);
  } catch (error) {
    console.error("BumiAtlas MCP proxy error:", error);
    return res.status(502).json({
      error: "Upstream BumiAtlas service could not be reached",
      detail: error instanceof Error ? error.message : "Unknown upstream error"
    });
  }
}
