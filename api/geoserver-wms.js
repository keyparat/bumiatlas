import { fetchWms } from "../lib/geoserver-wms.js";
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405; res.setHeader("Allow", "GET"); return res.end();
  }
  const q = new URL(req.url, "https://local.invalid").searchParams;
  const mode = q.get("mode") || "auto";
  const request = (q.get("REQUEST") || q.get("request") || "GetMap").toLowerCase();
  const params = {
    service: "WMS",
    version: q.get("version") || "1.1.1",
    request: request === "getcapabilities" ? "GetCapabilities" : "GetMap",
    layers: q.get("layers") || process.env.GEOSERVER_LAYER || "umum:Persil",
    styles: q.get("styles") || "",
    format: q.get("format") || "image/png",
    transparent: q.get("transparent") || "true"
  };
  if (params.request === "GetMap") {
    const width = Math.min(2048, Math.max(1, Number(q.get("width") || 256)));
    const height = Math.min(2048, Math.max(1, Number(q.get("height") || 256)));
    const bbox = String(q.get("bbox") || "").split(",").map(Number);
    if (bbox.length !== 4 || bbox.some(v => !Number.isFinite(v))) {
      res.statusCode = 400; res.setHeader("Content-Type", "text/plain"); return res.end("BBOX tidak valid.");
    }
    params.width = width; params.height = height; params.bbox = bbox.join(",");
    params.srs = q.get("srs") || q.get("crs") || "EPSG:3857";
  }
  try {
    const result = await fetchWms(params, mode);
    const contentType = result.contentType.split(";")[0];
    if (!contentType.startsWith("image/") && !contentType.includes("xml")) {
      res.statusCode = 502; res.setHeader("Content-Type", "text/plain"); return res.end("Respons WMS tidak dikenal.");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.setHeader("X-BumiAtlas-GeoServer-Source", result.source);
    return res.end(result.bytes);
  } catch (error) {
    console.error("GeoServer WMS error:", error);
    res.statusCode = error.status === 401 || error.status === 403 ? error.status : 502;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end(error.message);
  }
}
