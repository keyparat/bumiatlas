export const MCP_URL = "https://bumiatlas.com/mcp";

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Permintaan backend gagal (HTTP ${response.status}).`);
  }
  return data;
}

export async function connectBumiAtlas() {
  // OAuth authorization and callback are handled by Vercel, not the browser.
  window.location.assign("/api/mcp/connect");
  return { redirecting: true };
}

export async function initializeBumiAtlas() {
  const params = new URLSearchParams(window.location.search);
  const callbackError = params.get("mcp_error");
  if (callbackError) {
    window.history.replaceState({}, "", "/");
    return { connected: false, error: callbackError };
  }
  return api("/api/mcp/status");
}

export async function callBumiAtlasTool(name, args) {
  const data = await api("/api/mcp/tools", {
    method: "POST",
    body: JSON.stringify({ name, args })
  });
  const result = data.result;
  if (result?.isError) {
    const message = (result.content || []).map(item => item.text || "").join("\n");
    throw new Error(message || "Tool MCP mengembalikan kesalahan.");
  }
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const textContent = (result?.content || [])
    .filter(item => item.type === "text")
    .map(item => item.text)
    .join("\n");
  if (!textContent) return result;
  try { return JSON.parse(textContent); } catch { return { text: textContent }; }
}

export async function disconnectBumiAtlas() {
  await api("/api/mcp/disconnect", { method: "POST" });
}

export function getBumiAtlasStatus() {
  return { connected: false };
}
