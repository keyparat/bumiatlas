"use client";

import { useEffect, useRef, useState } from "react";

const OVERLAYS = [
  { id: "bhumi:Persil", label: "Persil BHUMI" },
  { id: "petabpn:PersilBerdasarkanJenisHak", label: "Persil berdasarkan jenis hak" },
  { id: "dirptm:detailhgu", label: "HGU aktif/detail" },
  { id: "dirptm:detailhgu_mati", label: "HGU berakhir" },
  { id: "rtr-online:rtrw_kabkot_3602", label: "RTRW Kabupaten Lebak" },
  { id: "rtr-online:rtrw_kabkot_3604", label: "RTRW Kabupaten Serang" }
];

export default function GisWorkspace() {
  const mapRef = useRef(null);
  const layersRef = useRef({});
  const drawnRef = useRef(null);
  const [active, setActive] = useState([]);
  const [status, setStatus] = useState("Peta siap");
  const [features, setFeatures] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let map;
    let base;
    let drawn;
    let L;
    let disposed = false;
    (async () => {
      L = (await import("leaflet")).default;
      window.L = L;
      await import("leaflet-draw");
      if (disposed || mapRef.current) return;
      map = L.map("bumiatlas-map", { zoomControl: false }).setView([-6.4, 106.3], 9);
      mapRef.current = map;
      base = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20, attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      drawn = new L.FeatureGroup().addTo(map);
      drawnRef.current = drawn;
      new L.Control.Draw({ position: "topright", draw: { polygon: true, rectangle: true, marker: false, circle: false, circlemarker: false, polyline: false }, edit: { featureGroup: drawn } }).addTo(map);
      map.on(L.Draw.Event.CREATED, e => {
        e.layer.feature = { type: "Feature", properties: { nib: "", shm: "", desa: "" } };
        drawn.addLayer(e.layer);
        setFeatures(drawn.getLayers().length);
        setStatus("Bidang baru ditambahkan. Ekspor GeoJSON untuk menyimpan hasil.");
        updateMetrics(drawn, active.length);
      });
      map.on(L.Draw.Event.EDITED, () => setStatus("Geometri bidang diperbarui."));
      map.on(L.Draw.Event.DELETED, () => { setFeatures(drawn.getLayers().length); updateMetrics(drawn, active.length); });
      map.on("click", e => setSelected({ lat: e.latlng.lat, lng: e.latlng.lng }));
      window.setTimeout(() => map.invalidateSize(), 150);
    })().catch(err => setStatus("Gagal memuat peta: " + err.message));
    return () => { disposed = true; map?.remove(); mapRef.current = null; };
  }, []);

  function updateMetrics(group, layerCount) {
    const count = group?.getLayers().length || 0;
    const area = group ? group.getLayers().reduce((sum, layer) => {
      try {
        const ring = layer.getLatLngs()[0];
        if (!ring || ring.length < 3) return sum;
        const radius = 6371008.8;
        let total = 0;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          total += (b.lng - a.lng) * Math.PI / 180 *
            (2 + Math.sin(a.lat * Math.PI / 180) + Math.sin(b.lat * Math.PI / 180));
        }
        return sum + Math.abs(total * radius * radius / 2) / 1e6;
      } catch { return sum; }
    }, 0) : 0;
    document.getElementById("metric-parcels").textContent = count.toLocaleString("id-ID");
    document.getElementById("metric-area").textContent = area ? area.toFixed(2) + " km²" : "—";
    document.getElementById("metric-layers").textContent = String(1 + layerCount);
  }

  function toggleLayer(layerName) {
    const map = mapRef.current;
    if (!map) return;
    const next = active.includes(layerName) ? active.filter(x => x !== layerName) : [...active, layerName];
    if (active.includes(layerName)) {
      if (layersRef.current[layerName]) map.removeLayer(layersRef.current[layerName]);
      delete layersRef.current[layerName];
    } else {
      const L = window.L;
      const layer = L?.tileLayer.wms ? L.tileLayer.wms("http://127.0.0.1:8765/wms", {
        layers: layerName, format: "image/png", transparent: true, version: "1.1.1",
        srs: "EPSG:3857", tiled: true, opacity: 0.72, crossOrigin: true
      }) : null;
      if (layer) {
        layer.on("tileerror", () => setStatus("Tile ATR/BPN gagal. Periksa Connector di http://127.0.0.1:8765/health"));
        layer.on("tileload", () => setStatus("Layer ATR/BPN tampil: " + layerName));
        layer.addTo(map); layersRef.current[layerName] = layer;
      }
    }
    setActive(next);
    updateMetrics(drawnRef.current, next.length);
    setStatus(next.includes(layerName) ? "Memuat layer " + layerName : "Layer dimatikan");
  }

  async function findLocation(e) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    const coords = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) {
      const lat = Number(coords[1]), lng = Number(coords[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        mapRef.current?.setView([lat, lng], 16);
        setSelected({ lat, lng });
        return;
      }
    }
    setStatus("Mencari lokasi…");
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q); url.searchParams.set("format", "jsonv2"); url.searchParams.set("limit", "1");
      const r = await fetch(url); const data = await r.json();
      if (!data.length) throw new Error("Lokasi tidak ditemukan");
      mapRef.current?.setView([Number(data[0].lat), Number(data[0].lon)], 15);
      setSelected({ lat: Number(data[0].lat), lng: Number(data[0].lon), label: data[0].display_name });
      setStatus("Lokasi ditemukan");
    } catch (err) { setStatus(err.message); }
  }

  function exportGeoJSON() {
    const group = drawnRef.current;
    if (!group) return;
    const blob = new Blob([JSON.stringify(group.toGeoJSON(), null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "bumiatlas-bidang.geojson"; a.click();
    URL.revokeObjectURL(url);
  }

  async function importGeoJSON(event) {
    const file = event.target.files?.[0]; if (!file || !drawnRef.current) return;
    try {
      const L = (await import("leaflet")).default;
      const data = JSON.parse(await file.text());
      const layer = L.geoJSON(data);
      layer.eachLayer(child => drawnRef.current.addLayer(child));
      setFeatures(drawnRef.current.getLayers().length);
      mapRef.current.fitBounds(layer.getBounds(), { padding: [20, 20] });
      setStatus("GeoJSON berhasil diimpor");
    } catch { setStatus("File GeoJSON tidak valid"); }
    event.target.value = "";
  }

  return <section className="workspace">
    <aside className="layer-panel">
      <div className="panel-title"><div><p className="eyebrow">MAP CONTENTS</p><h2>Layer & alat</h2></div><span className="panel-count">{active.length} aktif</span></div>
      <form className="map-search" onSubmit={findLocation}><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari lokasi / lat, lng" aria-label="Cari lokasi"/><button type="submit">Cari</button></form>
      <div className="layer-group"><p className="group-label">BASEMAP</p><div className="layer-line"><span className="swatch streets"/>OpenStreetMap <span className="enabled">Aktif</span></div></div>
      <div className="layer-group"><p className="group-label">ATR/BPN · WMS</p>{OVERLAYS.map(item => <label className="layer-line" key={item.id}><input type="checkbox" checked={active.includes(item.id)} onChange={() => toggleLayer(item.id)}/><span className="swatch overlay"/><span>{item.label}</span></label>)}</div>
      <div className="layer-group"><p className="group-label">DIGITASI & DATA</p><div className="tool-count">{features} bidang digitasi</div><div className="tool-actions"><label className="tool-button">Impor GeoJSON<input type="file" accept=".geojson,.json,application/json" hidden onChange={importGeoJSON}/></label><button className="tool-button" onClick={exportGeoJSON}>Ekspor GeoJSON</button></div><p className="hint">Gunakan toolbar gambar pada peta untuk membuat dan mengedit polygon.</p></div>
      <div className="source-note"><strong>Sumber peta</strong><span>ATR/BPN WMS melalui Local Connector Windows · OpenStreetMap</span><small>Jalankan local-connector/start.bat dan pastikan sesi ATR/BPN terverifikasi sebelum mengaktifkan layer.</small></div>
    </aside>
    <div className="map-panel"><div id="bumiatlas-map"/><div className="map-status"><span className="live-dot"/>{status}</div>{selected && <div className="coordinate-card"><strong>{selected.label || "Titik terpilih"}</strong><span>{selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}</span><button onClick={() => navigator.clipboard?.writeText(selected.lat + ", " + selected.lng)}>Salin koordinat</button></div>}</div>
  </section>;
}
