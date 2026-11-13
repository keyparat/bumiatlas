const sidebar = document.querySelector(".sidebar");
const map = window.BumiAtlasMap;
if (sidebar && map) {
  const panel = document.createElement("section");
  panel.className = "section-block geoserver-block";
  panel.innerHTML = [
    '<div class="section-title"><span class="section-label">ATR/BPN GEOSERVER</span><span id="gsBadge" class="mcp-status">Belum diuji</span></div>',
    '<p class="editor-hint">WMS untuk tampilan peta dan WFS untuk polygon serta atribut bidang tanah.</p>',
    '<label class="gs-label">Jalur koneksi<select id="gsMode"><option value="auto">Otomatis (direct lalu proxy)</option><option value="direct">Direct GeoServer</option><option value="proxy">BHUMI proxy</option></select></label>',
    '<label class="gs-check"><input id="gsWmsToggle" type="checkbox" /> Tampilkan layer persil WMS</label>',
    '<div class="gs-actions"><button class="editor-button primary" id="gsCheck">Uji koneksi</button><button class="editor-button" id="gsClear">Hapus overlay</button></div>',
    '<label class="gs-label">Cari NIB<input id="gsNIB" placeholder="Masukkan NIB bidang tanah" autocomplete="off" /></label>',
    '<div class="gs-actions"><button class="editor-button primary" id="gsSearch">Cari bidang (WFS)</button><button class="editor-button" id="gsGeoJSON">Unduh GeoJSON</button><button class="editor-button" id="gsKML">Unduh KML</button></div>',
    '<div id="gsMessage" class="editor-hint" aria-live="polite">Belum ada pencarian.</div><div id="gsDetails" class="gs-details"></div>'
  ].join("");
  const layerBlock = sidebar.querySelector(".layers-block");
  if (layerBlock) layerBlock.insertAdjacentElement("afterend", panel);
  let currentData = null;
  let overlay = null;
  let wmsLayer = null;
  const el = id => panel.querySelector("#" + id);
  const mode = () => el("gsMode").value;
  const say = message => { el("gsMessage").textContent = message; };
  async function api(action, extra = {}) {
    const url = new URL("/api/geoserver", location.origin);
    url.searchParams.set("action", action);
    url.searchParams.set("mode", mode());
    for (const [key, value] of Object.entries(extra)) if (value !== undefined && value !== "") url.searchParams.set(key, value);
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    const type = response.headers.get("content-type") || "";
    if (!response.ok) {
      const body = type.includes("json") ? await response.json() : { error: await response.text() };
      throw new Error(body.error || "GeoServer HTTP " + response.status);
    }
    return response;
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function showDetails(feature) {
    const entries = Object.entries(feature.properties || {}).slice(0, 30);
    el("gsDetails").innerHTML = "<strong>Detail bidang</strong>" + entries.map(([key, value]) =>
      "<div class='gs-detail-row'><span>" + escapeHtml(key) + "</span><b>" + escapeHtml(value == null ? "—" : String(value)) + "</b></div>"
    ).join("");
  }
  function draw(data) {
    currentData = data;
    if (overlay) map.removeLayer(overlay);
    overlay = L.geoJSON(data, {
      style: { color: "#1676d2", weight: 2, fillColor: "#42a5f5", fillOpacity: 0.2 },
      onEachFeature(feature, featureLayer) {
        const props = feature.properties || {};
        featureLayer.bindTooltip(String(props.NIB || props.NOMOR || "Bidang tanah"));
        featureLayer.on("click", () => showDetails(feature));
      }
    }).addTo(map);
    if (overlay.getBounds().isValid()) map.fitBounds(overlay.getBounds(), { padding: [24, 24], maxZoom: 19 });
    const count = data.features?.length || 0;
    say(count + " bidang ditampilkan. Klik polygon untuk melihat atribut.");
    if (count) showDetails(data.features[0]);
  }
  function download(content, name, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function kmlFromData(data) {
    const esc = value => String(value ?? "").replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
    const coords = ring => ring.map(xy => Number(xy[0]) + "," + Number(xy[1]) + ",0").join(" ");
    const marks = (data.features || []).map((feature, index) => {
      const p = feature.properties || {}, g = feature.geometry;
      if (!g) return "";
      const name = p.NIB || p.NOMOR || feature.id || "Bidang " + (index + 1);
      let shape = "";
      if (g.type === "Polygon") shape = "<Polygon><outerBoundaryIs><LinearRing><coordinates>" + coords(g.coordinates[0]) + "</coordinates></LinearRing></outerBoundaryIs></Polygon>";
      if (g.type === "MultiPolygon") shape = "<MultiGeometry>" + g.coordinates.map(poly => "<Polygon><outerBoundaryIs><LinearRing><coordinates>" + coords(poly[0]) + "</coordinates></LinearRing></outerBoundaryIs></Polygon>").join("") + "</MultiGeometry>";
      return "<Placemark><name>" + esc(name) + "</name><description>" + esc(JSON.stringify(p)) + "</description>" + shape + "</Placemark>";
    }).join("");
    return '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>' + marks + "</Document></kml>";
  }
  el("gsWmsToggle").addEventListener("change", event => {
    if (event.target.checked) {
      if (!wmsLayer) wmsLayer = L.tileLayer.wms("/api/geoserver-wms", {
        layers: "umum:Persil", format: "image/png", transparent: true,
        version: "1.1.1", srs: "EPSG:3857", mode: mode(), opacity: 0.55,
        tileSize: 256, crossOrigin: true
      });
      wmsLayer.setParams({ mode: mode() });
      wmsLayer.addTo(map);
      say("Layer WMS diminta dari GeoServer ATR/BPN.");
    } else if (wmsLayer) {
      map.removeLayer(wmsLayer);
      say("Layer WMS disembunyikan.");
    }
  });
  el("gsMode").addEventListener("change", () => {
    if (wmsLayer && map.hasLayer(wmsLayer)) wmsLayer.setParams({ mode: mode() });
  });
  el("gsCheck").addEventListener("click", async () => {
    el("gsBadge").textContent = "Memeriksa…";
    try {
      const data = await (await api("health")).json();
      el("gsBadge").textContent = "Terhubung · " + data.source;
      say("WFS berhasil. Layer: " + ((data.layers || []).join(", ") || data.layer));
    } catch (error) { el("gsBadge").textContent = "Gagal"; say(error.message); }
  });
  el("gsSearch").addEventListener("click", async () => {
    const nib = el("gsNIB").value.trim();
    if (!nib) return say("Masukkan NIB terlebih dahulu.");
    say("Mencari bidang…");
    try { draw(await (await api("parcel", { nib, limit: 100 })).json()); }
    catch (error) { say(error.message); }
  });
  el("gsNIB").addEventListener("keydown", event => { if (event.key === "Enter") el("gsSearch").click(); });
  el("gsClear").addEventListener("click", () => {
    if (overlay) map.removeLayer(overlay);
    overlay = null; currentData = null; el("gsDetails").textContent = "";
    say("Overlay WFS dihapus.");
  });
  el("gsGeoJSON").addEventListener("click", () => {
    if (!currentData) return say("Cari bidang terlebih dahulu.");
    download(JSON.stringify(currentData, null, 2), "bumiatlas-persil.geojson", "application/geo+json");
  });
  el("gsKML").addEventListener("click", () => {
    if (!currentData) return say("Cari bidang terlebih dahulu.");
    download(kmlFromData(currentData), "bumiatlas-persil.kml", "application/vnd.google-earth.kml+xml");
  });
}
