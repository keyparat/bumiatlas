const DEFAULT_WMS = "https://geosvc.atrbpn.go.id/geoserver/wms";
const DEFAULT_PROXY = "https://bhumi.atrbpn.go.id/api/proksi";
function proxyHeadersAndBody(url) {
  const mode = process.env.BHUMI_PROXY_MODE || "raw-url";
  const field = process.env.BHUMI_PROXY_BODY_FIELD || "url";
  const headers = { Accept: "image/png, image/jpeg, application/xml, application/json" };
  let body;
  if (mode === "json-url") {
    headers["Content-Type"] = "application/json"; body = JSON.stringify({ [field]: url });
  } else if (mode === "form-url") {
    headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    body = new URLSearchParams({ [field]: url }).toString();
  } else if (mode === "raw-url") {
    headers["Content-Type"] = "text/plain;charset=UTF-8"; body = url;
  } else throw new Error("BHUMI_PROXY_MODE tidak dikenal.");
  if (process.env.BHUMI_PROXY_BEARER_TOKEN) headers.Authorization = "Bearer " + process.env.BHUMI_PROXY_BEARER_TOKEN;
  if (process.env.BHUMI_PROXY_COOKIE) headers.Cookie = process.env.BHUMI_PROXY_COOKIE;
  if (process.env.BHUMI_PROXY_AUTH_HEADER && process.env.BHUMI_PROXY_AUTH_VALUE) headers[process.env.BHUMI_PROXY_AUTH_HEADER] = process.env.BHUMI_PROXY_AUTH_VALUE;
  return { headers, body };
}
export async function fetchWms(params, mode = "auto") {
  const target = new URL(process.env.GEOSERVER_WMS_URL || DEFAULT_WMS);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, String(value));
  const url = target.toString();
  const timeout = Number(process.env.GEOSERVER_TIMEOUT_MS || 18000);
  async function direct() {
    const response = await fetch(url, { headers: { Accept: "image/png, image/jpeg, application/xml" }, signal: AbortSignal.timeout(timeout) });
    if (!response.ok) {
      const error = new Error("WMS direct HTTP " + response.status + ": " + (await response.text()).slice(0, 300));
      error.status = response.status; throw error;
    }
    return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "image/png", source: "direct" };
  }
  async function proxy() {
    const p = proxyHeadersAndBody(url);
    const response = await fetch(process.env.BHUMI_PROXY_URL || DEFAULT_PROXY, {
      method: "POST", ...p, signal: AbortSignal.timeout(timeout)
    });
    if (response.status === 401 || response.status === 403) {
      const error = new Error("BHUMI proxy menolak akses (HTTP " + response.status + "). Autentikasi resmi diperlukan.");
      error.status = response.status; throw error;
    }
    if (!response.ok) {
      const error = new Error("WMS proxy HTTP " + response.status + ": " + (await response.text()).slice(0, 300));
      error.status = response.status; throw error;
    }
    return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "image/png", source: "proxy" };
  }
  if (mode === "direct") return direct();
  if (mode === "proxy") return proxy();
  try { return await direct(); }
  catch (directError) {
    try { return await proxy(); }
    catch (proxyError) {
      const error = new Error("WMS direct dan proxy gagal. Direct: " + directError.message + " | Proxy: " + proxyError.message);
      error.status = proxyError.status || directError.status || 502; throw error;
    }
  }
}
