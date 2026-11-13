import {
  geoserverStatus, listLayers, describeLayer, getFeatures,
  searchParcels, getParcelByNIB, publicConfig, calculateAreas, toKml
} from "../lib/geoserver.js";

export const config = { api: { bodyParser: false } };
function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Allow", "GET, OPTIONS");
    return res.end();
  }
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const q = new URL(req.url, "https://local.invalid").searchParams;
  const action = q.get("action") || "health";
  const mode = q.get("mode") || "auto";
  try {
    let result;
    if (action === "config") result = publicConfig();
    else if (action === "health") result = await geoserverStatus(mode);
    else if (action === "layers") result = await listLayers(mode);
    else if (action === "describe") result = await describeLayer(q.get("layer") || undefined, mode);
    else if (action === "features") result = await getFeatures({
      layer: q.get("layer") || undefined, bbox: q.get("bbox") || undefined,
      limit: q.get("limit") || 500, mode
    });
    else if (action === "search") result = await searchParcels({
      query: q.get("q"), field: q.get("field") || "NIB", limit: q.get("limit") || 50, mode
    });
    else if (action === "parcel") result = await getParcelByNIB({
      nib: q.get("nib"), limit: q.get("limit") || 10, mode
    });
    else if (action === "areas") {
      const fc = await getFeatures({ bbox: q.get("bbox") || undefined, limit: q.get("limit") || 500, mode });
      result = { source: fc.source, areas: calculateAreas(fc) };
    } else if (action === "export") {
      const fc = await getFeatures({ bbox: q.get("bbox") || undefined, limit: q.get("limit") || 500, mode });
      const format = q.get("format") || "geojson";
      if (format === "kml") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="bumiatlas-persil.kml"');
        return res.end(toKml(fc));
      }
      if (format !== "geojson" && format !== "json") return json(res, 400, { error: "Format tersedia: geojson, json, kml." });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/geo+json; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="bumiatlas-persil.geojson"');
      return res.end(JSON.stringify(fc));
    } else return json(res, 400, { error: "Action tidak dikenal." });
    return json(res, 200, result);
  } catch (error) {
    console.error("GeoServer API error:", error);
    return json(res, error.status === 401 || error.status === 403 ? error.status : 502, {
      error: error.message || "GeoServer request failed",
      hint: /proxy menolak akses/i.test(error.message)
        ? "Tambahkan autentikasi resmi BHUMI proxy melalui environment Vercel."
        : /Direct dan proxy/i.test(error.message)
          ? "Periksa koneksi VPN/jaringan internal ATR/BPN dan konfigurasi proxy."
          : undefined
    });
  }
}
