"use client";

import { useEffect, useRef, useState } from "react";

const OVERLAYS = [
  { id: "bhumi:Persil", label: "Persil BHUMI", queryable: true, srs: ["EPSG:4326"] },
  { id: "petabpn:PersilBerdasarkanJenisHak", label: "Persil berdasarkan jenis hak", queryable: true, srs: ["EPSG:4326"] },
  { id: "dirptm:detailhgu", label: "HGU aktif/detail", queryable: true, srs: ["EPSG:4326"] },
  { id: "dirptm:detailhgu_mati", label: "HGU berakhir", queryable: true, srs: ["EPSG:4326"] },
  { id: "rtr-online:rtrw_kabkot_3602", label: "RTRW Kabupaten Lebak", queryable: true, srs: ["EPSG:3857"] },
  { id: "rtr-online:rtrw_kabkot_3604", label: "RTRW Kabupaten Serang", queryable: true, srs: ["EPSG:3857"] }
];

export default function GisWorkspace() {
  const mapRef = useRef(null);
  const layersRef = useRef({});
  const catalogRef = useRef(OVERLAYS);
  const drawnRef = useRef(null);
  const [active, setActive] = useState([]);
  const [catalog, setCatalog] = useState(OVERLAYS);
  const [layerSearch, setLayerSearch] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("Layer bawaan");
  const [status, setStatus] = useState("Peta siap");
  const [features, setFeatures] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  async function refreshLayerCatalog() {
    setCatalogStatus("Memuat daftar layer…");
    try {
      const response = await fetch("http://127.0.0.1:8766/layers");
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!Array.isArray(data.layers) || !data.layers.length) throw new Error("Katalog layer kosong");
      catalogRef.current = data.layers;
      setCatalog(data.layers);
      setCatalogStatus(data.layers.length.toLocaleString("id-ID") + " layer WMS tersedia");
    } catch (error) {
      setCatalogStatus("Katalog belum tersedia · " + error.message);
    }
  }

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
      refreshLayerCatalog();
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
      map.on("click", async e => {
        const point = { lat: e.latlng.lat, lng: e.latlng.lng };
        setSelected(null);
        const activeLayers = Object.keys(layersRef.current)
          .filter(key => key.startsWith("WMS:"))
          .map(key => key.slice(4));
        const queryableLayers = activeLayers.filter(name =>
          catalogRef.current.find(item => item.id === name)?.queryable !== false
        );
        if (!activeLayers.length) {
          setSelected({ ...point, info: "Aktifkan layer WMS untuk mencari informasi bidang." });
          return;
        }
        if (!queryableLayers.length) {
          setSelected({ ...point, info: "Layer yang aktif tidak mendukung GetFeatureInfo (queryable=0)." });
          setStatus("Layer aktif tidak menyediakan detail objek");
          return;
        }
        setStatus("Mencari detail bidang…");
        const size = map.getSize();
        const bounds = map.getBounds();
        const sw = map.options.crs.project(bounds.getSouthWest());
        const ne = map.options.crs.project(bounds.getNorthEast());
        const bbox = [sw.x, sw.y, ne.x, ne.y].join(",");
        const pixel = map.latLngToContainerPoint(e.latlng);
        for (const layerName of queryableLayers) {
          try {
            const metadata = catalogRef.current.find(item => item.id === layerName);
            const geographicLayer = !metadata?.srs?.includes("EPSG:3857") && metadata?.srs?.includes("EPSG:4326");
            const clickX = geographicLayer
              ? (e.latlng.lng - bounds.getWest()) / (bounds.getEast() - bounds.getWest()) * size.x
              : pixel.x;
            const clickY = geographicLayer
              ? (bounds.getNorth() - e.latlng.lat) / (bounds.getNorth() - bounds.getSouth()) * size.y
              : pixel.y;
            const params = new URLSearchParams({
              layers: layerName, bbox, width: String(size.x), height: String(size.y),
              x: String(Math.max(0, Math.min(size.x - 1, Math.round(clickX)))),
              y: String(Math.max(0, Math.min(size.y - 1, Math.round(clickY)))),
              feature_count: "10"
            });
            const response = await fetch("http://127.0.0.1:8766/feature-info?" + params.toString());
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            const found = Array.isArray(data.features) ? data.features : [];
            if (found.length) {
              setSelected({
                ...point,
                layer: layerName,
                title: metadata?.title || layerName,
                properties: found[0].properties || {},
                feature: found[0]
              });
              setStatus("Detail bidang ditemukan pada " + layerName);
              return;
            }
          } catch (error) {
            setStatus("Gagal mengambil detail: " + error.message);
          }
        }
        setSelected({ ...point, info: "Tidak ada informasi bidang pada titik ini. Coba klik bagian tengah polygon." });
        setStatus("Tidak ada informasi bidang pada titik yang diklik. Coba klik bagian tengah bidang.");
      });
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

  async function toggleLayer(item) {
    const map = mapRef.current;
    if (!map) return;
    const protocol = item.protocol || "WMS";
    const layerName = item.id;
    const key = protocol + ":" + layerName;
    const next = active.includes(key) ? active.filter(x => x !== key) : [...active, key];
    if (active.includes(key)) {
      if (layersRef.current[key]) map.removeLayer(layersRef.current[key]);
      delete layersRef.current[key];
      setActive(next);
      updateMetrics(drawnRef.current, next.length);
      setStatus("Layer dimatikan: " + layerName);
      return;
    }

    const L = window.L;

    const layer = L?.tileLayer.wms ? L.tileLayer.wms("http://127.0.0.1:8766/wms", {
      layers: layerName, format: "image/png", transparent: true, version: "1.1.1",
      srs: "EPSG:3857", tiled: true, opacity: 0.72, crossOrigin: true
    }) : null;
    if (layer) {
      layer.on("tileerror", () => setStatus("Tile ATR/BPN gagal. Periksa Connector di http://127.0.0.1:8766/health"));
      layer.on("tileload", () => setStatus("Layer ATR/BPN tampil: " + layerName));
      layer.addTo(map); layersRef.current[key] = layer;
      setActive(next);
      updateMetrics(drawnRef.current, next.length);
      setStatus("Memuat layer WMS: " + layerName);
    }
  }

  function clearAllLayers() {
    const map = mapRef.current;
    if (map) Object.values(layersRef.current).forEach(layer => map.removeLayer(layer));
    layersRef.current = {};
    setActive([]);
    updateMetrics(drawnRef.current, 0);
    setStatus("Semua layer dimatikan");
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
      <div className="layer-group layer-catalog"><div className="catalog-heading"><p className="group-label">ATR/BPN · WMS</p><div className="catalog-tools"><span>{catalog.length.toLocaleString("id-ID")}</span><button type="button" className="catalog-refresh" onClick={refreshLayerCatalog}>Muat ulang</button></div></div><input className="layer-filter" value={layerSearch} onChange={e => setLayerSearch(e.target.value)} placeholder="Filter nama layer…" aria-label="Filter layer"/><p className="catalog-status">{catalogStatus}</p><div className="layer-list">{catalog.filter(item => (item.title + " " + item.id + " " + item.namespace).toLowerCase().includes(layerSearch.toLowerCase())).map(item => <label className="layer-line" key={"WMS:" + item.id} title={item.id}><input type="checkbox" checked={active.includes("WMS:" + item.id)} onChange={() => toggleLayer(item)}/><span className="swatch overlay"/><span className="layer-name"><span>{item.title} <small>WMS</small></span><small>{item.id}</small></span></label>)}</div><button className="layer-clear" type="button" onClick={clearAllLayers} disabled={!active.length}>Matikan semua layer</button></div>
      <div className="layer-group"><p className="group-label">DIGITASI & DATA</p><div className="tool-count">{features} bidang digitasi</div><div className="tool-actions"><label className="tool-button">Impor GeoJSON<input type="file" accept=".geojson,.json,application/json" hidden onChange={importGeoJSON}/></label><button className="tool-button" onClick={exportGeoJSON}>Ekspor GeoJSON</button></div><p className="hint">Gunakan toolbar gambar pada peta untuk membuat dan mengedit polygon.</p></div>
      <div className="source-note"><strong>Sumber peta</strong><span>ATR/BPN WMS melalui Local Connector Windows · OpenStreetMap</span><small>Jalankan local-connector/start.bat dan pastikan sesi ATR/BPN terverifikasi sebelum mengaktifkan layer.</small></div>
    </aside>
    <div className="map-panel"><div id="bumiatlas-map"/><div className="map-status"><span className="live-dot"/>{status}</div>{selected && <div className="coordinate-card"><div className="detail-heading"><div><p className="detail-eyebrow">INFORMASI OBJEK</p><strong>{selected.title || selected.properties?.nib || selected.properties?.NIB || selected.properties?.nomor || selected.label || "Detail titik / bidang"}</strong></div><button type="button" className="detail-close" aria-label="Tutup detail" title="Tutup detail" onClick={() => setSelected(null)}>×</button></div><span className="detail-coordinates">{selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}</span>{selected.layer && <small className="detail-layer">{selected.layer}</small>}{selected.info && <p className="detail-info">{selected.info}</p>}{selected.properties && Object.keys(selected.properties).length > 0 && <dl className="feature-properties">{Object.entries(selected.properties).slice(0, 80).map(([key, value]) => <div key={key}><dt>{key.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase())}</dt><dd>{value == null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>}{selected.properties && Object.keys(selected.properties).length > 0 && <button type="button" className="detail-copy" onClick={() => navigator.clipboard?.writeText(JSON.stringify(selected.properties, null, 2))}>Salin detail</button>}</div>}</div>
  </section>;
}
