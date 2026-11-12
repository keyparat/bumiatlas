import { clearSession, isSameOriginRequest, sendJson } from "../../lib/mcp-session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  if (!isSameOriginRequest(req)) return sendJson(res, 403, { error: "Permintaan lintas origin ditolak." });
  await clearSession(req, res);
  return sendJson(res, 200, { connected: false });
}
