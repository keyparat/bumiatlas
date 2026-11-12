const initialCenter = [-2.5489, 118.0149];
const initialZoom = 5;

const map = L.map("map", {
  zoomControl: true,
  attributionControl: true,
  preferCanvas: true
}).setView(initialCenter, initialZoom);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
}).addTo(map);

const sampleParcels = [
  { code: "22.01.05.03.1.00123", lat: -6.2000, lng: 106.8167, type: "Hak Milik", open: true },
  { code: "26.01.02.06.1.00444", lat: -7.7820, lng: 110.3670, type: "Hak Guna Bangunan", open: false },
  { code: "31.01.10.03.1.01280", lat: -8.6746, lng: 115.2120, type: "Hak Pakai", open: true },
  { code: "18.05.11.02.1.00671", lat: -6.9207, lng: 107.6060, type: "Hak Milik", open: false },
  { code: "12.01.04.12.1.01318", lat: -2.9910, lng: 104.7560, type: "Hak Pengelolaan", open: true }
];

const parcelLayer = L.layerGroup().addTo(map);

sampleParcels.forEach((parcel) => {
  const marker = L.circleMarker([parcel.lat, parcel.lng], {
    radius: parcel.open ? 8 : 6,
    color: parcel.open ? "#1f7a4b" : "#d3a73d",
    fillColor: parcel.open ? "#1f7a4b" : "#d3a73d",
    fillOpacity: 0.8,
    weight: 2
  }).addTo(parcelLayer);

  marker.bindPopup(`
    <div style="font-family: Inter, sans-serif; min-width: 180px;">
      <strong>${parcel.code}</strong><br>
      <span>${parcel.type}</span><br>
      <small>${parcel.lat.toFixed(4)}, ${parcel.lng.toFixed(4)}</small>
    </div>
  `);

  marker.on("click", () => {
    document.getElementById("detailTitle").textContent = parcel.code;
  });
});

const searchButton = document.getElementById("searchButton");
const searchInput = document.getElementById("searchInput");
const locateButton = document.getElementById("locateButton");
const centerIndonesiaButton = document.getElementById("centerIndonesia");
const resultList = document.getElementById("resultList");

function renderResults(items) {
  resultList.innerHTML = "";
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
      <span class="result-badge ${item.tone}">${item.status}</span>
    `;
    li.addEventListener("click", () => {
      map.setView([item.lat, item.lng], 13, { animate: true });
      document.getElementById("detailTitle").textContent = item.code;
    });
    resultList.appendChild(li);
  });
}

function buildStaticResults() {
  const items = [
    { code: "22.01.05.03.1.00123", lat: -6.2000, lng: 106.8167, type: "Hak Milik", city: "Jakarta", status: "Open", tone: "green" },
    { code: "26.01.02.06.1.00444", lat: -7.7820, lng: 110.3670, type: "HGB", city: "Yogyakarta", status: "Review", tone: "amber" },
    { code: "31.01.10.03.1.01280", lat: -8.6746, lng: 115.2120, type: "Hak Pakai", city: "Bali", status: "Open", tone: "green" },
    { code: "18.05.11.02.1.00671", lat: -6.9207, lng: 107.6060, type: "Hak Milik", city: "Bandung", status: "Risk", tone: "blue" },
    { code: "12.01.04.12.1.01318", lat: -2.9910, lng: 104.7560, type: "HPL", city: "Palembang", status: "Open", tone: "green" }
  ];
  renderResults(items);
}

buildStaticResults();

searchButton.addEventListener("click", () => {
  const query = searchInput.value.trim();
  if (!query) return;

  if (/^-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?$/.test(query)) {
    const [latStr, lngStr] = query.split(/[\s,]+/);
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      map.setView([lat, lng], 12, { animate: true });
      L.popup().setLatLng([lat, lng]).setContent(`Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`).openOn(map);
      return;
    }
  }

  const val = query.toLowerCase();
  const matching = sampleParcels.filter((item) => item.code.toLowerCase().includes(val) || item.type.toLowerCase().includes(val));
  if (matching.length > 0) {
    const first = matching[0];
    map.setView([first.lat, first.lng], 12, { animate: true });
    document.getElementById("detailTitle").textContent = first.code;
  }
});

locateButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 12, { animate: true });
      L.popup().setLatLng([latitude, longitude]).setContent("Your location").openOn(map);
    },
    () => {
      map.setView(initialCenter, initialZoom, { animate: true });
    }
  );
});

centerIndonesiaButton.addEventListener("click", () => {
  map.setView(initialCenter, initialZoom, { animate: true });
});

map.on("moveend", () => {
  const center = map.getCenter();
  const label = `Lat ${center.lat.toFixed(3)}, Lng ${center.lng.toFixed(3)}`;
  const meta = document.querySelector(".map-label");
  if (meta) {
    meta.textContent = label;
  }
});
