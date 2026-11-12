import { connectBumiAtlas, initializeBumiAtlas, disconnectBumiAtlas, callBumiAtlasTool, getBumiAtlasStatus } from "./mcp-client.js";

const INDONESIA_CENTER = [-2.5489, 118.0149];
const map = L.map("map", { zoomControl: false, scrollWheelZoom: true }).setView(INDONESIA_CENTER, 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
}).addTo(map);

const workspace = document.querySelector(".workspace");
const marker = L.marker(INDONESIA_CENTER);
let toastTimer;
function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 3000);
}
function selectPoint(lat, lon, label = "Selected location") {
  marker.setLatLng([lat, lon]).addTo(map);
  map.setView([lat, lon], Math.max(map.getZoom(), 12), { animate: true });
  const coordinate = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  document.getElementById("selectedCoordinates").textContent = coordinate;
  document.getElementById("resultCount").textContent = "1 point";
  document.getElementById("emptyState").hidden = true;
  document.getElementById("selectionCard").hidden = false;
  document.getElementById("mapPlace").textContent = label;
  document.getElementById("mapCoordinates").textContent = coordinate;
}
map.on("click", event => selectPoint(event.latlng.lat, event.latlng.lng));

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
searchForm.addEventListener("submit", async event => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) {
    toast("Enter a place name or latitude, longitude.");
    return;
  }
  const coords = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coords) {
    const lat = Number(coords[1]);
    const lon = Number(coords[2]);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      toast("Coordinates are outside the valid range.");
      return;
    }
    selectPoint(lat, lon, "Selected coordinates");
    return;
  }
  if (/^\d{4,14}$/.test(query) || /\bNIB\b/i.test(query)) {
    searchParcel(query);
    return;
  }
  searchForm.classList.add("searching");
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Search service unavailable");
    const results = await response.json();
    if (!results.length) {
      toast("No place found. Try a more specific name or coordinates.");
      return;
    }
    selectPoint(Number(results[0].lat), Number(results[0].lon), results[0].name.split(",")[0]);
  } catch {
    toast("Place search is unavailable right now. You can enter coordinates instead.");
  } finally {
    searchForm.classList.remove("searching");
  }
});

document.getElementById("locateButton").addEventListener("click", () => {
  if (!navigator.geolocation) {
    toast("This browser does not support location access.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    position => selectPoint(position.coords.latitude, position.coords.longitude, "Your location"),
    () => toast("Location permission was unavailable. Check your browser settings."),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});
document.getElementById("homeButton").addEventListener("click", () => {
  map.setView(INDONESIA_CENTER, 5, { animate: true });
  marker.remove();
  document.getElementById("mapPlace").textContent = "Indonesia";
  document.getElementById("mapCoordinates").textContent = "Explore the map";
  document.getElementById("resultCount").textContent = "No selection";
  document.getElementById("emptyState").hidden = false;
  document.getElementById("selectionCard").hidden = true;
});
document.getElementById("zoomIn").addEventListener("click", () => map.zoomIn());
document.getElementById("zoomOut").addEventListener("click", () => map.zoomOut());
document.getElementById("fullscreenButton").addEventListener("click", async () => {
  const target = document.querySelector(".map-workspace");
  try {
    if (!document.fullscreenElement) await target.requestFullscreen();
    else await document.exitFullscreen();
    setTimeout(() => map.invalidateSize(), 100);
  } catch { toast("Fullscreen is not available in this browser."); }
});
document.getElementById("copyCoordinates").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.getElementById("selectedCoordinates").textContent);
    toast("Coordinates copied.");
  } catch { toast("Could not copy coordinates."); }
});

document.querySelectorAll(".layer-row").forEach(button => {
  button.addEventListener("click", () => {
    const layerName = button.dataset.layer;
    if (layerName === "parcels") {
      // Parcel overlays are loaded from a specific MCP search result, not as a global tile layer.
      document.getElementById("searchInput").focus();
      document.getElementById("parcelResults").scrollIntoView({ behavior: "smooth", block: "nearest" });
      const connected = document.getElementById("mcpStatus").textContent === "Terhubung";
      toast(connected
        ? "Masukkan NIB atau nomor sertifikat pada kolom pencarian untuk memuat batas persil."
        : "Hubungkan akun BumiAtlas, lalu cari NIB atau nomor sertifikat untuk memuat batas persil.");
      return;
    }
    if (layerName !== "streets") {
      toast("Layer tematik ini belum tersedia pada versi aplikasi saat ini.");
      return;
    }
    document.querySelectorAll(".layer-row").forEach(row => {
      const active = row === button;
      row.classList.toggle("active", active);
      row.setAttribute("aria-pressed", String(active));
    });
  });
});
document.getElementById("resetLayers").addEventListener("click", () => {
  document.querySelectorAll(".layer-row").forEach(row => {
    const active = row.dataset.layer === "streets";
    row.classList.toggle("active", active);
    row.setAttribute("aria-pressed", String(active));
  });
  remoteParcelLayers.clearLayers();
  toast("Tampilan peta dikembalikan ke basemap.");
});
document.getElementById("collapseSidebar").addEventListener("click", () => workspace.classList.add("sidebar-collapsed"));
document.getElementById("expandSidebar").addEventListener("click", () => workspace.classList.remove("sidebar-collapsed"));


// Parcel digitising tools. Geometry is kept in GeoJSON-compatible Leaflet layers.
const parcelLayers = new L.FeatureGroup().addTo(map);
const drawnItems = parcelLayers;
let selectedParcelLayer = null;
let drawHandler = null;
const drawParcelButton = document.getElementById("drawParcel");
const geojsonInput = document.getElementById("geojsonFile");
const editorStatus = document.getElementById("editorStatus");
function updateFeatureCount() {
  const count = parcelLayers.getLayers().length;
  document.getElementById("featureCount").textContent = `${count} bidang`;
}
function setEditorStatus(message) {
  editorStatus.textContent = message;
}
function selectParcelLayer(layer) {
  selectedParcelLayer = layer;
  const props = layer.feature?.properties || {};
  document.getElementById("parcelNIB").value = props.nib || "";
  document.getElementById("parcelSHM").value = props.shm || "";
  document.getElementById("parcelVillage").value = props.desa || "";
  setEditorStatus("Bidang terpilih. Ubah atribut atau edit titik sudut melalui toolbar peta.");
}
parcelLayers.on("click", event => selectParcelLayer(event.layer));
map.on(L.Draw.Event.CREATED, event => {
  const layer = event.layer;
  layer.feature = { type: "Feature", properties: { nib: "", shm: "", desa: "" } };
  parcelLayers.addLayer(layer);
  selectParcelLayer(layer);
  updateFeatureCount();
  setEditorStatus("Polygon berhasil dibuat. Pilih bidang untuk mengisi atribut dan gunakan Edit untuk mengubah titik sudut.");
});
if (L.Control.Draw) {
  const drawControl = new L.Control.Draw({
    position: "topright",
    draw: {
      polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: "#23774d", weight: 2 } },
      rectangle: { shapeOptions: { color: "#23774d", weight: 2 } },
      polyline: false, circle: false, circlemarker: false, marker: false
    },
    edit: { featureGroup: parcelLayers, remove: true }
  });
  map.addControl(drawControl);
  drawParcelButton.addEventListener("click", () => {
    if (drawHandler) drawHandler.disable();
    drawHandler = new L.Draw.Polygon(map, { allowIntersection: false, showArea: true, shapeOptions: { color: "#23774d", weight: 2 } });
    drawHandler.enable();
    setEditorStatus("Mode menggambar aktif. Klik titik-titik batas bidang, lalu klik titik pertama untuk menutup polygon.");
  });
  map.on(L.Draw.Event.EDITED, () => setEditorStatus("Geometri bidang diperbarui."));
  map.on(L.Draw.Event.DELETED, () => { selectedParcelLayer = null; updateFeatureCount(); setEditorStatus("Bidang terpilih dihapus."); });
}
document.getElementById("saveParcelAttributes").addEventListener("click", () => {
  if (!selectedParcelLayer) { toast("Pilih atau gambar polygon terlebih dahulu."); return; }
  selectedParcelLayer.feature = selectedParcelLayer.feature || { type: "Feature", properties: {} };
  selectedParcelLayer.feature.properties = {
    ...selectedParcelLayer.feature.properties,
    nib: document.getElementById("parcelNIB").value.trim(),
    shm: document.getElementById("parcelSHM").value.trim(),
    desa: document.getElementById("parcelVillage").value.trim()
  };
  setEditorStatus("Atribut bidang diperbarui pada sesi ini. Ekspor GeoJSON untuk menyimpan hasilnya.");
  toast("Atribut bidang diperbarui.");
});
document.getElementById("importGeoJSON").addEventListener("click", () => geojsonInput.click());
geojsonInput.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const imported = L.geoJSON(data, {
      style: () => ({ color: "#23774d", weight: 2, fillOpacity: 0.15 }),
      onEachFeature: (feature, layer) => { layer.feature = feature; layer.on("click", () => selectParcelLayer(layer)); }
    });
    imported.eachLayer(layer => parcelLayers.addLayer(layer));
    const bounds = imported.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
    updateFeatureCount();
    setEditorStatus(`Berhasil mengimpor ${imported.getLayers().length} fitur GeoJSON.`);
    toast("GeoJSON berhasil diimpor.");
  } catch (error) {
    toast("File GeoJSON tidak valid atau tidak dapat dibaca.");
    setEditorStatus("Impor gagal. Pastikan file berisi GeoJSON Feature atau FeatureCollection yang valid.");
  } finally { geojsonInput.value = ""; }
});
document.getElementById("exportGeoJSON").addEventListener("click", () => {
  const features = [];
  parcelLayers.eachLayer(layer => {
    const feature = layer.toGeoJSON();
    feature.properties = { ...(layer.feature?.properties || {}), ...(feature.properties || {}) };
    features.push(feature);
  });
  if (!features.length) { toast("Belum ada bidang untuk diekspor."); return; }
  const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features }, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "bumiatlas-bidang.geojson"; link.click();
  URL.revokeObjectURL(url);
  toast(`${features.length} bidang diekspor ke GeoJSON.`);
});
updateFeatureCount();


// Authenticated parcel lookup against the official BumiAtlas MCP service.
const remoteParcelLayers = L.featureGroup().addTo(map);
const mcpStatusEl = document.getElementById("mcpStatus");
const connectMcpButton = document.getElementById("connectMcp");
const disconnectMcpButton = document.getElementById("disconnectMcp");
const parcelResultsEl = document.getElementById("parcelResults");
const mcpToolsEl = document.getElementById("mcpTools");

function setMcpUi(connected, tools = []) {
  mcpStatusEl.textContent = connected ? "Terhubung" : "Belum terhubung";
  mcpStatusEl.style.color = connected ? "#23774d" : "#9a7130";
  connectMcpButton.hidden = connected;
  disconnectMcpButton.hidden = !connected;
  mcpToolsEl.hidden = !connected;
  mcpToolsEl.textContent = connected
    ? `Koneksi aktif · ${tools.length} tool tersedia: ${tools.map(tool => tool.name).join(", ")}`
    : "";
}
function normalizeParcelList(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["parcels", "results", "items", "data"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  if (value.id || value.nib || value.nomor) return [value];
  return [];
}
function parcelLabel(parcel) {
  return parcel.nomor || parcel.nib || parcel.id || "Persil tanpa nomor";
}
function showParcelResults(parcels) {
  parcelResultsEl.replaceChildren();
  if (!parcels.length) {
    const empty = document.createElement("p");
    empty.className = "editor-hint";
    empty.textContent = "Tidak ada persil yang dikembalikan untuk pencarian ini. Cakupan data BPN dapat berbeda menurut lokasi.";
    parcelResultsEl.append(empty);
    return;
  }
  parcels.forEach((parcel, index) => {
    const card = document.createElement("div");
    card.className = "parcel-result";
    const title = document.createElement("strong");
    title.textContent = parcelLabel(parcel);
    const detail = document.createElement("small");
    detail.textContent = [
      parcel.tipehak || "Jenis hak tidak tersedia",
      parcel.nib ? `NIB: ${parcel.nib}` : "",
      parcel.luas != null ? `Luas tertulis: ${Number(parcel.luas).toLocaleString("id-ID")} m²` : "",
      parcel.tahun ? `Tahun: ${parcel.tahun}` : "",
      parcel.wilayah?.lokasi || parcel.wilayah?.nomor || ""
    ].filter(Boolean).join(" · ");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Ambil geometri & tampilkan";
    button.addEventListener("click", () => loadParcelGeometry(parcel, button));
    card.append(title, detail, button);
    parcelResultsEl.append(card);
  });
}
async function searchParcel(query) {
  parcelResultsEl.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "editor-hint";
  loading.textContent = "Menghubungkan ke BumiAtlas MCP dan mencari persil…";
  parcelResultsEl.append(loading);
  try {
    const data = await callBumiAtlasTool("Parcel_search", { query, limit: 20, radius: 50 });
    const parcels = normalizeParcelList(data);
    showParcelResults(parcels);
    document.getElementById("mapPlace").textContent = "Hasil pencarian persil";
    document.getElementById("mapCoordinates").textContent = query;
    if (!parcels.length) toast("MCP tidak mengembalikan persil untuk pencarian tersebut.");
    else toast(`${parcels.length} hasil persil ditemukan dari BumiAtlas MCP.`);
  } catch (error) {
    parcelResultsEl.replaceChildren();
    const message = document.createElement("p");
    message.className = "editor-hint mcp-error";
    message.textContent = error.message || "Pencarian MCP gagal.";
    parcelResultsEl.append(message);
    toast("Pencarian MCP gagal. Periksa koneksi atau autentikasi.");
  }
}
function extractGeometry(value) {
  if (!value || typeof value !== "object") return null;
  if (["Polygon", "MultiPolygon"].includes(value.type) && Array.isArray(value.coordinates)) return value;
  for (const key of ["geometry", "geojson", "boundary", "geom", "shape"]) {
    let candidate = value[key];
    if (typeof candidate === "string") {
      try { candidate = JSON.parse(candidate); } catch { candidate = null; }
    }
    if (candidate?.type === "Feature") candidate = candidate.geometry;
    if (candidate?.type === "FeatureCollection") candidate = candidate.features?.[0]?.geometry;
    if (candidate && ["Polygon", "MultiPolygon"].includes(candidate.type)) return candidate;
  }
  if (value.feature) return extractGeometry(value.feature);
  if (value.data) return extractGeometry(value.data);
  if (value.result) return extractGeometry(value.result);
  return null;
}
async function loadParcelGeometry(parcel, button) {
  if (!parcel.id) {
    toast("Hasil ini tidak memiliki ID persil untuk meminta geometri.");
    return;
  }
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Mengambil geometri…";
  try {
    const full = await callBumiAtlasTool("Parcel_get", { id: String(parcel.id), include_geometry: true });
    const geometry = extractGeometry(full);
    if (!geometry) {
      toast("Data detail diterima, tetapi geometri GeoJSON tidak tersedia pada respons.");
      setEditorStatus("Detail persil diterima dari MCP, namun geometri tidak ditemukan pada struktur respons.");
      return;
    }
    const feature = { type: "Feature", geometry, properties: { ...parcel, ...(full || {}) } };
    const layer = L.geoJSON(feature, { style: { color: "#c44738", weight: 3, fillColor: "#e8a39a", fillOpacity: 0.22 } });
    remoteParcelLayers.clearLayers();
    layer.addTo(remoteParcelLayers);
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [45, 45], maxZoom: 19 });
    document.getElementById("mapPlace").textContent = parcelLabel(full || parcel);
    document.getElementById("mapCoordinates").textContent = `Data persil dari BumiAtlas MCP · NIB ${full.nib || parcel.nib || "—"}`;
    setEditorStatus("Geometri persil dimuat dari BumiAtlas MCP. Geometri sumber ditampilkan sebagai referensi dan tidak diubah oleh editor lokal.");
    toast("Batas persil berhasil ditampilkan.");
  } catch (error) {
    toast(error.message || "Gagal mengambil geometri persil.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}
connectMcpButton.addEventListener("click", async () => {
  connectMcpButton.disabled = true;
  connectMcpButton.textContent = "Menghubungkan…";
  try {
    const result = await connectBumiAtlas();
    if (result.redirecting) return;
    setMcpUi(true, result.tools);
    toast("Terhubung ke BumiAtlas MCP.");
  } catch (error) {
    toast(error.message || "Koneksi MCP gagal. Periksa izin OAuth dan CORS server.");
  } finally {
    connectMcpButton.disabled = false;
    connectMcpButton.textContent = "Hubungkan akun BumiAtlas";
  }
});
disconnectMcpButton.addEventListener("click", async () => {
  await disconnectBumiAtlas();
  setMcpUi(false);
  remoteParcelLayers.clearLayers();
  parcelResultsEl.replaceChildren();
  toast("Koneksi BumiAtlas diputus.");
});
(async () => {
  try {
    const result = await initializeBumiAtlas();
    setMcpUi(!!result.connected, result.tools || []);
    if (result.connected) toast("Sesi BumiAtlas MCP dipulihkan.");
  } catch (error) {
    setMcpUi(false);
    const message = document.createElement("p");
    message.className = "editor-hint mcp-error";
    message.textContent = error.message || "Autentikasi MCP gagal.";
    parcelResultsEl.replaceChildren(message);
    toast("Autentikasi BumiAtlas gagal.");
  }
})();
