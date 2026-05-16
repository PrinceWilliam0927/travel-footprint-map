const STORAGE_KEY = "travel-footprints";
const LANGUAGE_KEY = "travel-footprints-language";
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

const translations = {
  "zh-CN": {
    htmlLang: "zh-CN",
    documentTitle: "我的世界足迹地图",
    languageLabel: "语言",
    languageSelectLabel: "选择语言",
    sidebarLabel: "足迹管理",
    mapLabel: "世界地图",
    suggestionsLabel: "城市搜索结果",
    listLabel: "足迹列表",
    appTitle: "我的世界足迹",
    cityLabel: "城市",
    cityPlaceholder: "输入城市名，例如：上海、巴黎、东京",
    dateLabel: "日期",
    noteLabel: "备注",
    notePlaceholder: "写一点这次旅程的记忆",
    addButton: "添加足迹",
    locateButton: "定位到我",
    visitedPlaces: "去过的地方",
    clearButton: "清空",
    emptyState: "输入城市名并选择搜索结果，开始记录第一段旅程。",
    footprintUnit: "个地点已点亮",
    initialTitle: "搜索城市添加足迹",
    initialDetail: "选择联想结果后会自动定位到地图",
    minSearchDetail: "至少输入 2 个字开始联想搜索",
    searching: "正在搜索...",
    noCityFound: "没有找到这个城市",
    noCityFoundDetail: "请换一个更完整的城市名再试",
    noSuggestions: "没有找到匹配城市",
    searchUnavailable: "城市搜索暂时不可用",
    searchUnavailableDetail: "请检查网络后再试",
    footprintAdded: "足迹已添加",
    confirmClear: "确定清空所有足迹吗？",
    geolocationUnsupported: "当前浏览器不支持定位",
    locating: "正在获取当前位置...",
    currentLocation: "我的当前位置",
    locationFailed: "定位失败",
    locationFailedDetail: "可以输入城市名搜索添加",
    countryLayerUnavailable: "国家阴影层暂时不可用",
    countryLayerUnavailableDetail: "足迹标记仍然可以正常使用",
    dateMissing: "未填写日期",
    deleteLabel: "删除 {place}",
    selectedTitle: "已选择：{place}",
    draftTooltip: "待添加足迹",
    coordinateJoin: "，",
    searchLanguage: "zh-CN,zh,en",
  },
  en: {
    htmlLang: "en",
    documentTitle: "My World Footprint Map",
    languageLabel: "Language",
    languageSelectLabel: "Choose language",
    sidebarLabel: "Footprint management",
    mapLabel: "World map",
    suggestionsLabel: "City search results",
    listLabel: "Footprint list",
    appTitle: "My World Footprints",
    cityLabel: "City",
    cityPlaceholder: "Enter a city, e.g. Shanghai, Paris, Tokyo",
    dateLabel: "Date",
    noteLabel: "Note",
    notePlaceholder: "Write a memory from this trip",
    addButton: "Add Footprint",
    locateButton: "Locate Me",
    visitedPlaces: "Visited Places",
    clearButton: "Clear",
    emptyState: "Search for a city and choose a result to start your first footprint.",
    footprintUnit: "places lit up",
    initialTitle: "Search a city to add a footprint",
    initialDetail: "Choose a suggestion to locate it on the map",
    minSearchDetail: "Type at least 2 characters to search",
    searching: "Searching...",
    noCityFound: "City not found",
    noCityFoundDetail: "Try a more complete city name",
    noSuggestions: "No matching cities found",
    searchUnavailable: "City search is unavailable",
    searchUnavailableDetail: "Check your network and try again",
    footprintAdded: "Footprint added",
    confirmClear: "Clear all footprints?",
    geolocationUnsupported: "This browser does not support location",
    locating: "Getting your current location...",
    currentLocation: "My current location",
    locationFailed: "Location failed",
    locationFailedDetail: "You can search for a city instead",
    countryLayerUnavailable: "Country shading is unavailable",
    countryLayerUnavailableDetail: "Footprint markers still work normally",
    dateMissing: "No date",
    deleteLabel: "Delete {place}",
    selectedTitle: "Selected: {place}",
    draftTooltip: "Pending footprint",
    coordinateJoin: ", ",
    searchLanguage: "en,zh-CN,zh",
  },
};

const form = document.querySelector("#footprintForm");
const placeInput = document.querySelector("#placeInput");
const suggestions = document.querySelector("#suggestions");
const dateInput = document.querySelector("#dateInput");
const noteInput = document.querySelector("#noteInput");
const list = document.querySelector("#footprintList");
const emptyState = document.querySelector("#emptyState");
const countText = document.querySelector("#footprintCount");
const footprintUnit = document.querySelector("#footprintUnit");
const clearButton = document.querySelector("#clearButton");
const locateButton = document.querySelector("#locateButton");
const selectedText = document.querySelector("#selectedText");
const coordinateText = document.querySelector("#coordinateText");
const languageSelect = document.querySelector("#languageSelect");

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

let currentLanguage = loadLanguage();
let countryLayer = null;
let draftMarker = null;
let selectedPlace = null;
let searchTimer = null;
let searchController = null;
let currentSuggestions = [];
let statusState = { title: "initialTitle", detail: "initialDetail", titleParams: {}, detailParams: {} };
let footprints = loadFootprints();

languageSelect.value = currentLanguage;
applyLanguage();
fitWorldToViewport();
render();
loadCountryLayer();

window.addEventListener("resize", () => {
  map.invalidateSize();

  if (!footprints.length && !selectedPlace) {
    fitWorldToViewport();
  }
});

languageSelect.addEventListener("change", () => {
  currentLanguage = languageSelect.value;
  localStorage.setItem(LANGUAGE_KEY, currentLanguage);
  applyLanguage();
  renderSuggestions(currentSuggestions);
  render();
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
      setStatus("noCityFound", "noCityFoundDetail");
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
  setStatus("footprintAdded", null, {}, {}, footprint.displayName);
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
  if (!footprints.length || !window.confirm(t("confirmClear"))) {
    return;
  }

  footprints = [];
  saveFootprints();
  render();
  resetMapPromptIfEmpty();
});

locateButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("geolocationUnsupported", null);
    return;
  }

  setStatus("locating", null);
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const place = {
        name: t("currentLocation"),
        displayName: t("currentLocation"),
        countryCode: "",
        countryName: "",
        lat: latitude,
        lng: longitude,
      };
      selectSearchResult(place);
      map.setView([latitude, longitude], 9);
    },
    () => {
      setStatus("locationFailed", "locationFailedDetail");
    },
    { enableHighAccuracy: true, timeout: 8000 },
  );
});

function loadLanguage() {
  const saved = localStorage.getItem(LANGUAGE_KEY);
  if (translations[saved]) {
    return saved;
  }

  return navigator.language && navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function applyLanguage() {
  document.documentElement.lang = t("htmlLang");
  document.title = t("documentTitle");

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });

  footprintUnit.textContent = t("footprintUnit");
  updateStatusText();
}

function t(key, params = {}) {
  const template = translations[currentLanguage][key] || translations["zh-CN"][key] || key;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    template,
  );
}

function setStatus(title, detail, titleParams = {}, detailParams = {}, literalDetail = null) {
  statusState = { title, detail, titleParams, detailParams, literalDetail };
  updateStatusText();
}

function updateStatusText() {
  selectedText.textContent = t(statusState.title, statusState.titleParams);
  coordinateText.textContent = statusState.literalDetail
    || (statusState.detail ? t(statusState.detail, statusState.detailParams) : "");
}

function scheduleSearch(query) {
  window.clearTimeout(searchTimer);

  if (query.length < 2) {
    currentSuggestions = [];
    renderSuggestions([]);
    setStatus("initialTitle", "minSearchDetail");
    return;
  }

  suggestions.innerHTML = `<div class="suggestion-status">${t("searching")}</div>`;
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
    "accept-language": t("searchLanguage"),
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

    setStatus("searchUnavailable", "searchUnavailableDetail");
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
    suggestions.innerHTML = `<div class="suggestion-status">${t("noSuggestions")}</div>`;
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
    setStatus("countryLayerUnavailable", "countryLayerUnavailableDetail");
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

  setStatus("initialTitle", "initialDetail");
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
  footprintUnit.textContent = t("footprintUnit");
  emptyState.classList.toggle("is-hidden", footprints.length > 0);
  clearButton.disabled = footprints.length === 0;
  renderList();
  renderMarkers();
  updateCountryStyles();
}

function renderList() {
  list.innerHTML = footprints.map((footprint) => {
    const date = footprint.date ? escapeHtml(footprint.date) : t("dateMissing");
    const note = footprint.note ? `<p class="note">${escapeHtml(footprint.note)}</p>` : "";
    const location = footprint.displayName || `${formatCoordinate(footprint.lat, "lat")}${t("coordinateJoin")}${formatCoordinate(footprint.lng, "lng")}`;

    return `
      <li class="footprint-card" data-footprint-id="${footprint.id}">
        <div class="card-top">
          <div>
            <div class="place-name">${escapeHtml(footprint.place)}</div>
            <div class="meta">${date}<br>${escapeHtml(location)}</div>
          </div>
          <button class="delete-button" type="button" data-delete-id="${footprint.id}" aria-label="${escapeHtml(t("deleteLabel", { place: footprint.place }))}">×</button>
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
        ${footprint.date ? escapeHtml(footprint.date) : t("dateMissing")}<br>
        ${escapeHtml(footprint.displayName || `${formatCoordinate(footprint.lat, "lat")}${t("coordinateJoin")}${formatCoordinate(footprint.lng, "lng")}`)}
      </div>
      ${footprint.note ? `<p>${escapeHtml(footprint.note)}</p>` : ""}
    `);
  });
}

function setDraftLocation(lat, lng, label, description) {
  const fixedLat = Number(lat.toFixed(6));
  const fixedLng = Number(lng.toFixed(6));

  setStatus("selectedTitle", null, { place: label }, {}, description || `${formatCoordinate(fixedLat, "lat")}${t("coordinateJoin")}${formatCoordinate(fixedLng, "lng")}`);
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

  draftMarker.bindTooltip(t("draftTooltip"), { permanent: false, direction: "top" });
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
