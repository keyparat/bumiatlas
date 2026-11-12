import {
  BumiAtlasOAuthProvider, createMcpClient, getRedirectUri,
  getSession, sendJson, setSession
} from "../../lib/mcp-session.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  const data = await getSession(req);
  if (!data.tokens?.access_token) return sendJson(res, 200, { connected: false });

  const provider = new BumiAtlasOAuthProvider(data, getRedirectUri(req));
  let client, transport;
  try {
    ({ client, transport } = await createMcpClient(provider));
    await client.connect(transport);
    const result = await client.listTools();
    await setSession(res, provider.data, req);
    return sendJson(res, 200, { connected: true, tools: result.tools || [] });
  } catch (error) {
    console.error("MCP status check failed:", error);
    return sendJson(res, 200, { connected: false, expired: true });
  } finally {
    try { await client?.close(); } catch {}
    try { await transport?.close(); } catch {}
  }
}
