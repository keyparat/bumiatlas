import { NextResponse } from "next/server";

const DEFAULT_ENDPOINT = "https://geosrv-app.atrbpn.go.id/geoserver/ows";
const ALLOWED_LAYERS = new Set([
  "bhumi:Persil",
  "petabpn:PersilBerdasarkanJenisHak",
  "dirptm:detailhgu",
  "dirptm:detailhgu_mati",
  "rtr-online:rtrw_kabkot_3602",
  "rtr-online:rtrw_kabkot_3604"
]);

// These published layers advertise EPSG:4326, not EPSG:3857.
// Leaflet sends tile bounds in Web Mercator, so transform the BBOX
// before requesting these layers from GeoServer.
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

  const upstream = new URL(process.env.ATR_WMS_URL || DEFAULT_ENDPOINT);
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
    const bbox = incoming.searchParams.get("bbox");
    if (bbox) params.set("bbox", bbox);
  }

  upstream.search = params.toString();

  try {
    const response = await fetch(upstream, {
      headers: { Accept: "image/png" },
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Layanan WMS ATR/BPN merespons " + response.status },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.toLowerCase().includes("image/")) {
      const detail = (await response.text()).slice(0, 500);
      return NextResponse.json(
        { error: "GeoServer tidak mengembalikan gambar peta.", detail },
        { status: 502 }
      );
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return NextResponse.json(
      { error: "Tidak dapat menghubungi server WMS ATR/BPN." },
      { status: 502 }
    );
  }
}
