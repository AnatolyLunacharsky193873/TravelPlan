const sampleStops = [
  { id: crypto.randomUUID(), name: "断桥残雪", address: "北山街 · 西湖区", lng: 120.1491, lat: 30.2592 },
  { id: crypto.randomUUID(), name: "灵隐寺", address: "法云弄1号 · 西湖区", lng: 120.1014, lat: 30.2408 },
  { id: crypto.randomUUID(), name: "龙井村", address: "龙井路 · 西湖区", lng: 120.1063, lat: 30.2186 },
  { id: crypto.randomUUID(), name: "河坊街", address: "上城区 · 吴山脚下", lng: 120.1745, lat: 30.2384 },
  { id: crypto.randomUUID(), name: "西湖文化广场", address: "环城北路 · 拱墅区", lng: 120.1654, lat: 30.2794 }
];

const state = {
  stops: JSON.parse(localStorage.getItem("trip-stops") || "null") || sampleStops,
  mode: "driving",
  map: null,
  amapReady: false,
  routeLayers: [],
  markers: [],
  busy: false
};

const el = id => document.getElementById(id);
const refs = {
  stopList: el("stopList"), pointCount: el("pointCount"), routeOrder: el("routeOrder"),
  duration: el("durationValue"), distance: el("distanceValue"), stopValue: el("stopValue"),
  savedTime: el("savedTime"), status: el("statusLine"), demoPins: el("demoPins"),
  optimize: el("optimizeButton"), dialog: el("settingsDialog"), toast: el("toast")
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function saveStops() {
  localStorage.setItem("trip-stops", JSON.stringify(state.stops));
}

function renderStops() {
  refs.stopList.innerHTML = state.stops.map((stop, index) => `
    <li class="stop-item" data-id="${stop.id}">
      <span class="stop-number">${index + 1}</span>
      <span class="stop-copy"><strong>${escapeHtml(stop.name)}</strong><small>${escapeHtml(stop.address || "已标记地点")}</small></span>
      <span class="stop-actions">
        ${index > 1 ? `<button class="mini-button" data-action="up" title="向前移动" aria-label="将${escapeHtml(stop.name)}向前移动"><svg viewBox="0 0 24 24"><path d="m7 14 5-5 5 5"/></svg></button>` : ""}
        ${index > 0 ? `<button class="mini-button" data-action="remove" title="删除" aria-label="删除${escapeHtml(stop.name)}"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13"/></svg></button>` : ""}
      </span>
    </li>`).join("");
  refs.pointCount.textContent = `${state.stops.length} 个地点`;
  refs.stopValue.textContent = `${state.stops.length} 站`;
  refs.routeOrder.innerHTML = state.stops.map((_, index) => `${index ? '<span class="order-arrow">→</span>' : ""}<span class="order-dot">${index + 1}</span>`).join("");
  renderDemoPins();
  if (state.amapReady) renderMarkers();
  saveStops();
}

function renderDemoPins() {
  const positions = [[27,36],[39,29],[47,52],[73,54],[76,39],[61,68],[52,24],[84,67]];
  refs.demoPins.innerHTML = state.stops.map((_, index) => {
    const p = positions[index % positions.length];
    return `<span class="demo-pin" style="left:${p[0]}%;top:${p[1]}%">${index + 1}</span>`;
  }).join("");
}

function renderMarkers() {
  state.map.remove(state.markers);
  state.markers = state.stops.filter(s => Number.isFinite(s.lng)).map((stop, index) => new AMap.Marker({
    position: [stop.lng, stop.lat],
    title: stop.name,
    label: { content: `<b style="display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:${index === 0 ? "#ff7657" : "#12211c"};color:white;border:2px solid white;box-shadow:0 3px 9px #0004">${index + 1}</b>`, direction: "center" },
    content: "<span></span>",
    offset: new AMap.Pixel(0, 0)
  }));
  state.map.add(state.markers);
}

function moveStop(id, direction) {
  const index = state.stops.findIndex(s => s.id === id);
  const target = index + direction;
  if (index <= 0 || target <= 0 || target >= state.stops.length) return;
  [state.stops[index], state.stops[target]] = [state.stops[target], state.stops[index]];
  renderStops();
}

function removeStop(id) {
  if (state.stops.length <= 2) return showToast("至少保留两个地点");
  state.stops = state.stops.filter(s => s.id !== id);
  renderStops();
}

refs.stopList.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.closest(".stop-item").dataset.id;
  button.dataset.action === "remove" ? removeStop(id) : moveStop(id, -1);
});

document.querySelectorAll(".mode").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".mode").forEach(item => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  state.mode = button.dataset.mode;
  const realTraffic = state.mode === "driving" && state.amapReady;
  document.querySelector(".traffic-pill").classList.toggle("live", realTraffic);
  el("trafficState").textContent = realTraffic ? "实时" : state.amapReady ? "不适用" : "演示";
  refs.status.textContent = state.amapReady ? `已切换为${button.textContent.trim()}路线，点击智能排序重新规划` : "当前为演示路线 · 设置高德 Key 后启用真实路况";
}));

el("addPlaceForm").addEventListener("submit", async event => {
  event.preventDefault();
  const input = el("placeInput");
  const keyword = input.value.trim();
  if (!keyword) return;
  if (state.stops.length >= 18) return showToast("高德驾车路线最多支持 16 个途经点");
  if (!state.amapReady) {
    state.stops.push({ id: crypto.randomUUID(), name: keyword, address: "演示地点 · 连接地图后可精确定位" });
    input.value = "";
    renderStops();
    return showToast("已加入演示行程；连接高德后可搜索真实位置");
  }
  setBusy(true, "正在查找地点…");
  try {
    const poi = await searchPlace(keyword);
    state.stops.push({ id: crypto.randomUUID(), name: poi.name, address: poi.address || poi.district || "高德地点", lng: poi.location.lng, lat: poi.location.lat });
    input.value = "";
    renderStops();
    state.map.setFitView(state.markers, false, [90,90,90,90]);
    showToast(`已添加 ${poi.name}`);
  } catch (error) { showToast(error.message || "没有找到这个地点"); }
  finally { setBusy(false); }
});

function searchPlace(keyword) {
  return new Promise((resolve, reject) => {
    AMap.plugin("AMap.PlaceSearch", () => {
      const service = new AMap.PlaceSearch({ pageSize: 1, extensions: "base" });
      service.search(keyword, (status, result) => {
        const poi = result?.poiList?.pois?.[0];
        status === "complete" && poi ? resolve(poi) : reject(new Error("没有找到这个地点，请换个关键词"));
      });
    });
  });
}

function setBusy(value, text) {
  state.busy = value;
  refs.optimize.disabled = value;
  refs.status.textContent = text || (state.amapReady ? "真实地图已连接，可按当前路况重新规划" : "当前为演示路线 · 设置高德 Key 后启用真实路况");
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => refs.toast.classList.remove("show"), 2600);
}

function formatDuration(seconds) {
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins >= 60 ? `${Math.floor(mins / 60)} 小时 ${mins % 60} 分` : `${mins} 分钟`;
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${Math.round(meters)} 米`;
}

function haversine(a, b) {
  if (!Number.isFinite(a.lng) || !Number.isFinite(b.lng)) return 900 + Math.random() * 500;
  const rad = x => x * Math.PI / 180, R = 6371000;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const q = Math.sin(dLat/2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

function demoOptimize() {
  const start = state.stops[0], remaining = state.stops.slice(1), ordered = [start];
  while (remaining.length) {
    const last = ordered.at(-1);
    remaining.sort((a,b) => haversine(last,a) - haversine(last,b));
    ordered.push(remaining.shift());
  }
  state.stops = ordered;
  renderStops();
  refs.savedTime.textContent = "预计省 28 分钟";
  showToast("已按地点距离优化演示顺序");
}

function getRouteService(mode, options = {}) {
  const base = { hideMarkers: true, autoFitView: false, ...options };
  if (mode === "walking") return new AMap.Walking(base);
  if (mode === "riding") return new AMap.Riding(base);
  return new AMap.Driving({ policy: 0, ...base });
}

function querySegment(a, b, mode) {
  return new Promise((resolve, reject) => {
    const service = getRouteService(mode);
    service.search([a.lng, a.lat], [b.lng, b.lat], (status, result) => {
      const route = result?.routes?.[0];
      if (status === "complete" && route) resolve({ time: Number(route.time) || 0, distance: Number(route.distance) || 0 });
      else reject(new Error("部分路段暂时无法规划"));
    });
  });
}

async function buildMatrix(stops, mode) {
  const matrix = Array.from({ length: stops.length }, () => Array(stops.length).fill(0));
  const distanceMatrix = Array.from({ length: stops.length }, () => Array(stops.length).fill(0));
  let done = 0, total = stops.length * (stops.length - 1);
  for (let i = 0; i < stops.length; i++) {
    for (let j = 0; j < stops.length; j++) {
      if (i === j) continue;
      refs.status.textContent = `正在读取实时路线 ${++done}/${total}…`;
      const result = await querySegment(stops[i], stops[j], mode);
      matrix[i][j] = result.time || Math.max(60, result.distance / 8);
      distanceMatrix[i][j] = result.distance;
    }
  }
  return { matrix, distanceMatrix };
}

function exactOrder(matrix, roundTrip) {
  const n = matrix.length;
  if (n > 10) return greedyOrder(matrix);
  const size = 1 << (n - 1), dp = Array.from({ length: size }, () => Array(n).fill(Infinity));
  const parent = Array.from({ length: size }, () => Array(n).fill(-1));
  for (let j = 1; j < n; j++) dp[1 << (j - 1)][j] = matrix[0][j];
  for (let mask = 1; mask < size; mask++) {
    for (let j = 1; j < n; j++) {
      if (!(mask & (1 << (j - 1)))) continue;
      const prevMask = mask ^ (1 << (j - 1));
      if (!prevMask) continue;
      for (let k = 1; k < n; k++) {
        if (!(prevMask & (1 << (k - 1)))) continue;
        const cost = dp[prevMask][k] + matrix[k][j];
        if (cost < dp[mask][j]) { dp[mask][j] = cost; parent[mask][j] = k; }
      }
    }
  }
  const full = size - 1;
  let end = 1, best = Infinity;
  for (let j = 1; j < n; j++) {
    const cost = dp[full][j] + (roundTrip ? matrix[j][0] : 0);
    if (cost < best) { best = cost; end = j; }
  }
  const order = [];
  let mask = full, current = end;
  while (current > 0) {
    order.push(current);
    const next = parent[mask][current];
    mask ^= 1 << (current - 1);
    current = next;
  }
  return [0, ...order.reverse()];
}

function greedyOrder(matrix) {
  const remaining = new Set(matrix.map((_, i) => i).slice(1)), order = [0];
  while (remaining.size) {
    const from = order.at(-1);
    const next = [...remaining].sort((a,b) => matrix[from][a] - matrix[from][b])[0];
    order.push(next); remaining.delete(next);
  }
  return order;
}

function routeCost(order, matrix, roundTrip) {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) total += matrix[order[i]][order[i+1]];
  if (roundTrip) total += matrix[order.at(-1)][order[0]];
  return total;
}

async function drawFinalRoute() {
  state.routeLayers.forEach(layer => { try { layer.clear(); } catch {} });
  state.routeLayers = [];
  const points = [...state.stops];
  if (el("roundTrip").checked) points.push(state.stops[0]);
  let totalTime = 0, totalDistance = 0;
  if (state.mode === "driving" && points.length <= 18) {
    const service = getRouteService("driving", { map: state.map });
    state.routeLayers.push(service);
    const start = points[0], end = points.at(-1), waypoints = points.slice(1,-1).map(s => [s.lng,s.lat]);
    const result = await new Promise((resolve, reject) => service.search([start.lng,start.lat],[end.lng,end.lat],{ waypoints },(status,data) => status === "complete" ? resolve(data) : reject(new Error("路线绘制失败"))));
    totalTime = Number(result.routes?.[0]?.time) || 0;
    totalDistance = Number(result.routes?.[0]?.distance) || 0;
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const service = getRouteService(state.mode, { map: state.map });
      state.routeLayers.push(service);
      const data = await new Promise((resolve, reject) => service.search([points[i].lng,points[i].lat],[points[i+1].lng,points[i+1].lat],(status,result) => status === "complete" ? resolve(result) : reject(new Error("路线绘制失败"))));
      totalTime += Number(data.routes?.[0]?.time) || 0;
      totalDistance += Number(data.routes?.[0]?.distance) || 0;
    }
  }
  refs.duration.textContent = formatDuration(totalTime);
  refs.distance.textContent = formatDistance(totalDistance);
  setTimeout(() => state.map.setFitView(undefined, false, [90,90,170,440]), 150);
}

async function optimizeRealRoute() {
  if (state.stops.some(s => !Number.isFinite(s.lng))) throw new Error("有演示地点尚未精确定位，请删除后从搜索框重新添加");
  if (state.stops.length > 10) refs.status.textContent = "地点较多，将使用快速优化算法…";
  const original = [...state.stops], roundTrip = el("roundTrip").checked;
  const { matrix } = await buildMatrix(original, state.mode);
  const order = exactOrder(matrix, roundTrip);
  const originalCost = routeCost(original.map((_,i) => i), matrix, roundTrip);
  const optimizedCost = routeCost(order, matrix, roundTrip);
  state.stops = order.map(index => original[index]);
  renderStops();
  refs.savedTime.textContent = optimizedCost < originalCost ? `预计省 ${Math.max(1, Math.round((originalCost - optimizedCost)/60))} 分钟` : "当前顺序已很高效";
  refs.status.textContent = "路线已按当前路况优化";
  await drawFinalRoute();
}

refs.optimize.addEventListener("click", async () => {
  if (state.busy) return;
  if (!state.amapReady) return demoOptimize();
  setBusy(true, "正在读取实时路况并比较路线…");
  try { await optimizeRealRoute(); showToast("路线已完成优化"); }
  catch (error) { refs.status.textContent = error.message; showToast(error.message); }
  finally { setBusy(false); }
});

el("roundTrip").addEventListener("change", () => {
  refs.status.textContent = `已${el("roundTrip").checked ? "开启" : "关闭"}返回起点，点击智能排序更新路线`;
});

el("fitMapButton").addEventListener("click", () => {
  if (state.amapReady) state.map.setFitView(undefined, false, [90,90,170,440]);
  else showToast("演示路线已完整显示");
});

el("settingsButton").addEventListener("click", () => {
  el("amapKey").value = localStorage.getItem("amap-key") || "";
  el("amapSecurity").value = localStorage.getItem("amap-security") || "";
  refs.dialog.showModal();
});

el("saveSettingsButton").addEventListener("click", event => {
  event.preventDefault();
  const key = el("amapKey").value.trim(), security = el("amapSecurity").value.trim();
  if (!key || !security) return showToast("请完整填写 Key 和安全密钥");
  localStorage.setItem("amap-key", key);
  localStorage.setItem("amap-security", security);
  refs.dialog.close();
  location.reload();
});

function loadAMap() {
  const key = localStorage.getItem("amap-key"), security = localStorage.getItem("amap-security");
  if (!key || !security) return;
  window._AMapSecurityConfig = { securityJsCode: security };
  const script = document.createElement("script");
  script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.Driving,AMap.Walking,AMap.Riding,AMap.PlaceSearch`;
  script.onload = initMap;
  script.onerror = () => { refs.status.textContent = "地图加载失败，请检查 Key、密钥与域名白名单"; showToast("高德地图连接失败"); };
  document.head.appendChild(script);
}

function initMap() {
  try {
    state.map = new AMap.Map("map", { viewMode: "2D", zoom: 12, center: [120.1551,30.2553], mapStyle: "amap://styles/whitesmoke", showLabel: true });
    state.amapReady = true;
    el("map").classList.add("ready");
    document.querySelector(".traffic-pill").classList.add("live");
    el("trafficState").textContent = "实时";
    refs.status.textContent = "真实地图已连接，可按当前路况智能排序";
    renderMarkers();
    state.map.setFitView(state.markers, false, [90,90,170,440]);
  } catch { refs.status.textContent = "地图初始化失败，请检查高德配置"; }
}

function registerWebMCP() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  context.registerTool({
    name: "set_trip_points",
    title: "设置旅行地点",
    description: "Replace the visible itinerary with an ordered list of named travel stops. Coordinates are optional in demo mode.",
    inputSchema: { type: "object", properties: { stops: { type: "array", minItems: 2, maxItems: 18, items: { type: "object", properties: { name: { type: "string" }, address: { type: "string" }, lng: { type: "number" }, lat: { type: "number" } }, required: ["name"], additionalProperties: false } } }, required: ["stops"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!Array.isArray(input?.stops) || input.stops.length < 2 || input.stops.length > 18) throw new Error("stops must contain 2 to 18 items");
      state.stops = input.stops.map(s => ({ id: crypto.randomUUID(), name: String(s.name).slice(0,80), address: String(s.address || "AI 添加地点").slice(0,120), lng: Number(s.lng), lat: Number(s.lat) }));
      renderStops();
      return { stopCount: state.stops.length, firstStop: state.stops[0].name };
    }
  });
  context.registerTool({
    name: "optimize_trip_route",
    title: "优化旅行路线",
    description: "Optimize the visible itinerary. Uses live AMap routing when connected, otherwise uses the demo distance model.",
    inputSchema: { type: "object", properties: { roundTrip: { type: "boolean" } }, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      el("roundTrip").checked = Boolean(input?.roundTrip);
      if (state.amapReady) await optimizeRealRoute(); else demoOptimize();
      return { optimized: true, mode: state.amapReady ? "live" : "demo", order: state.stops.map(s => s.name) };
    }
  });
}

renderStops();
loadAMap();
registerWebMCP();
