const STORAGE_KEY = "travel-footprints";
const SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const COUNTRY_GEOJSON_URL = "https://cdn.jsdelivr.net/gh/datasets/geo-countries@master/data/countries.geojson";
const SEARCH_DELAY = 350;
const WORLD_BOUNDS = [[-85, -180], [85, 180]];
const WORLD_CENTER = [8, 0];
const VISITED_COUNTRY_COLOR = "#2dd4bf";
const VISITED_CITY_COLOR = "#f97316";
const COUNTRY_CODE_ALIASES = {
  HK: ["CN-HK"],
  MO: ["CN-MO"],
  TW: ["CN-TW"],
};

const form = document.querySelector("#footprintForm");
const placeInput = document.querySelector("#placeInput");
const suggestions = document.querySelector("#suggestions");
const dateInput = document.querySelector("#dateInput");
const noteInput = document.querySelector("#noteInput");
const list = document.querySelector("#footprintList");
const emptyState = document.querySelector("#emptyState");
const countText = document.querySelector("#footprintCount");
const clearButton = document.querySelector("#clearButton");
const locateButton = document.querySelector("#locateButton");
const selectedText = document.querySelector("#selectedText");
const coordinateText = document.querySelector("#coordinateText");

const map = L.map("map", {
  maxBounds: WORLD_BOUNDS,
  maxBoundsViscosity: 1,
  minZoom: 2,
  zoomDelta: 0.5,
  zoomSnap: 0.05,
  worldCopyJump: false,
});

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  bounds: WORLD_BOUNDS,
  maxZoom: 19,
  noWrap: true,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const countryLayerGroup = L.layerGroup().addTo(map);
const markerLayer = L.layerGroup().addTo(map);

let countryLayer = null;
let draftMarker = null;
let selectedPlace = null;
let searchTimer = null;
let searchController = null;
let currentSuggestions = [];
let footprints = loadFootprints();

fitWorldToViewport();
render();
loadCountryLayer();

window.addEventListener("resize", () => {
  map.invalidateSize();

  if (!footprints.length && !selectedPlace) {
    fitWorldToViewport();
  }
});

placeInput.addEventListener("input", () => {
  selectedPlace = null;
  clearDraftMarker();
  scheduleSearch(placeInput.value.trim());
});

placeInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideSuggestions();
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-field")) {
    hideSuggestions();
  }
});

suggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-suggestion-index]");

  if (!button) {
    return;
  }

  const result = currentSuggestions[Number(button.dataset.suggestionIndex)];
  if (result) {
    selectSearchResult(result);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedPlace) {
    const result = await searchFirstResult(placeInput.value.trim());
    if (!result) {
      selectedText.textContent = "没有找到这个城市";
      coordinateText.textContent = "请换一个更完整的城市名再试";
      return;
    }
    selectSearchResult(result);
  }

  const footprint = {
    id: crypto.randomUUID(),
    place: selectedPlace.name,
    displayName: selectedPlace.displayName,
    countryCode: selectedPlace.countryCode,
    countryName: selectedPlace.countryName,
    lat: selectedPlace.lat,
    lng: selectedPlace.lng,
    date: dateInput.value,
    note: noteInput.value.trim(),
    createdAt: new Date().toISOString(),
  };

  footprints = [footprint, ...footprints];
  saveFootprints();
  render();
  form.reset();
  selectedPlace = null;
  clearDraftMarker();
  hideSuggestions();
  selectedText.textContent = "足迹已添加";
  coordinateText.textContent = footprint.displayName;
});

list.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-id]");
  const card = event.target.closest("[data-footprint-id]");

  if (deleteButton) {
    footprints = footprints.filter((item) => item.id !== deleteButton.dataset.deleteId);
    saveFootprints();
    render();
    resetMapPromptIfEmpty();
    return;
  }

  if (card) {
    const footprint = footprints.find((item) => item.id === card.dataset.footprintId);
    if (footprint) {
      map.setView([footprint.lat, footprint.lng], Math.max(map.getZoom(), 7));
    }
  }
});

clearButton.addEventListener("click", () => {
  if (!footprints.length || !window.confirm("确定清空所有足迹吗？")) {
    return;
  }

  footprints = [];
  saveFootprints();
  render();
  resetMapPromptIfEmpty();
});

locateButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    selectedText.textContent = "当前浏览器不支持定位";
    return;
  }

  selectedText.textContent = "正在获取当前位置...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const place = {
        name: "我的当前位置",
        displayName: "我的当前位置",
        countryCode: "",
        countryName: "",
        lat: latitude,
        lng: longitude,
      };
      selectSearchResult(place);
      map.setView([latitude, longitude], 9);
    },
    () => {
      selectedText.textContent = "定位失败";
      coordinateText.textContent = "可以输入城市名搜索添加";
    },
    { enableHighAccuracy: true, timeout: 8000 },
  );
});

function scheduleSearch(query) {
  window.clearTimeout(searchTimer);

  if (query.length < 2) {
    currentSuggestions = [];
    renderSuggestions([]);
    selectedText.textContent = "搜索城市添加足迹";
    coordinateText.textContent = "至少输入 2 个字开始联想搜索";
    return;
  }

  suggestions.innerHTML = '<div class="suggestion-status">正在搜索...</div>';
  suggestions.classList.add("is-open");

  searchTimer = window.setTimeout(async () => {
    const results = await searchPlaces(query, 6);
    currentSuggestions = results;
    renderSuggestions(results);
  }, SEARCH_DELAY);
}

async function searchFirstResult(query) {
  if (!query) {
    return null;
  }

  const results = await searchPlaces(query, 1);
  return results[0] || null;
}

async function searchPlaces(query, limit) {
  if (searchController) {
    searchController.abort();
  }

  searchController = new AbortController();
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    "accept-language": "zh-CN,zh,en",
  });

  try {
    const response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
      signal: searchController.signal,
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Search failed");
    }

    const results = await response.json();
    return results
      .filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
      .map(normalizePlace);
  } catch (error) {
    if (error.name === "AbortError") {
      return currentSuggestions;
    }

    selectedText.textContent = "城市搜索暂时不可用";
    coordinateText.textContent = "请检查网络后再试";
    return [];
  }
}

function normalizePlace(item) {
  const address = item.address || {};
  const cityName = address.city
    || address.town
    || address.village
    || address.municipality
    || address.county
    || item.name
    || item.display_name.split(",")[0];

  return {
    name: cityName,
    displayName: item.display_name,
    countryCode: (address.country_code || "").toUpperCase(),
    countryName: address.country || "",
    lat: Number(item.lat),
    lng: Number(item.lon),
    category: item.category,
    type: item.type,
  };
}

function renderSuggestions(results) {
  if (!placeInput.value.trim()) {
    hideSuggestions();
    return;
  }

  if (!results.length) {
    suggestions.innerHTML = '<div class="suggestion-status">没有找到匹配城市</div>';
    suggestions.classList.add("is-open");
    return;
  }

  suggestions.innerHTML = results.map((result, index) => `
    <button class="suggestion-item" type="button" data-suggestion-index="${index}" role="option">
      <span>${escapeHtml(result.name)}</span>
      <small>${escapeHtml(result.displayName)}</small>
    </button>
  `).join("");
  suggestions.classList.add("is-open");
}

function hideSuggestions() {
  suggestions.classList.remove("is-open");
}

function selectSearchResult(result) {
  selectedPlace = result;
  placeInput.value = result.name;
  hideSuggestions();
  setDraftLocation(result.lat, result.lng, result.name, result.displayName);
}

async function loadCountryLayer() {
  try {
    const response = await fetch(COUNTRY_GEOJSON_URL);

    if (!response.ok) {
      throw new Error("Country layer failed");
    }

    const data = await response.json();
    countryLayer = L.geoJSON(data, {
      pane: "overlayPane",
      interactive: false,
      style: countryStyle,
    }).addTo(countryLayerGroup);
    countryLayer.bringToBack();
    updateCountryStyles();
  } catch {
    selectedText.textContent = "国家阴影层暂时不可用";
    coordinateText.textContent = "足迹标记仍然可以正常使用";
  }
}

function countryStyle(feature) {
  const isVisited = getVisitedCountryCodes().has(getCountryCode(feature));

  return {
    color: isVisited ? "#0f766e" : "#263241",
    fillColor: isVisited ? VISITED_COUNTRY_COLOR : "#111827",
    fillOpacity: isVisited ? 0.58 : 0.36,
    opacity: isVisited ? 0.92 : 0.28,
    weight: isVisited ? 1.35 : 0.7,
  };
}

function updateCountryStyles() {
  if (!countryLayer) {
    return;
  }

  countryLayer.setStyle(countryStyle);
}

function resetMapPromptIfEmpty() {
  if (footprints.length) {
    return;
  }

  selectedText.textContent = "搜索城市添加足迹";
  coordinateText.textContent = "选择联想结果后会自动定位到地图";
  fitWorldToViewport();
}

function fitWorldToViewport() {
  map.invalidateSize();

  const size = map.getSize();
  const coverZoom = Math.max(2, Math.log2(size.x / 256));

  map.setMinZoom(coverZoom);
  map.setView(WORLD_CENTER, coverZoom, { animate: false });
}

function getCountryCode(feature) {
  const properties = feature.properties || {};
  return String(
    properties["ISO3166-1-Alpha-2"]
      || properties.ISO_A2
      || properties.iso_a2
      || properties.iso2
      || "",
  ).toUpperCase();
}

function getVisitedCountryCodes() {
  const codes = new Set();

  footprints.forEach((footprint) => {
    const code = String(footprint.countryCode || "").toUpperCase();

    if (!code) {
      return;
    }

    codes.add(code);
    (COUNTRY_CODE_ALIASES[code] || []).forEach((alias) => codes.add(alias));
  });

  return codes;
}

function loadFootprints() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveFootprints() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(footprints));
}

function render() {
  countText.textContent = String(footprints.length);
  emptyState.classList.toggle("is-hidden", footprints.length > 0);
  clearButton.disabled = footprints.length === 0;
  renderList();
  renderMarkers();
  updateCountryStyles();
}

function renderList() {
  list.innerHTML = footprints.map((footprint) => {
    const date = footprint.date ? escapeHtml(footprint.date) : "未填写日期";
    const note = footprint.note ? `<p class="note">${escapeHtml(footprint.note)}</p>` : "";
    const location = footprint.displayName || `${formatCoordinate(footprint.lat, "lat")}，${formatCoordinate(footprint.lng, "lng")}`;

    return `
      <li class="footprint-card" data-footprint-id="${footprint.id}">
        <div class="card-top">
          <div>
            <div class="place-name">${escapeHtml(footprint.place)}</div>
            <div class="meta">${date}<br>${escapeHtml(location)}</div>
          </div>
          <button class="delete-button" type="button" data-delete-id="${footprint.id}" aria-label="删除 ${escapeHtml(footprint.place)}">×</button>
        </div>
        ${note}
      </li>
    `;
  }).join("");
}

function renderMarkers() {
  markerLayer.clearLayers();

  footprints.forEach((footprint) => {
    const marker = L.circleMarker([footprint.lat, footprint.lng], {
      radius: 7,
      color: "#ffffff",
      fillColor: VISITED_CITY_COLOR,
      fillOpacity: 0.95,
      opacity: 1,
      weight: 2.5,
    }).addTo(markerLayer);

    marker.bindPopup(`
      <div class="popup-title">${escapeHtml(footprint.place)}</div>
      <div class="popup-meta">
        ${footprint.date ? escapeHtml(footprint.date) : "未填写日期"}<br>
        ${escapeHtml(footprint.displayName || `${formatCoordinate(footprint.lat, "lat")}，${formatCoordinate(footprint.lng, "lng")}`)}
      </div>
      ${footprint.note ? `<p>${escapeHtml(footprint.note)}</p>` : ""}
    `);
  });
}

function setDraftLocation(lat, lng, label, description) {
  const fixedLat = Number(lat.toFixed(6));
  const fixedLng = Number(lng.toFixed(6));

  selectedText.textContent = `已选择：${label}`;
  coordinateText.textContent = description || `${formatCoordinate(fixedLat, "lat")}，${formatCoordinate(fixedLng, "lng")}`;
  map.setView([fixedLat, fixedLng], Math.max(map.getZoom(), 7));

  if (draftMarker) {
    draftMarker.setLatLng([fixedLat, fixedLng]);
  } else {
    draftMarker = L.circleMarker([fixedLat, fixedLng], {
      radius: 8,
      color: "#0f766e",
      weight: 3,
      fillColor: "#ffffff",
      fillOpacity: 1,
    }).addTo(map);
  }

  draftMarker.bindTooltip("待添加足迹", { permanent: false, direction: "top" });
}

function clearDraftMarker() {
  if (draftMarker) {
    map.removeLayer(draftMarker);
    draftMarker = null;
  }
}

function formatCoordinate(value, type) {
  const direction = type === "lat"
    ? (value >= 0 ? "N" : "S")
    : (value >= 0 ? "E" : "W");
  return `${Math.abs(Number(value)).toFixed(4)}°${direction}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
