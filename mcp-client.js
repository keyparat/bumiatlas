import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

export const MCP_URL = "https://bumiatlas.com/mcp";
const STORAGE_KEY = "bumiatlas.mcp.oauth.session.v1";

function readState() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function writeState(state) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

class BrowserOAuthProvider {
  constructor() { this.data = readState(); this.lastState = this.data.lastState; }
  get redirectUrl() { return `${window.location.origin}/mcp/callback`; }
  get clientMetadata() {
    return {
      client_name: "BumiAtlas GIS Editor",
      redirect_uris: [this.redirectUrl],
      application_type: "web"
    };
  }
  clientInformation(ctx) {
    return ctx?.issuer ? this.data.clients?.[ctx.issuer] : undefined;
  }
  saveClientInformation(info, ctx) {
    if (!ctx?.issuer) throw new Error("OAuth issuer context is missing.");
    this.data.clients ||= {};
    this.data.clients[ctx.issuer] = info;
    writeState(this.data);
  }
  tokens() { return this.data.tokens; }
  saveTokens(tokens) { this.data.tokens = tokens; writeState(this.data); }
  state() {
    this.lastState = crypto.randomUUID();
    this.data.lastState = this.lastState;
    writeState(this.data);
    return this.lastState;
  }
  saveDiscoveryState(discovery) { this.data.discovery = discovery; writeState(this.data); }
  discoveryState() { return this.data.discovery; }
  saveCodeVerifier(verifier) { this.data.verifier = verifier; writeState(this.data); }
  codeVerifier() {
    if (!this.data.verifier) throw new Error("OAuth PKCE verifier is missing.");
    return this.data.verifier;
  }
  redirectToAuthorization(url) { window.location.assign(url.href); }
  clear() { sessionStorage.removeItem(STORAGE_KEY); }
}

let activeClient = null;
let activeTransport = null;
let activeProvider = null;

function makeClient() {
  return new Client({ name: "bumiatlas-gis-editor", version: "0.3.0" });
}
function makeTransport(provider) {
  // Keep the browser's default redirect handling. Forcing redirect:"error"
  // turns ordinary HTTP redirects into an opaque "Failed to fetch" error.
  return new StreamableHTTPClientTransport(new URL(MCP_URL), {
    authProvider: provider
  });
}
async function connectExistingSession(provider) {
  const client = makeClient();
  const transport = makeTransport(provider);
  await client.connect(transport);
  activeClient = client;
  activeTransport = transport;
  activeProvider = provider;
  return client;
}
export async function connectBumiAtlas() {
  const provider = new BrowserOAuthProvider();
  try {
    const client = await connectExistingSession(provider);
    const tools = await client.listTools();
    return { connected: true, tools: tools.tools || [] };
  } catch (error) {
    if (error?.name === "UnauthorizedError") return { redirecting: true };
    throw error;
  }
}
export async function initializeBumiAtlas() {
  const provider = new BrowserOAuthProvider();
  const callback = window.location.pathname === "/mcp/callback";
  if (callback) {
    const params = new URLSearchParams(window.location.search);
    if (params.has("error")) {
      provider.clear();
      window.history.replaceState({}, "", "/");
      throw new Error("Otorisasi BumiAtlas ditolak atau dibatalkan.");
    }
    if (!params.has("code")) {
      window.history.replaceState({}, "", "/");
      return { connected: false };
    }
    if (!provider.lastState || params.get("state") !== provider.lastState) {
      provider.clear();
      window.history.replaceState({}, "", "/");
      throw new Error("Validasi state OAuth gagal. Silakan hubungkan ulang.");
    }
    const authTransport = makeTransport(provider);
    await authTransport.finishAuth(params);
    window.history.replaceState({}, "", "/");
    const client = await connectExistingSession(provider);
    const tools = await client.listTools();
    return { connected: true, tools: tools.tools || [] };
  }
  if (provider.tokens()) {
    try {
      const client = await connectExistingSession(provider);
      const tools = await client.listTools();
      return { connected: true, tools: tools.tools || [] };
    } catch (error) {
      if (error?.name === "UnauthorizedError") {
        provider.clear();
        return { connected: false, expired: true };
      }
      throw error;
    }
  }
  return { connected: false };
}
export async function callBumiAtlasTool(name, args) {
  if (!activeClient) throw new Error("Hubungkan akun BumiAtlas terlebih dahulu.");
  const result = await activeClient.callTool({ name, arguments: args });
  if (result?.isError) {
    const message = (result.content || []).map(item => item.text || "").join("\n");
    throw new Error(message || "Tool MCP mengembalikan kesalahan.");
  }
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const textContent = (result.content || []).filter(item => item.type === "text").map(item => item.text).join("\n");
  if (!textContent) return result;
  try { return JSON.parse(textContent); } catch { return { text: textContent }; }
}
export async function disconnectBumiAtlas() {
  try { await activeClient?.close(); } catch {}
  try { await activeTransport?.close(); } catch {}
  activeClient = null;
  activeTransport = null;
  activeProvider?.clear();
  activeProvider = null;
}
export function getBumiAtlasStatus() { return { connected: !!activeClient }; }
