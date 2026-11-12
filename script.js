const DEFAULT_CENTER = [-6.2, 106.8167];
const map = L.map("map", { zoomControl: false, scrollWheelZoom: true }).setView(DEFAULT_CENTER, 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
}).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);

let marker;
let toastTimer;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}
function setLocation(lat, lon, label) {
  map.setView([lat, lon], 14, { animate: true });
  if (marker) marker.remove();
  marker = L.marker([lat, lon]).addTo(map).bindPopup(`<strong>${lat.toFixed(5)}, ${lon.toFixed(5)}</strong>`).openPopup();
  document.getElementById("coordinateText").textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  document.getElementById("locationLabel").textContent = label || "Selected location";
  document.querySelector(".map-top-card strong").textContent = label || "Selected location";
  document.querySelector(".map-top-card small").textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
function searchLocation() {
  const query = document.getElementById("searchInput").value.trim();
  if (!query) {
    showToast("Enter a place name or latitude, longitude.");
    return;
  }
  const match = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (match) {
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      showToast("Those coordinates are outside the valid range.");
      return;
    }
    setLocation(lat, lon, "Selected coordinates");
    return;
  }
  showToast("Place-name search needs a geocoding service. Try entering latitude, longitude instead.");
}
document.getElementById("searchButton").addEventListener("click", searchLocation);
document.getElementById("searchInput").addEventListener("keydown", event => {
  if (event.key === "Enter") searchLocation();
});
document.getElementById("locateButton").addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("Location is not supported by this browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    position => setLocation(position.coords.latitude, position.coords.longitude, "Your location"),
    () => showToast("Could not access your location. Check your browser permission."),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});
document.getElementById("copyCoordinates").addEventListener("click", async () => {
  const value = document.getElementById("coordinateText").textContent;
  try {
    await navigator.clipboard.writeText(value);
    showToast("Coordinates copied.");
  } catch {
    showToast(value);
  }
});
document.getElementById("dismissHint").addEventListener("click", () => {
  document.querySelector(".map-hint").remove();
});
