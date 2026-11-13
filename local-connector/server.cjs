const http = require("node:http");
const readline = require("node:readline");
const path = require("node:path");
const { chromium } = require("playwright");

const HOST = "127.0.0.1";
const PORT = 8766;
const WMS_PROXY = "https://belajar.atrbpn.go.id/Layanan/peta/DataSpasial/WMSProxy";
const WMS_TARGET = "http://geosrv-app.atrbpn.go.id/geoserver/wms";
const LOGIN_URL = WMS_PROXY + "?" + WMS_TARGET + "?service=WMS&version=1.1.1&request=GetCapabilities";
let ALLOWED_LAYERS = new Set([
  "bhumi:Persil",
  "petabpn:PersilBerdasarkanJenisHak",
  "dirptm:detailhgu",
  "dirptm:detailhgu_mati",
  "rtr-online:rtrw_kabkot_3602",
  "rtr-online:rtrw_kabkot_3604"
]);
const GEOGRAPHIC_LAYERS = new Set([
  "bhumi:Persil",
  "petabpn:PersilBerdasarkanJenisHak",
  "dirptm:detailhgu",
  "dirptm:detailhgu_mati"
]);
const ALLOWED_ORIGINS = new Set([
  "https://bumiatlas-78gy.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const previewOrigin = /^https:\/\/bumiatlas-78gy-[a-z0-9-]+\.vercel\.app$/;

let context;
let ready = false;
let layerCatalog = [];
let QUERYABLE_LAYERS = new Set();

function allowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin) || previewOrigin.test(origin || "");
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function decodeXml(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function parseLayerCatalog(xml) {
  const found = new Map();
  const elements = [];
  const layers = [];
  const tokens = String(xml).match(/<[^>]+>|[^<]+/g) || [];

  for (const token of tokens) {
    if (token.startsWith("<?") || token.startsWith("<!")) continue;

    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim().split(/\s/)[0];
      const current = elements.pop();
      if (!current || current.name !== name) continue;
      if (["Name", "Title", "SRS", "CRS"].includes(name) && current.parentName === "Layer" && current.layer) {
        const value = decodeXml(current.text.trim());
        if (name === "Name" && value && !current.layer.id) current.layer.id = value;
        if (name === "Title" && value && !current.layer.title) current.layer.title = value;
        if ((name === "SRS" || name === "CRS") && value) {
          current.layer.srs = [...new Set([...current.layer.srs, ...value.split(/\s+/).filter(Boolean)])];
        }
      }
      if (name === "Layer" && current.layer) {
        const item = current.layer;
        if (item.id && !item.id.startsWith("style_")) {
          item.title = item.title || item.id;
          item.namespace = item.id.includes(":") ? item.id.split(":")[0] : "Lainnya";
          found.set(item.id, item);
        }
      }
      continue;
    }

    if (token.startsWith("<")) {
      const match = token.match(/^<([A-Za-z_][\w:.-]*)([\s\S]*?)\s*(\/?)>$/);
      if (!match) continue;
      const [, name, rawAttributes, selfClosing] = match;
      const parent = elements[elements.length - 1];
      const parentLayer = parent?.layer || null;
      const attributes = {};
      rawAttributes.replace(/([\w:.-]+)\s*=\s*["']([^"']*)["']/g, (_, key, value) => {
        attributes[key] = decodeXml(value);
        return "";
      });

      let layer = parentLayer;
      if (name === "Layer") {
        layer = {
          id: "",
          title: "",
          queryable: attributes.queryable === undefined
            ? Boolean(parentLayer?.queryable)
            : attributes.queryable === "1" || attributes.queryable.toLowerCase() === "true",
          srs: [...(parentLayer?.srs || [])],
          bounds: null
        };
      }
      if ((name === "LatLonBoundingBox" || name === "BoundingBox") && layer) {
        const box = Object.fromEntries(Object.entries(attributes));
        if (name === "LatLonBoundingBox") layer.bounds = { ...(layer.bounds || {}), geographic: box };
        else layer.bounds = { ...(layer.bounds || {}), projected: box };
      }

      const entry = { name, parentName: parent?.name || "", layer, text: "" };
      if (!selfClosing) elements.push(entry);
      else if (name === "Layer" && layer?.id) {
        layer.title = layer.title || layer.id;
        layer.namespace = layer.id.includes(":") ? layer.id.split(":")[0] : "Lainnya";
        found.set(layer.id, layer);
      }
      continue;
    }

    const current = elements[elements.length - 1];
    if (current && ["Name", "Title", "SRS", "CRS"].includes(current.name)) current.text += token;
  }

  return [...found.values()].map(item => ({
    ...item,
    srs: [...new Set(item.srs)],
    protocol: "WMS"
  })).sort((a, b) =>
    a.namespace.localeCompare(b.namespace, "id") || a.title.localeCompare(b.title, "id")
  );
}

function toWgs84(bbox) {
  const values = String(bbox || "").split(",").map(Number);
  if (values.length !== 4 || values.some(v => !Number.isFinite(v))) {
    throw new Error("BBOX tidak valid.");
  }
  const radius = 6378137;
  const [minX, minY, maxX, maxY] = values;
  const lon = x => x / radius * 180 / Math.PI;
  const lat = y => (2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * 180 / Math.PI;
  return [lon(minX), lat(minY), lon(maxX), lat(maxY)].join(",");
}

function makeTarget(incoming) {
  const layer = incoming.searchParams.get("layers");
  if (!ALLOWED_LAYERS.has(layer)) throw new Error("Layer tidak diizinkan.");
  const params = new URLSearchParams();
  for (const key of ["width", "height", "bbox", "exceptions"]) {
    const value = incoming.searchParams.get(key);
    if (value !== null) params.set(key, value);
  }
  params.set("service", "WMS");
  params.set("request", "GetMap");
  params.set("version", "1.1.1");
  params.set("layers", layer);
  params.set("styles", "");
  params.set("format", "image/png");
  params.set("transparent", "true");
  const metadata = layerCatalog.find(item => item.id === layer);
  const useGeographic = !metadata?.srs?.includes("EPSG:3857") && metadata?.srs?.includes("EPSG:4326");
  if (useGeographic) {
    params.set("srs", "EPSG:4326");
    params.set("bbox", toWgs84(incoming.searchParams.get("bbox")));
  } else {
    params.set("srs", "EPSG:3857");
  }
  return WMS_PROXY + "?" + WMS_TARGET + "?" + params.toString();
}

function makeFeatureInfoTarget(incoming) {
  const layer = incoming.searchParams.get("layers");
  if (!ALLOWED_LAYERS.has(layer)) throw new Error("Layer tidak diizinkan.");
  if (!QUERYABLE_LAYERS.has(layer)) throw new Error("Layer ini tidak mendukung GetFeatureInfo (queryable=0).");
  const params = new URLSearchParams();
  for (const key of ["width", "height", "bbox", "x", "y", "feature_count"]) {
    const value = incoming.searchParams.get(key);
    if (value !== null) params.set(key, value);
  }
  params.set("service", "WMS");
  params.set("request", "GetFeatureInfo");
  params.set("version", "1.1.1");
  params.set("layers", layer);
  params.set("query_layers", layer);
  params.set("styles", "");
  params.set("format", "image/png");
  params.set("info_format", "application/json");
  const metadata = layerCatalog.find(item => item.id === layer);
  const useGeographic = !metadata?.srs?.includes("EPSG:3857") && metadata?.srs?.includes("EPSG:4326");
  if (useGeographic) {
    params.set("srs", "EPSG:4326");
    params.set("bbox", toWgs84(incoming.searchParams.get("bbox")));
  } else {
    params.set("srs", "EPSG:3857");
  }
  return WMS_PROXY + "?" + WMS_TARGET + "?" + params.toString();
}

async function checkSession() {
  if (!context) throw new Error("Browser ATR/BPN belum berjalan.");
  const response = await context.request.get(LOGIN_URL, {
    timeout: 30000,
    headers: { Accept: "application/xml,text/xml,*/*" }
  });
  const type = response.headers()["content-type"] || "";
  const body = await response.text();
  const ok = response.ok() &&
    (type.includes("xml") || /WMS_Capabilities|WMT_MS_Capabilities/i.test(body)) &&
    /WMS_Capabilities|WMT_MS_Capabilities/i.test(body);
  ready = Boolean(ok);
  if (ready) {
    const parsed = parseLayerCatalog(body);
    if (parsed.length) {
      layerCatalog = parsed.map(item => ({ ...item, protocol: "WMS" }));
      ALLOWED_LAYERS = new Set(parsed.map(item => item.id));
      QUERYABLE_LAYERS = new Set(parsed.filter(item => item.queryable).map(item => item.id));
    }

  }
  if (!ready) {
    const preview = body.replace(/\s+/g, " ").slice(0, 240);
    throw new Error("Sesi belum terverifikasi. HTTP " + response.status() + ", " + preview);
  }
  return { status: "ready", httpStatus: response.status(), contentType: type };
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigin(origin)) {
    return send(res, 403, JSON.stringify({ error: "Origin tidak diizinkan." }));
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, "http://" + HOST + ":" + PORT);
  if (url.pathname === "/health") {
    return send(res, 200, JSON.stringify({
      service: "BumiAtlas Local Connector",
      browserRunning: Boolean(context),
      atrbpnSessionReady: ready,
      wmsLayers: layerCatalog.length
    }));
  }
  if (url.pathname !== "/wms" && url.pathname !== "/feature-info" && url.pathname !== "/layers") {
    return send(res, 404, JSON.stringify({ error: "Endpoint tidak ditemukan." }));
  }
  if (url.pathname === "/layers") {
    if (!ready || !context) {
      return send(res, 503, JSON.stringify({
        error: "Sesi ATR/BPN belum diverifikasi. Login melalui browser Connector dan tekan Enter di terminal."
      }));
    }
    return send(res, 200, JSON.stringify({ count: layerCatalog.length, protocol: "WMS", layers: layerCatalog }));
  }

  if (req.method !== "GET") {
    return send(res, 405, JSON.stringify({ error: "Metode tidak diizinkan." }));
  }
  if (!ready || !context) {
    return send(res, 503, JSON.stringify({
      error: "Sesi ATR/BPN belum diverifikasi. Login melalui browser Connector dan tekan Enter pada jendela terminal."
    }));
  }

  try {
    if (url.pathname === "/feature-info") {
      const target = makeFeatureInfoTarget(url);
      const upstream = await context.request.get(target, {
        timeout: 30000,
        headers: { Accept: "application/json,text/plain,*/*", Referer: "https://belajar.atrbpn.go.id/" }
      });
      const body = await upstream.text();
      const contentType = upstream.headers()["content-type"] || "application/json";
      if (!upstream.ok()) {
        return send(res, 502, JSON.stringify({ error: "Permintaan GetFeatureInfo gagal.", httpStatus: upstream.status(), detail: body.slice(0, 500) }));
      }
      return send(res, 200, body, contentType);
    }

    const target = makeTarget(url);
    const upstream = await context.request.get(target, {
      timeout: 30000,
      headers: { Accept: "image/png", Referer: "https://belajar.atrbpn.go.id/" }
    });
    const contentType = upstream.headers()["content-type"] || "";
    if (!upstream.ok() || !contentType.toLowerCase().includes("image/")) {
      const detail = (await upstream.text()).replace(/\s+/g, " ").slice(0, 500);
      ready = false;
      return send(res, 502, JSON.stringify({
        error: "ATR/BPN tidak mengembalikan gambar WMS.",
        httpStatus: upstream.status(),
        contentType,
        detail
      }));
    }
    const image = await upstream.body();
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": image.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {})
    });
    return res.end(image);
  } catch (error) {
    return send(res, 502, JSON.stringify({ error: error.message || "Permintaan WMS gagal." }));
  }
});

async function main() {
  console.log("\n=== BumiAtlas Local Connector ===");
  console.log("Hanya menerima koneksi dari komputer ini (127.0.0.1).");
  console.log("Tidak mengirim password atau cookie ke GitHub/Vercel.\n");

  // Claim the local port before opening Chromium. If another process owns it,
  // fail gracefully without launching a browser that would immediately close.
  await new Promise((resolve, reject) => {
    const onError = error => {
      server.off("listening", onListening);
      if (error.code === "EADDRINUSE") {
        reject(new Error(
          "Port " + PORT + " sedang digunakan. Periksa http://" + HOST + ":" + PORT +
          "/health. Jika itu Connector lama, gunakan jendela tersebut. Jika bukan, tutup proses lama lalu jalankan kembali."
        ));
      } else {
        reject(error);
      }
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(PORT, HOST);
  });

  console.log("Connector aktif: http://" + HOST + ":" + PORT);
  console.log("Membuka browser login ATR/BPN...");

  context = await chromium.launchPersistentContext(
    path.join(__dirname, ".atrbpn-browser-profile"),
    { headless: false, viewport: { width: 1360, height: 900 } }
  );
  const pages = context.pages();
  const page = pages[0] || await context.newPage();
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(err => {
    console.log("Halaman awal belum terbuka otomatis:", err.message);
    console.log("Anda dapat membuka halaman login ATR/BPN secara manual pada browser Connector.");
  });

  console.log("1. Selesaikan login ATR/BPN pada jendela browser yang terbuka.");
  console.log("2. Setelah berhasil login, kembali ke terminal ini lalu tekan ENTER.");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => rl.question("\nTekan ENTER untuk memeriksa sesi ATR/BPN (Ctrl+C untuk keluar): ", async () => {
    try {
      const result = await checkSession();
      console.log("BERHASIL: sesi WMS terverifikasi.", result);
      console.log("BumiAtlas sekarang dapat meminta tile melalui localhost:8766.");
    } catch (error) {
      console.log("BELUM BERHASIL:", error.message);
      console.log("Pastikan login selesai pada browser Connector, lalu coba ENTER lagi.");
    }
    ask();
  });
  ask();
}

main().catch(error => {
  console.error("Connector gagal dijalankan:", error);
  process.exit(1);
});

process.on("SIGINT", async () => {
  try { await context?.close(); } catch {}
  process.exit(0);
});
