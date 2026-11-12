import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

export const MCP_URL = "https://bumiatlas.com/mcp";
export const SESSION_COOKIE = "bumiatlas_mcp_session";
const COOKIE_MAX_AGE = 60 * 60 * 8;

function secretKey() {
  const secret = process.env.MCP_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MCP_SESSION_SECRET belum dikonfigurasi di Vercel.");
  }
  return createHash("sha256").update(secret).digest();
}

export function sealSession(data) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function openSession(value) {
  if (!value) return {};
  try {
    const packed = Buffer.from(value, "base64url");
    if (packed.length < 29) return {};
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
  } catch {
    return {};
  }
}

export function getSession(req) {
  const raw = req.headers.cookie || "";
  const pair = raw.split(";").map(v => v.trim()).find(v => v.startsWith(SESSION_COOKIE + "="));
  return openSession(pair ? decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1)) : "");
}

export function setSession(res, data, req) {
  const value = sealSession(data);
  if (value.length > 3800) {
    throw new Error("Sesi OAuth terlalu besar untuk cookie aman. Diperlukan penyimpanan sesi server.");
  }
  const secure = (req.headers["x-forwarded-proto"] || "https") === "https" ? "; Secure" : "";
  res.setHeader("Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`
  );
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
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
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    throw new Error("Host callback OAuth tidak valid.");
  }
  const protoHeader = req.headers["x-forwarded-proto"] || "https";
  const proto = String(protoHeader).split(",")[0].trim() === "http" ? "http" : "https";
  return `${proto}://${host}/api/mcp/callback`;
}

export async function createMcpClient(provider) {
  const { Client } = await import("@modelcontextprotocol/client");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
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
