import {
  BumiAtlasOAuthProvider, createMcpClient, getRedirectUri,
  getSession, sendJson, setSession
} from "../../lib/mcp-session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  const data = getSession(req);
  if (!data.tokens?.access_token) return sendJson(res, 401, { error: "Hubungkan akun BumiAtlas terlebih dahulu." });

  const chunks = [];
  try {
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    const name = String(body.name || "");
    const args = body.args && typeof body.args === "object" ? body.args : {};
    if (!["Parcel_search", "Parcel_get"].includes(name)) {
      return sendJson(res, 400, { error: "Tool MCP tidak diizinkan." });
    }

    const provider = new BumiAtlasOAuthProvider(data, getRedirectUri(req));
    let client, transport;
    try {
      ({ client, transport } = await createMcpClient(provider));
      await client.connect(transport);
      const result = await client.callTool({ name, arguments: args });
      setSession(res, provider.data, req);
      if (result?.isError) {
        const detail = (result.content || []).map(item => item.text || "").join("\n");
        return sendJson(res, 502, { error: detail || "Tool MCP mengembalikan kesalahan." });
      }
      return sendJson(res, 200, { result });
    } finally {
      try { await client?.close(); } catch {}
      try { await transport?.close(); } catch {}
    }
  } catch (error) {
    console.error("MCP tool request failed:", error);
    return sendJson(res, 502, {
      error: error instanceof Error ? error.message : "Permintaan MCP gagal."
    });
  }
}
