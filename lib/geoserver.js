const DEFAULT_WFS = "https://geosvc.atrbpn.go.id/geoserver/wfs";
const DEFAULT_PROXY = "https://bhumi.atrbpn.go.id/api/proksi";
const DEFAULT_LAYER = "umum:Persil";
const MAX_FEATURES = 2000;

function config() {
  return {
    wfs: process.env.GEOSERVER_WFS_URL || DEFAULT_WFS,
    proxy: process.env.BHUMI_PROXY_URL || DEFAULT_PROXY,
    proxyMode: process.env.BHUMI_PROXY_MODE || "raw-url",
    proxyBodyField: process.env.BHUMI_PROXY_BODY_FIELD || "url",
    layer: process.env.GEOSERVER_LAYER || DEFAULT_LAYER,
    searchFields: (process.env.GEOSERVER_SEARCH_FIELDS || "NIB,NOMOR,KECAMATAN,KELURAHAN").split(",").map(v => v.trim()).filter(Boolean)
  };
}
function safeLayerName(value) {
  if (!/^[a-zA-Z0-9_:-]+$/.test(value || "")) throw new Error("Nama layer tidak valid.");
  return value;
}
function quoteCql(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "''");
}
function parseResponse(text, contentType) {
  if (!text) return {};
  if (contentType.includes("json") || /^[\s]*[\[{]/.test(text)) {
    const value = JSON.parse(text);
    if (value && typeof value === "object") {
      if (value.features || value.type === "FeatureCollection") return value;
      if (value.data && typeof value.data === "object") return value.data;
      if (value.result && typeof value.result === "object") return value.result;
    }
    return value;
  }
  if (text.trimStart().startsWith("<")) return { _xml: text };
  throw new Error("Respons GeoServer bukan GeoJSON/JSON yang dikenali.");
}
async function readResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    const error = new Error("GeoServer HTTP " + response.status + (text ? ": " + text.slice(0, 400) : ""));
    error.status = response.status;
    throw error;
  }
  return parseResponse(text, response.headers.get("content-type") || "");
}
function targetUrl(params) {
  const url = new URL(config().wfs);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}
async function directFetch(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json, application/geo+json, application/xml;q=0.8, text/xml;q=0.7" },
    signal: AbortSignal.timeout(Number(process.env.GEOSERVER_TIMEOUT_MS || 18000))
  });
  return readResponse(response);
}
async function proxyFetch(url) {
  const c = config();
  const headers = { Accept: "application/json, application/geo+json, application/xml;q=0.8" };
  let body;
  if (c.proxyMode === "json-url") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ [c.proxyBodyField]: url });
  } else if (c.proxyMode === "form-url") {
    headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    body = new URLSearchParams({ [c.proxyBodyField]: url }).toString();
  } else if (c.proxyMode === "raw-url") {
    headers["Content-Type"] = "text/plain;charset=UTF-8";
    body = url;
  } else {
    throw new Error("BHUMI_PROXY_MODE harus raw-url, json-url, atau form-url.");
  }
  if (process.env.BHUMI_PROXY_BEARER_TOKEN) headers.Authorization = "Bearer " + process.env.BHUMI_PROXY_BEARER_TOKEN;
  if (process.env.BHUMI_PROXY_COOKIE) headers.Cookie = process.env.BHUMI_PROXY_COOKIE;
  if (process.env.BHUMI_PROXY_AUTH_HEADER && process.env.BHUMI_PROXY_AUTH_VALUE) {
    headers[process.env.BHUMI_PROXY_AUTH_HEADER] = process.env.BHUMI_PROXY_AUTH_VALUE;
  }
  const response = await fetch(c.proxy, {
    method: "POST", headers, body,
    signal: AbortSignal.timeout(Number(process.env.GEOSERVER_TIMEOUT_MS || 18000))
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("BHUMI proxy menolak akses (HTTP " + response.status + "). Konfigurasikan autentikasi resmi pada environment Vercel.");
    error.status = response.status;
    throw error;
  }
  return readResponse(response);
}
async function request(params, mode = "auto") {
  const url = targetUrl(params);
  if (!["auto", "direct", "proxy"].includes(mode)) throw new Error("Mode harus auto, direct, atau proxy.");
  if (mode === "direct") return { data: await directFetch(url), source: "direct" };
  if (mode === "proxy") return { data: await proxyFetch(url), source: "proxy" };
  try {
    return { data: await directFetch(url), source: "direct" };
  } catch (directError) {
    try {
      return { data: await proxyFetch(url), source: "proxy", directError: directError.message };
    } catch (proxyError) {
      const error = new Error("Akses GeoServer gagal melalui jalur direct dan proxy. Direct: " + directError.message + " | Proxy: " + proxyError.message);
      error.status = proxyError.status || directError.status || 502;
      throw error;
    }
  }
}
function featureTypeNames(xml) {
  return [...xml.matchAll(/<FeatureType\b[\s\S]*?<Name>([^<]+)<\/Name>/gi)].map(m => m[1].trim());
}
function schemaFields(xml) {
  return [...xml.matchAll(/<xsd:element\b[^>]*\bname=["']([^"']+)["'][^>]*\btype=["']([^"']+)["'][^>]*\/?>/gi)]
    .map(m => ({ name: m[1], type: m[2] }));
}
export async function geoserverStatus(mode = "auto") {
  const result = await request({ service: "WFS", version: "2.0.0", request: "GetCapabilities" }, mode);
  const xml = result.data._xml || "";
  return { connected: true, source: result.source, layer: config().layer, layers: featureTypeNames(xml) };
}
export async function listLayers(mode = "auto") {
  const result = await request({ service: "WFS", version: "2.0.0", request: "GetCapabilities" }, mode);
  const xml = result.data._xml || "";
  return { source: result.source, layers: featureTypeNames(xml) };
}
export async function describeLayer(layer = config().layer, mode = "auto") {
  safeLayerName(layer);
  const result = await request({ service: "WFS", version: "2.0.0", request: "DescribeFeatureType", typeNames: layer }, mode);
  const xml = result.data._xml || "";
  return { layer, source: result.source, fields: schemaFields(xml), schema: xml || result.data };
}
export async function getFeatures({ layer = config().layer, bbox, limit = 500, cqlFilter, mode = "auto" } = {}) {
  safeLayerName(layer);
  const count = Math.max(1, Math.min(Number(limit) || 500, MAX_FEATURES));
  const params = {
    service: "WFS", version: "2.0.0", request: "GetFeature",
    typeNames: layer, outputFormat: "application/json", srsName: "EPSG:4326", count
  };
  if (bbox) {
    const values = Array.isArray(bbox) ? bbox : String(bbox).split(",").map(Number);
    if (values.length !== 4 || values.some(v => !Number.isFinite(v)) ||
      values[0] < -180 || values[2] > 180 || values[1] < -90 || values[3] > 90 ||
      values[0] >= values[2] || values[1] >= values[3]) {
      throw new Error("BBOX harus minLon,minLat,maxLon,maxLat dalam EPSG:4326.");
    }
    params.bbox = values.join(",") + ",EPSG:4326";
  }
  if (cqlFilter) params.CQL_FILTER = cqlFilter;
  const result = await request(params, mode);
  const data = result.data;
  if (data._xml) throw new Error("GeoServer mengembalikan XML, bukan GeoJSON. Periksa outputFormat dan hak akses WFS.");
  if (!data || !Array.isArray(data.features)) throw new Error("Respons WFS tidak berisi FeatureCollection.");
  return {
    type: "FeatureCollection", features: data.features,
    numberReturned: data.numberReturned ?? data.features.length,
    totalFeatures: data.totalFeatures ?? data.features.length,
    source: result.source, layer
  };
}
export async function searchParcels({ query, field = "NIB", limit = 50, mode = "auto" } = {}) {
  const c = config();
  if (!query || String(query).trim().length < 2) throw new Error("Kata pencarian minimal 2 karakter.");
  if (!c.searchFields.includes(field)) throw new Error("Field pencarian tidak diizinkan: " + field);
  const value = quoteCql(String(query).trim());
  const filter = field === "NIB" || field === "NOMOR"
    ? field + " = '" + value + "'"
    : field + " ILIKE '%" + value + "%'";
  return getFeatures({ cqlFilter: filter, limit, mode });
}
export async function getParcelByNIB({ nib, limit = 10, mode = "auto" } = {}) {
  if (!nib || !/^[0-9A-Za-z./_-]{3,80}$/.test(String(nib))) throw new Error("Format NIB tidak valid.");
  return searchParcels({ query: nib, field: "NIB", limit, mode });
}
function ringArea(ring) {
  const radius = 6371008.8;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    sum += (Number(b[0]) - Number(a[0])) * Math.PI / 180 *
      (2 + Math.sin(Number(a[1]) * Math.PI / 180) + Math.sin(Number(b[1]) * Math.PI / 180));
  }
  return Math.abs(sum * radius * radius / 2);
}
function geometryArea(geometry) {
  if (!geometry) return 0;
  const polygon = rings => Math.max(0, ringArea(rings[0] || []) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0));
  if (geometry.type === "Polygon") return polygon(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.reduce((s, rings) => s + polygon(rings), 0);
  if (geometry.type === "GeometryCollection") return geometry.geometries.reduce((s, g) => s + geometryArea(g), 0);
  return 0;
}
export function calculateAreas(collection) {
  return (collection.features || []).map(feature => ({
    id: feature.id || null, properties: feature.properties || {},
    area_m2: Math.round(geometryArea(feature.geometry) * 100) / 100,
    geometry_type: feature.geometry?.type || null
  }));
}
function escapeXml(value) {
  return String(value ?? "").replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
}
export function toKml(collection) {
  const placemarks = (collection.features || []).map((f, i) => {
    const p = f.properties || {};
    const name = p.NIB || p.NOMOR || f.id || "Bidang " + (i + 1);
    const geometry = f.geometry;
    if (!geometry) return "";
    const coords = ring => ring.map(xy => Number(xy[0]) + "," + Number(xy[1]) + ",0").join(" ");
    let geom = "";
    if (geometry.type === "Polygon") {
      geom = "<Polygon><outerBoundaryIs><LinearRing><coordinates>" + coords(geometry.coordinates[0]) + "</coordinates></LinearRing></outerBoundaryIs></Polygon>";
    } else if (geometry.type === "MultiPolygon") {
      geom = "<MultiGeometry>" + geometry.coordinates.map(poly => "<Polygon><outerBoundaryIs><LinearRing><coordinates>" + coords(poly[0]) + "</coordinates></LinearRing></outerBoundaryIs></Polygon>").join("") + "</MultiGeometry>";
    }
    return "<Placemark><name>" + escapeXml(name) + "</name><description>" + escapeXml(JSON.stringify(p)) + "</description>" + geom + "</Placemark>";
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' + placemarks + "</Document></kml>";
}
export function publicConfig() {
  const c = config();
  return { layer: c.layer, directEndpoint: c.wfs, proxyEndpoint: c.proxy, proxyMode: c.proxyMode, searchFields: c.searchFields };
}
