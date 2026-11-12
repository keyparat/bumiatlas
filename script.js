const map = L.map("map", {
  zoomControl: true,
  attributionControl: true,
  preferCanvas: true,
}).setView([-2.5489, 118.0149], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

const parcelSamples = [
  { code: "22.01.05.03.1.00123", lat: -6.2000, lng: 106.8167, type: "Hak Milik", city: "Jakarta", tone: "green", status: "Open" },
  { code: "26.01.02.06.1.00444", lat: -7.7820, lng: 110.3670, type: "Hak Guna Bangunan", city: "Yogyakarta", tone: "amber", status: "Review" },
  { code: "31.01.10.03.1.01280", lat: -8.6746, lng: 115.2120, type: "Hak Pakai", city: "Bali", tone: "green", status: "Open" },
  { code: "18.05.11.02.1.00671", lat: -6.9207, lng: 107.6060, type: "Hak Milik", city: "Bandung", tone: "blue", status: "Risk" },
  { code: "12.01.04.12.1.01318", lat: -2.9910, lng: 104.7560, type: "Hak Pengelolaan", city: "Palembang", tone: "green", status: "Open" }
];

const parcelLayer = L.layerGroup().addTo(map);

parcelSamples.forEach((parcel) => {
  const circle = L.circleMarker([parcel.lat, parcel.lng], {
    radius: parcel.tone === "amber" ? 7 : 8,
    color: parcel.tone === "green" ? "#1d7a4f" : parcel.tone === "amber" ? "#d2a647" : "#3f77c7",
    fillColor: parcel.tone === "green" ? "#1d7a4f" : parcel.tone === "amber" ? "#d2a647" : "#3f77c7",
    fillOpacity: 0.8,
    weight: 2
  }).addTo(parcelLayer);

  circle.bindPopup(`
    <div style="font-family: Inter, sans-serif; min-width: 180px;">
      <strong>${parcel.code}</strong><br>
      <span>${parcel.type}</span><br>
      <small>${parcel.city}</small>
    </div>
  `);

  circle.on("click", () => {
    document.getElementById("detailTitle").textContent = parcel.code;
  });
});

function renderResults(items) {
  const list = document.getElementById("resultList");
  list.innerHTML = "";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "result-item";
    li.innerHTML = `
      <div class="result-main">
        <div class="result-code">${item.code}</div>
        <div class="result-meta">
          <span>${item.type}</span>
          <span>·</span>
          <span>${item.city}</span>
        </div>
      </div>
      <span class="result-chip ${item.tone}">${item.status}</span>
    `;

    li.addEventListener("click", () => {
      map.setView([item.lat, item.lng], 12, { animate: true });
      document.getElementById("detailTitle").textContent = item.code;
    });

    list.appendChild(li);
  });
}

renderResults(parcelSamples);

const searchButton = document.getElementById("searchButton");
const searchInput = document.getElementById("searchInput");
const locateButton = document.getElementById("locateButton");
const centerButton = document.getElementById("centerIndonesia");

searchButton.addEventListener("click", () => {
  const query = searchInput.value.trim();
  if (!query) return;

  const coordMatch = query.match(/^-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?$/);
  if (coordMatch) {
    const [latString, lngString] = query.split(/[\s,]+/);
    const lat = Number(latString);
    const lng = Number(lngString);

    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      map.setView([lat, lng], 12, { animate: true });
      L.popup().setLatLng([lat, lng]).setContent(`Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`).openOn(map);
      return;
    }
  }

  const filtered = parcelSamples.filter((item) => item.code.toLowerCase().includes(query.toLowerCase()) || item.type.toLowerCase().includes(query.toLowerCase()));
  if (filtered.length) {
    renderResults(filtered);
    const first = filtered[0];
    map.setView([first.lat, first.lng], 12, { animate: true });
    document.getElementById("detailTitle").textContent = first.code;
  }
});

locateButton.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      map.setView([latitude, longitude], 12, { animate: true });
      L.popup().setLatLng([latitude, longitude]).setContent("Your location").openOn(map);
    },
    () => {
      map.setView([-2.5489, 118.0149], 5, { animate: true });
    }
  );
});

centerButton.addEventListener("click", () => {
  map.setView([-2.5489, 118.0149], 5, { animate: true });
});

map.on("moveend", () => {
  const center = map.getCenter();
  const title = document.getElementById("detailTitle");
  if (title) {
    title.textContent = `${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`;
  }
});
