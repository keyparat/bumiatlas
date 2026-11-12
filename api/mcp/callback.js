import {
  BumiAtlasOAuthProvider, createMcpClient, getRedirectUri,
  getSession, sendJson, setSession, clearSession
} from "../../lib/mcp-session.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  const params = new URL(req.url, "https://local.invalid").searchParams;
  if (params.has("error")) {
    await clearSession(req, res);
    return res.redirect(302, "/?mcp_error=authorization_denied");
  }

  const data = await getSession(req);
  if (!data.lastState || params.get("state") !== data.lastState) {
    clearSession(res);
    return res.redirect(302, "/?mcp_error=invalid_oauth_state");
  }

  const provider = new BumiAtlasOAuthProvider(data, getRedirectUri(req));
  let client, transport;
  try {
    ({ client, transport } = await createMcpClient(provider));
    await transport.finishAuth(params);
    await setSession(res, provider.data, req);
    return res.redirect(302, "/");
  } catch (error) {
    console.error("MCP OAuth callback failed:", error);
    clearSession(res);
    return res.redirect(302, "/?mcp_error=oauth_callback_failed");
  } finally {
    try { await client?.close(); } catch {}
    try { await transport?.close(); } catch {}
  }
}
