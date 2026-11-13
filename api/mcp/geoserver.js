import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  geoserverStatus, listLayers, describeLayer, getFeatures,
  searchParcels, getParcelByNIB, calculateAreas, toKml
} from "../../lib/geoserver.js";

export const config = { api: { bodyParser: false } };
function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}
function registerTools(server) {
  server.tool("geoserver_status", "Periksa koneksi GeoServer ATR/BPN melalui direct, proxy, atau auto-fallback.", {
    mode: z.enum(["auto", "direct", "proxy"]).optional()
  }, async ({ mode = "auto" }) => textResult(await geoserverStatus(mode)));
  server.tool("geoserver_list_layers", "Daftar layer WFS yang tersedia dari GeoServer ATR/BPN.", {
    mode: z.enum(["auto", "direct", "proxy"]).optional()
  }, async ({ mode = "auto" }) => textResult(await listLayers(mode)));
  server.tool("geoserver_describe_layer", "Baca struktur atribut/kolom sebuah layer WFS.", {
    layer: z.string().optional(),
    mode: z.enum(["auto", "direct", "proxy"]).optional()
  }, async ({ layer, mode = "auto" }) => textResult(await describeLayer(layer, mode)));
  server.tool("geoserver_search_parcels", "Cari bidang persil berdasarkan NIB, NOMOR, kecamatan, atau kelurahan.", {
    query: z.string().min(2),
    field: z.enum(["NIB", "NOMOR", "KECAMATAN", "KELURAHAN"]).default("NIB"),
    limit: z.number().int().min(1).max(500).default(50),
    mode: z.enum(["auto", "direct", "proxy"]).default("auto")
  }, async args => textResult(await searchParcels(args)));
  server.tool("geoserver_get_parcel_by_nib", "Ambil polygon dan atribut bidang berdasarkan NIB.", {
    nib: z.string().min(3),
    limit: z.number().int().min(1).max(100).default(10),
    mode: z.enum(["auto", "direct", "proxy"]).default("auto")
  }, async args => textResult(await getParcelByNIB(args)));
  server.tool("geoserver_get_features", "Ambil fitur GeoJSON berdasarkan BBOX EPSG:4326 (minLon,minLat,maxLon,maxLat).", {
    bbox: z.array(z.number()).length(4).optional(),
    limit: z.number().int().min(1).max(2000).default(500),
    mode: z.enum(["auto", "direct", "proxy"]).default("auto")
  }, async ({ bbox, limit, mode }) => textResult(await getFeatures({ bbox, limit, mode })));
  server.tool("geoserver_calculate_area", "Hitung perkiraan luas geodesik polygon persil dalam meter persegi.", {
    bbox: z.array(z.number()).length(4).optional(),
    limit: z.number().int().min(1).max(500).default(100),
    mode: z.enum(["auto", "direct", "proxy"]).default("auto")
  }, async ({ bbox, limit, mode }) => {
    const fc = await getFeatures({ bbox, limit, mode });
    return textResult({ source: fc.source, areas: calculateAreas(fc) });
  });
  server.tool("geoserver_export", "Ekspor hasil query WFS sebagai GeoJSON atau KML.", {
    bbox: z.array(z.number()).length(4).optional(),
    limit: z.number().int().min(1).max(500).default(100),
    format: z.enum(["geojson", "kml"]).default("geojson"),
    mode: z.enum(["auto", "direct", "proxy"]).default("auto")
  }, async ({ bbox, limit, format, mode }) => {
    const fc = await getFeatures({ bbox, limit, mode });
    return textResult({ format, source: fc.source, data: format === "kml" ? toKml(fc) : fc });
  });
}
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id, mcp-protocol-version, last-event-id");
    return res.end();
  }
  const server = new McpServer({ name: "bumiatlas-geoserver-atrbpn", version: "1.0.0" });
  registerTools(server);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    const body = req.method === "POST" ? await readBody(req) : undefined;
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error("GeoServer MCP request failed:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "GeoServer MCP request failed", detail: error.message }));
    }
  } finally {
    try { await transport.close(); } catch {}
    try { await server.close(); } catch {}
  }
}
