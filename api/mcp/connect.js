import {
  BumiAtlasOAuthProvider, createMcpClient, getRedirectUri,
  getSession, sendJson, setSession
} from "../../lib/mcp-session.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  const provider = new BumiAtlasOAuthProvider(await getSession(req), getRedirectUri(req));
  let client, transport;
  try {
    ({ client, transport } = await createMcpClient(provider));
    await client.connect(transport);
    const tools = await client.listTools();
    await setSession(res, provider.data, req);
    return res.redirect(302, "/");
  } catch (error) {
    if (provider.authorizationUrl) {
      try { await setSession(res, provider.data, req); }
      catch (cookieError) { return sendJson(res, 500, { error: cookieError.message }); }
      return res.redirect(302, provider.authorizationUrl);
    }
    console.error("MCP connect failed:", error);
    return sendJson(res, 502, {
      error: "Koneksi ke BumiAtlas MCP gagal.",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    try { await client?.close(); } catch {}
    try { await transport?.close(); } catch {}
  }
}
