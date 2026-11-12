import { clearSession, sendJson } from "../../lib/mcp-session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
  clearSession(res);
  return sendJson(res, 200, { connected: false });
}
