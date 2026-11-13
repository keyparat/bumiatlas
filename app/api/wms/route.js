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

export async function GET(request) {
  const incoming = new URL(request.url);
  const layer = incoming.searchParams.get("layers");
  if (!layer || !ALLOWED_LAYERS.has(layer)) {
    return NextResponse.json({ error: "Layer WMS tidak diizinkan." }, { status: 400 });
  }
  const upstream = new URL(process.env.ATR_WMS_URL || DEFAULT_ENDPOINT);
  const params = new URLSearchParams();
  for (const key of ["service", "request", "version", "layers", "styles", "format", "transparent", "width", "height", "srs", "bbox", "exceptions"]) {
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
  upstream.search = params.toString();
  try {
    const response = await fetch(upstream, { headers: { Accept: "image/png" }, next: { revalidate: 300 } });
    if (!response.ok) return NextResponse.json({ error: "Layanan WMS ATR/BPN merespons " + response.status }, { status: 502 });
    return new NextResponse(response.body, { status: 200, headers: {
      "Content-Type": response.headers.get("content-type") || "image/png",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "X-Content-Type-Options": "nosniff"
    }});
  } catch {
    return NextResponse.json({ error: "Tidak dapat menghubungi server WMS ATR/BPN." }, { status: 502 });
  }
}
