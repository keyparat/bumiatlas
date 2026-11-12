import { randomBytes } from "node:crypto";
import { del, get, put } from "@vercel/blob";

export const MCP_URL = "https://bumiatlas.com/mcp";
export const SESSION_COOKIE = "bumiatlas_mcp_session";
const COOKIE_MAX_AGE = 60 * 60 * 8;
const SESSION_PREFIX = "oauth-sessions/";
const SESSION_TTL_MS = COOKIE_MAX_AGE * 1000;

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const pair = raw.split(";").map(v => v.trim()).find(v => v.startsWith(SESSION_COOKIE + "="));
  return pair ? decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1)) : "";
}

function cookieOptions(req, maxAge) {
  const forwarded = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const secure = forwarded === "https" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function getSession(req) {
  const id = parseCookies(req);
  if (!/^[a-f0-9]{64}$/.test(id)) return {};
  try {
    const result = await get(SESSION_PREFIX + id + ".json", {
      access: "private",
      useCache: false
    });
    if (!result || result.statusCode !== 200 || !result.stream) return {};
    const session = JSON.parse(await new Response(result.stream).text());
    if (!session.expiresAt || session.expiresAt < Date.now()) {
      await del(SESSION_PREFIX + id + ".json", { access: "private" }).catch(() => {});
      return {};
    }
    return session.data && typeof session.data === "object" ? session.data : {};
  } catch (error) {
    console.error("MCP session read failed:", error);
    return {};
  }
}

export async function setSession(res, data, req) {
  let id = parseCookies(req);
  if (!/^[a-f0-9]{64}$/.test(id)) id = randomBytes(32).toString("hex");
  const record = {
    data,
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  await put(SESSION_PREFIX + id + ".json", JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0
  });
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${id}; ${cookieOptions(req, COOKIE_MAX_AGE)}`);
}

export async function clearSession(req, res) {
  const id = parseCookies(req);
  if (/^[a-f0-9]{64}$/.test(id)) {
    await del(SESSION_PREFIX + id + ".json", { access: "private" }).catch(error => {
      console.error("MCP session delete failed:", error);
    });
  }
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; ${cookieOptions(req, 0)}`);
}

export class BumiAtlasOAuthProvider {
  constructor(data = {}, redirectUrl) {
    this.data = data;
    this.redirectUrl = redirectUrl;
    this.authorizationUrl = null;
  }
  get clientMetadata() {
    return {
      client_name: "BumiAtlas GIS Editor",
      redirect_uris: [this.redirectUrl],
      application_type: "web",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    };
  }
  clientInformation(ctx) {
    return ctx?.issuer ? this.data.clients?.[ctx.issuer] : undefined;
  }
  saveClientInformation(info, ctx) {
    if (!ctx?.issuer) throw new Error("OAuth issuer context is missing.");
    this.data.clients ||= {};
    this.data.clients[ctx.issuer] = info;
  }
  tokens() { return this.data.tokens; }
  saveTokens(tokens) { this.data.tokens = tokens; }
  state() {
    this.data.lastState = randomBytes(24).toString("base64url");
    return this.data.lastState;
  }
  saveDiscoveryState(value) { this.data.discovery = value; }
  discoveryState() { return this.data.discovery; }
  saveCodeVerifier(value) { this.data.verifier = value; }
  codeVerifier() {
    if (!this.data.verifier) throw new Error("OAuth PKCE verifier tidak ditemukan.");
    return this.data.verifier;
  }
  redirectToAuthorization(url) { this.authorizationUrl = url.toString(); }
  clear() { this.data = {}; }
}

export function getRedirectUri(req) {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host;
  if (!host || !/^[a-z0-9.-]+(?::\\d+)?$/i.test(host)) {
    throw new Error("Host callback OAuth tidak valid.");
  }
  const protoHeader = req.headers["x-forwarded-proto"] || "https";
  const proto = String(protoHeader).split(",")[0].trim() === "http" ? "http" : "https";
  return `${proto}://${host}/api/mcp/callback`;
}

export async function createMcpClient(provider) {
  const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
  const client = new Client({ name: "bumiatlas-gis-editor", version: "0.4.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider });
  return { client, transport };
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function isSameOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const expected = new URL(getRedirectUri(req)).origin;
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}
