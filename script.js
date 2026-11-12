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
  if (/^\d{2}\.\d{2}|^\d{10,}$/.test(query) || /\bNIB\b/i.test(query)) {
    toast("Parcel lookup is provided by BumiAtlas MCP. Connect MCP to query certificate or NIB data.");
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
    if (button.dataset.layer !== "streets") {
      window.open("https://bumiatlas.com/mcp/", "_blank", "noopener,noreferrer");
      toast("This preview has no parcel overlay. Connect to BumiAtlas MCP for land-data tools.");
      return;
    }
    button.classList.add("active");
    button.setAttribute("aria-pressed", "true");
  });
});
document.getElementById("resetLayers").addEventListener("click", () => toast("Street map is the only layer in this preview."));
document.getElementById("collapseSidebar").addEventListener("click", () => workspace.classList.add("sidebar-collapsed"));
document.getElementById("expandSidebar").addEventListener("click", () => workspace.classList.remove("sidebar-collapsed"));
