import { NextResponse } from "next/server";

const DEFAULT_ENDPOINT = "http://geosrv-app.atrbpn.go.id/geoserver/wms";
const WMS_PROXY = "https://belajar.atrbpn.go.id/Layanan/peta/DataSpasial/WMSProxy";
const ALLOWED_LAYERS = new Set([
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

function webMercatorBboxToWgs84(bbox) {
  const values = bbox?.split(",").map(Number);
  if (!values || values.length !== 4 || values.some(value => !Number.isFinite(value))) {
    throw new Error("BBOX WMS tidak valid.");
  }

  const radius = 6378137;
  const [minX, minY, maxX, maxY] = values;
  const toLon = x => (x / radius) * (180 / Math.PI);
  const toLat = y => (2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * (180 / Math.PI);
  return [toLon(minX), toLat(minY), toLon(maxX), toLat(maxY)].join(",");
}

export async function GET(request) {
  const incoming = new URL(request.url);
  const layer = incoming.searchParams.get("layers");
  if (!layer || !ALLOWED_LAYERS.has(layer)) {
    return NextResponse.json({ error: "Layer WMS tidak diizinkan." }, { status: 400 });
  }

  const target = new URL(process.env.ATR_WMS_URL || DEFAULT_ENDPOINT);
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

  if (GEOGRAPHIC_LAYERS.has(layer)) {
    try {
      params.set("srs", "EPSG:4326");
      params.set("bbox", webMercatorBboxToWgs84(incoming.searchParams.get("bbox")));
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    params.set("srs", "EPSG:3857");
  }

  target.search = params.toString();
  const proxyUrl = WMS_PROXY + "?" + target.toString();

  try {
    const response = await fetch(proxyUrl, {
      headers: {
        Accept: "image/png",
        Referer: "https://belajar.atrbpn.go.id/"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      return NextResponse.json(
        { error: "WMSProxy ATR/BPN merespons " + response.status, detail },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("image/")) {
      const detail = (await response.text()).slice(0, 1000);
      return NextResponse.json(
        { error: "WMSProxy tidak mengembalikan gambar peta.", detail },
        { status: 502 }
      );
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("ATR/BPN WMSProxy request failed:", error);
    return NextResponse.json(
      { error: "Tidak dapat menghubungi WMSProxy ATR/BPN.", detail: error.message },
      { status: 502 }
    );
  }
}
