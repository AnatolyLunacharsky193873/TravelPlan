import { $, esc, sample, state, coord, trip, persist } from "./js/state.js";
import { planOrder, constraints, uniqueRoutes } from "./js/route-engine.js";
import { defaultCities, listCities, searchPlaces } from "./js/place-search.js";
import { query } from "./js/routing-service.js";
import { createMapView } from "./js/map-view.js";

const { renderMarkers, fitMap, pickAt, mapXY, togglePoint, markerMove, zoom } =
  createMapView({ invalidate, update, assign, rolePoints, status });

// UI controller: edits invalidate previews; only explicit confirmation starts routing.
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.remove("show"), 2800);
}
function status(text) {
  $("statusLine").textContent = text;
}
function clearLines() {
  if (state.map && state.lines.length) state.map.remove(state.lines);
  state.lines = [];
  $("demoRoutes").replaceChildren();
}
function invalidate(message = "地点已更新，确认后重新预览路线") {
  state.revision++;
  state.busy = false;
  state.routes = [];
  $("routeSummary").hidden = true;
  clearLines();
  $("optimizeButton").disabled = false;
  status(message);
}
function update() {
  invalidate();
  persist();
  render();
}
function clearAll() {
  state.start = null;
  state.end = null;
  state.via = [];
  state.pick = null;
  state.searchToken++;
  $("searchResults").hidden = true;
  $("placeInput").value = "";
  update();
  status("所有地点已清空，添加两个有效地点即可规划");
}
function rolePoints() {
  return [
    { p: state.start, key: "start", label: "起" },
    ...state.via.map((p, i) => ({ p, key: p.id, label: String(i + 1) })),
    ...(!state.round ? [{ p: state.end, key: "end", label: "终" }] : []),
  ].filter((x) => x.p);
}
function render() {
  for (const role of ["start", "end"]) {
    const p = state[role],
      button = $(role === "start" ? "toggleStart" : "toggleEnd");
    button.hidden = !p || (role === "end" && state.round);
    button.textContent = p?.enabled === false ? "停用" : "有效";
    button.setAttribute("aria-pressed", String(p?.enabled !== false));
    $(role + "Input").classList.toggle(
      "disabled-endpoint",
      p?.enabled === false,
    );
  }
  $("startInput").value = state.start?.name || "";
  $("endInput").value = state.round
    ? state.start?.name || ""
    : state.end?.name || "";
  $("endInput").disabled = state.round;
  document
    .querySelectorAll('[data-pick="end"],[data-remove="end"]')
    .forEach((b) => (b.disabled = state.round));
  $("swapEndpoints").disabled = state.round;
  $("roundTrip").checked = state.round;
  $("sortStops").checked = state.sort;
  document.querySelectorAll(".mode").forEach((b) => {
    const selected = b.dataset.mode === state.mode;
    b.classList.toggle("active", selected);
    b.setAttribute("aria-pressed", String(selected));
  });
  $("pointCount").textContent =
    trip().length + " 有效 / " + rolePoints().length + " 个地点";
  $("stopList").innerHTML = state.via.length
    ? state.via
        .map(
          (p, i) =>
            `<li class="stop-item ${p.enabled === false ? "disabled-stop" : ""}" data-id="${p.id}"><button class="stop-number" data-action="toggle" aria-pressed="${p.enabled !== false}" aria-label="${esc(p.name)}：${p.enabled === false ? "已停用，点击启用" : "有效，点击停用"}">${p.enabled === false ? "−" : i + 1}</button><span class="stop-copy"><strong>${esc(p.name)}</strong><small>${esc(p.address || "可拖动地图标记调整位置")}</small></span><span class="stop-actions"><button class="mini-button" data-action="start" title="设为起点" aria-label="将${esc(p.name)}设为起点">起</button><button class="mini-button" data-action="end" title="设为终点" aria-label="将${esc(p.name)}设为终点">终</button>${i ? '<button class="mini-button" data-action="up" aria-label="途经点上移">↑</button>' : ""}<button class="remove-button" data-action="remove" aria-label="删除${esc(p.name)}">×</button></span></li>`,
        )
        .join("")
    : '<li class="empty-stops">可添加想去的景点，也可直接规划两点路线。</li>';
  const live = state.ready && state.mode === "driving";
  $("trafficState").textContent = live
    ? "已接入"
    : state.ready
      ? "无需路况"
      : "未接入";
  document.querySelector(".traffic-pill").classList.toggle("live", live);
  $("mapHint").textContent = state.pick
    ? "点击地图选择" +
      { start: "起点", end: "终点", via: "途经点" }[state.pick] +
      " · 再次点击选点按钮可取消"
    : (state.ready ? "" : "示意地图 · ") +
      "点击标记启停 · 拖动调整位置 · 滚轮缩放";
  $("demoMap").classList.toggle("picking", !!state.pick);
  renderMarkers();
}
function assign(role, p) {
  if (role === "start") state.start = p;
  else if (role === "end") {
    state.round = false;
    state.end = p;
  } else {
    if (state.via.length >= 16) return toast("最多添加 16 个途经点");
    state.via.push(p);
  }
  state.pick = null;
  update();
}
$("clearAll").onclick = clearAll;
$("toggleStart").onclick = () => togglePoint("start");
$("toggleEnd").onclick = () => togglePoint("end");
document.querySelectorAll("[data-remove]").forEach(
  (b) =>
    (b.onclick = () => {
      state[b.dataset.remove] = null;
      update();
    }),
);
$("swapEndpoints").onclick = () => {
  [state.start, state.end] = [state.end, state.start];
  update();
};
$("stopList").onclick = (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const index = state.via.findIndex(
    (p) => p.id === b.closest("[data-id]").dataset.id,
  );
  if (index < 0) return;
  const action = b.dataset.action;
  if (action === "toggle") {
    togglePoint(state.via[index].id);
    return;
  }
  if (action === "up") {
    [state.via[index - 1], state.via[index]] = [
      state.via[index],
      state.via[index - 1],
    ];
    update();
    return;
  }
  const [p] = state.via.splice(index, 1);
  if (action === "start" || action === "end") {
    if (state[action]) state.via.splice(index, 0, state[action]);
    state[action] = p;
    if (action === "end") state.round = false;
  }
  update();
};
document.querySelectorAll(".mode").forEach(
  (b) =>
    (b.onclick = () => {
      state.mode = b.dataset.mode;
      update();
    }),
);
$("roundTrip").onchange = (e) => {
  state.round = e.target.checked;
  update();
};
$("sortStops").onchange = (e) => {
  state.sort = e.target.checked;
  update();
};
document.querySelectorAll("[data-pick]").forEach(
  (b) =>
    (b.onclick = () => {
      state.pick = state.pick === b.dataset.pick ? null : b.dataset.pick;
      render();
    }),
);
$("pickVia").onclick = () => {
  state.pick = state.pick === "via" ? null : "via";
  render();
};
function editedEndpoint(role, input) {
  const name = input.value.trim(),
    previous = state[role];
  state[role] = name
    ? previous?.name === name
      ? previous
      : { id: previous?.id || crypto.randomUUID(), name }
    : null;
  invalidate();
  persist();
  renderMarkers();
  if (state.round) $("endInput").value = state.start?.name || "";
}
["start", "end"].forEach((role) => {
  const input = $(role + "Input");
  input.oninput = () => {
    editedEndpoint(role, input);
    state.searchToken++;
    $("searchResults").hidden = true;
    clearTimeout(input.timer);
    const token = state.searchToken;
    if (input.value.trim())
      input.timer = setTimeout(
        () => search(role, input.value.trim(), token),
        550,
      );
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(input.timer);
      search(role, input.value.trim(), ++state.searchToken);
    }
  };
});
$("addPlaceForm").onsubmit = (e) => {
  e.preventDefault();
  search("via", $("placeInput").value.trim(), ++state.searchToken);
};
function importedLocation(value) {
  const text = value.trim();
  const direct = text.match(
    /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,，]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
  );
  if (direct) {
    const first = Number(direct[1]),
      second = Number(direct[2]);
    const [lng, lat] =
      Math.abs(first) <= 90 && Math.abs(second) > 90
        ? [second, first]
        : [first, second];
    if (Math.abs(lng) <= 180 && Math.abs(lat) <= 90)
      return {
        id: crypto.randomUUID(),
        name: "坐标点",
        address: lng.toFixed(6) + ", " + lat.toFixed(6),
        lng,
        lat,
      };
  }
  if (!/^https?:\/\//i.test(text)) return null;
  const parsed = new URL(text);
  if (!["maps.apple.com", "maps.apple"].includes(parsed.hostname)) return null;
  try {
    const url = new URL(text),
      pair = url.searchParams.get("ll") || url.searchParams.get("coordinate");
    if (!pair)
      throw new Error(
        "这个 Apple 地图链接不含坐标。请在 Apple 地图打开该地点，选择“共享 → 拷贝”后再粘贴",
      );
    const [lat, lng] = pair.split(",").map(Number);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      throw new Error("Apple 地图链接中的坐标无法识别");
    return {
      id: crypto.randomUUID(),
      name:
        url.searchParams.get("q") ||
        url.searchParams.get("name") ||
        "Apple 地图地点",
      address: url.searchParams.get("address") || "从 Apple 地图导入",
      lng,
      lat,
    };
  } catch (error) {
    throw new Error(error.message || "无法读取 Apple 地图链接");
  }
}
async function search(role, keyword, token) {
  if (!keyword || token !== state.searchToken) return;
  try {
    const imported = importedLocation(keyword);
    if (imported) {
      assign(role, imported);
      if (role === "via") $("placeInput").value = "";
      $("searchResults").hidden = true;
      fitMap();
      toast("已手动导入地点，请核对地图位置（不受搜索城市限制）");
      return;
    }
  } catch (error) {
    $("searchResults").hidden = false;
    $("searchResults").innerHTML = "<p>" + esc(error.message) + "</p>";
    return;
  }
  if (!state.ready) {
    if (state.city) {
      status("请先连接高德，以核实搜索结果所属城市；仍可手动选点。");
      return;
    }
    const match = sample.find((p) => p.name === keyword);
    if (role === "via")
      assign(
        role,
        match
          ? { ...match, id: crypto.randomUUID() }
          : {
              id: crypto.randomUUID(),
              name: keyword,
              address: "待接入高德后定位",
            },
      );
    else if (match) {
      state[role] = { ...match, id: state[role]?.id || crypto.randomUUID() };
      update();
    }
    status("当前为示意地图。接入高德后可搜索真实地点；也可用地图选点体验。");
    return;
  }
  const box = $("searchResults");
  box.hidden = false;
  box.innerHTML = "<p>正在搜索地点…</p>";
  try {
    const pois = await searchPlaces(AMap, keyword, state.city);
    if (token !== state.searchToken) return;
    box.innerHTML = pois
      .map(
        (p, i) =>
          `<button data-poi="${i}"><strong>${esc(p.name)}</strong><small>${esc(p.address || "地址信息暂无")} · ${esc(p.source || "高德")}</small></button>`,
      )
      .join("");
    box.onclick = (e) => {
      const b = e.target.closest("[data-poi]");
      if (!b) return;
      const p = pois[Number(b.dataset.poi)];
      assign(role, {
        id: crypto.randomUUID(),
        name: p.name,
        address: p.address || "高德地点",
        lng: p.location.lng,
        lat: p.location.lat,
      });
      if (role === "via") $("placeInput").value = "";
      box.hidden = true;
      state.searchToken++;
      fitMap();
    };
  } catch (error) {
    if (token === state.searchToken)
      box.innerHTML = "<p>" + esc(error.message) + "</p>";
  }
}
function checkRevision(rev) {
  if (rev !== state.revision) throw new Error("行程已更改");
}

/** Build a directed travel-time matrix with bounded parallel requests. */
async function optimizePoints(points, rev) {
  const options = constraints(state);
  const n = points.length;
  if (!state.sort)
    return planOrder(
      Array.from({ length: n }, () => Array(n).fill(0)),
      options,
    ).map((i) => points[i]);
  const matrix = Array.from({ length: n }, () => Array(n).fill(Infinity));
  const pairs = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) matrix[i][j] = 0;
      else pairs.push([i, j]);
    }
  let next = 0,
    done = 0;
  async function worker() {
    while (next < pairs.length) {
      checkRevision(rev);
      const [i, j] = pairs[next++];
      if (points[i].lng === points[j].lng && points[i].lat === points[j].lat)
        matrix[i][j] = 0;
      else
        matrix[i][j] = (
          await query(
            [points[i], points[j]],
            state.mode,
            AMap.DrivingPolicy.REAL_TRAFFIC,
          )
        )[0].time;
      checkRevision(rev);
      status("正在比较有效地点顺序 " + ++done + "/" + pairs.length);
    }
  }
  try {
    await Promise.all([worker(), worker(), worker()]);
  } catch (error) {
    // Stop the other workers after a failure; late responses cannot update status.
    if (rev === state.revision) invalidate("路线计算未完成，请重试");
    throw error;
  }
  checkRevision(rev);
  return planOrder(matrix, options).map((i) => points[i]);
}

async function realRoutes(points, rev) {
  const order = await optimizePoints(points, rev),
    results = [];
  if (state.mode === "driving") {
    const policies = [
      [AMap.DrivingPolicy.REAL_TRAFFIC, "路况推荐"],
      [AMap.DrivingPolicy.LEAST_FEE, "少收费"],
      [AMap.DrivingPolicy.LEAST_DISTANCE, "距离优先"],
    ];
    let failures = 0;
    for (const [policy, label] of policies) {
      checkRevision(rev);
      status("正在比较路线 · " + label);
      try {
        const routes = await query(order, state.mode, policy);
        results.push(
          ...routes.map((r, i) => ({
            ...r,
            label: i ? label + "备选" : label,
            order,
          })),
        );
      } catch (e) {
        checkRevision(rev);
        failures++;
      }
    }
    checkRevision(rev);
    if (!results.length)
      throw new Error("未能获取路线，请检查地点、网络或高德服务额度");
    return { routes: uniqueRoutes(results), partial: failures > 0 };
  }
  let combinations = [
    { time: 0, distance: 0, path: [], order, label: "推荐路线" },
  ];
  for (let i = 0; i < order.length - 1; i++) {
    checkRevision(rev);
    const legs = await query([order[i], order[i + 1]], state.mode);
    combinations = uniqueRoutes(
      combinations
        .flatMap((a) =>
          legs.map((b) => ({
            ...a,
            time: a.time + b.time,
            distance: a.distance + b.distance,
            path: [...a.path, ...b.path],
          })),
        )
        .sort((a, b) => a.time - b.time),
    );
  }
  return {
    routes: combinations.map((r, i) => ({
      ...r,
      label: i ? "备选路线 " + (i + 1) : "推荐路线",
    })),
    partial: false,
  };
}
function demoRoutes(points) {
  const matrix = points.map((a) =>
    points.map((b) => Math.hypot((a.lng - b.lng) * 0.86, a.lat - b.lat)),
  );
  const order = planOrder(matrix, constraints(state)).map((i) => points[i]);
  return [
    {
      order,
      demo: true,
      path: order.map((p) => [p.lng, p.lat]),
      label: "路线示意",
    },
  ];
}
async function confirmPreview() {
  if (state.busy) return;
  const points = trip();
  if (points.length < 2)
    throw new Error("请至少添加并启用两个地点；起点和终点可以留空");
  if (points.some((p) => !coord(p)))
    throw new Error(
      state.ready
        ? "请在搜索结果中选择地点，或使用地图选点"
        : "部分地点尚未定位，请使用地图选点，或连接高德后搜索",
    );
  invalidate("正在计算路线…");
  const rev = state.revision;
  state.busy = true;
  $("optimizeButton").disabled = true;
  try {
    const result = state.ready
      ? await realRoutes(points, rev)
      : { routes: demoRoutes(points), partial: false };
    checkRevision(rev);
    state.routes = result.routes;
    state.selected = 0;
    $("routeSummary").hidden = false;
    $("routeNote").textContent = state.ready
      ? result.partial
        ? "部分策略暂不可用，已显示成功返回的方案。"
        : "已按" +
          (state.mode === "driving" ? "当前路况" : "当前出行方式") +
          "规划 · " +
          state.routes.length +
          " 种可用方案" +
          (state.routes.length < 3 ? "（相同路线已合并）" : "")
      : "仅为地点连接示意，不代表真实道路、距离或路况。接入高德后可比较真实路线。";
    if (state.sort && points.length > 11)
      $("routeNote").textContent +=
        " · 地点较多，顺序使用近似优化，不保证全局最优";
    selectRoute(0);
    fitMap();
    if (innerWidth <= 800)
      document
        .querySelector(".map-stage")
        .scrollIntoView({ behavior: "smooth", block: "start" });
    status(
      state.ready
        ? "路线已更新 · " +
            new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            }) +
            " · 修改地点后需重新确认"
        : "示意预览已生成 · 真实导航需接入高德",
    );
  } finally {
    if (rev === state.revision) {
      state.busy = false;
      $("optimizeButton").disabled = false;
    }
  }
}
function duration(seconds) {
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 60
    ? m + " 分钟"
    : Math.floor(m / 60) + " 小时 " + (m % 60) + " 分";
}
function selectRoute(index) {
  if (!state.routes[index]) return;
  state.selected = index;
  clearLines();
  const selected = state.routes[index];
  $("routeOptions").innerHTML = state.routes
    .map(
      (r, i) =>
        `<button class="route-option ${i === index ? "selected" : ""}" data-route="${i}" aria-pressed="${i === index}"><span class="option-top"><span>${esc(r.label)}</span><span>${r.demo ? "示意" : duration(r.time)}</span></span><small>${r.demo ? "未接入实时数据" : (r.distance / 1000).toFixed(1) + " 公里"} · ${r.order.length - 2} 个途经点${i === index ? " · 已选择" : ""}</small></button>`,
    )
    .join("");
  $("routeOrder").textContent = selected.order.map((p) => p.name).join(" → ");
  if (state.ready) {
    // Draw only the selected provider-returned path, after explicit confirmation.
    const line = new AMap.Polyline({
      path: selected.path,
      strokeColor: "#007aff",
      strokeWeight: 7,
      isOutline: true,
      outlineColor: "white",
      borderWeight: 2,
      lineJoin: "round",
      lineCap: "round",
      zIndex: 60,
    });
    state.lines = [line];
    state.map.add(line);
  } else {
    $("demoRoutes").innerHTML =
      `<polyline class="demo-route-line" points="${selected.path.map(([lng, lat]) => mapXY({ lng, lat }).join(",")).join(" ")}"/>`;
  }
}
$("routeOptions").onclick = (e) => {
  const b = e.target.closest("[data-route]");
  if (b) selectRoute(Number(b.dataset.route));
};
$("optimizeButton").onclick = () =>
  confirmPreview().catch((e) => {
    if (e.message !== "行程已更改") {
      status(e.message);
      toast(e.message);
    }
  });
$("settingsButton").onclick = () => {
  $("amapKey").value = localStorage.getItem("amap-key") || "";
  $("amapSecurity").value = localStorage.getItem("amap-security") || "";
  $("settingsDialog").showModal();
};
$("saveSettingsButton").onclick = (e) => {
  e.preventDefault();
  const key = $("amapKey").value.trim(),
    security = $("amapSecurity").value.trim();
  if (!key || !security) return toast("请填写 Key 和安全密钥");
  localStorage.setItem("amap-key", key);
  localStorage.setItem("amap-security", security);
  location.reload();
};
function loadMap() {
  const key = localStorage.getItem("amap-key"),
    security = localStorage.getItem("amap-security");
  if (!key || !security) return;
  window._AMapSecurityConfig = { securityJsCode: security };
  const script = document.createElement("script");
  script.src =
    "https://webapi.amap.com/maps?v=2.0&key=" +
    encodeURIComponent(key) +
    "&plugin=AMap.Driving,AMap.Walking,AMap.Riding,AMap.PlaceSearch,AMap.AutoComplete,AMap.DistrictSearch";
  script.onerror = () => status("高德地图加载失败，请检查网络及地图设置");
  script.onload = () => {
    try {
      state.map = new AMap.Map("map", {
        viewMode: "2D",
        zoom: 12,
        center: [120.1491, 30.2592],
        dragEnable: true,
        zoomEnable: true,
        scrollWheel: true,
        doubleClickZoom: true,
        touchZoom: true,
        mapStyle: "amap://styles/normal",
      });
      state.map.on("complete", () => {
        invalidate("地图已连接，设置地点后确认预览");
        state.ready = true;
        refreshCities();
        $("map").classList.add("ready");
        $("demoMap").hidden = true;
        render();
        fitMap();
      });
      state.map.on("click", (e) => pickAt(e.lnglat.lng, e.lnglat.lat));
    } catch {
      status("地图初始化失败，请检查高德配置");
    }
  };
  document.head.appendChild(script);
}
function registerTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  const register = (tool) => {
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  };
  register({
    name: "set_trip_points",
    title: "设置旅行地点",
    description:
      "Stage travel points without showing any route. First is the start, last is the end; empty list clears all points.",
    inputSchema: {
      type: "object",
      properties: {
        stops: {
          type: "array",
          maxItems: 18,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              lng: { type: "number" },
              lat: { type: "number" },
              address: { type: "string" },
            },
            required: ["name"],
            additionalProperties: false,
          },
        },
      },
      required: ["stops"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (
        !Array.isArray(input?.stops) ||
        input.stops.length > 18 ||
        input.stops.some(
          (p) =>
            !p ||
            typeof p.name !== "string" ||
            !p.name.trim() ||
            (p.lng !== undefined &&
              (!Number.isFinite(p.lng) || Math.abs(p.lng) > 180)) ||
            (p.lat !== undefined &&
              (!Number.isFinite(p.lat) || Math.abs(p.lat) > 90)),
        )
      )
        throw new Error("无效的地点列表");
      const points = input.stops.map((p) => ({
        ...p,
        id: crypto.randomUUID(),
      }));
      state.start = points[0] || null;
      state.end = points.length > 1 ? points.at(-1) : null;
      state.via = points.slice(1, -1);
      state.round = false;
      update();
      return { count: points.length, previewVisible: false };
    },
  });
  register({
    name: "optimize_trip_route",
    title: "确认并预览路线",
    description:
      "Generate and show at most three route alternatives only when the user has explicitly requested a preview. Keep explicitly set, enabled anchors fixed; otherwise choose free endpoints.",
    inputSchema: {
      type: "object",
      properties: { confirmed: { type: "boolean", const: true } },
      required: ["confirmed"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      if (input?.confirmed !== true) throw new Error("请先确认预览");
      await confirmPreview();
      return {
        count: state.routes.length,
        mode: state.ready ? "live" : "demo",
      };
    },
  });
}
window.addEventListener("resize", () => {
  clearTimeout(fitMap.resizeTimer);
  fitMap.resizeTimer = setTimeout(fitMap, 150);
});

// City changes cancel pending results without deleting the itinerary.
let cities = [...defaultCities];
if (state.city && !cities.some((c) => c.adcode === state.city.adcode))
  cities.push(state.city);
function renderCities() {
  $("citySelect").innerHTML =
    '<option value="">全国（不限制）</option>' +
    cities
      .map((c) => `<option value="${esc(c.adcode)}">${esc(c.name)}</option>`)
      .join("");
  $("citySelect").value = state.city?.adcode || "";
}
async function refreshCities() {
  try {
    const available = await listCities(AMap);
    if (state.city && !available.some((c) => c.adcode === state.city.adcode))
      available.push(state.city);
    cities = available;
    renderCities();
    $("cityHelp").textContent = "仅搜索所选城市；现有地点及手动选点不受限制。";
  } catch (error) {
    $("cityHelp").textContent =
      error.message + "。当前保留常用城市，可点击重载。";
  }
}
$("reloadCities").onclick = () =>
  state.ready ? refreshCities() : toast("请先连接高德地图");
$("citySelect").onchange = (e) => {
  state.city = cities.find((c) => c.adcode === e.target.value) || null;
  state.searchToken++;
  clearTimeout($("startInput").timer);
  clearTimeout($("endInput").timer);
  $("searchResults").hidden = true;
  persist();
  if (state.ready && state.city?.center) state.map.setCity(state.city.adcode);
  status(
    state.city
      ? "仅搜索" + state.city.name + "；行程地点保持不变"
      : "搜索范围已切换为全国",
  );
};
renderCities();

render();
fitMap();
loadMap();
registerTools();

// Testable controller entry points; importing does not expose globals on window.
export {
  clearAll,
  confirmPreview,
  togglePoint,
  markerMove,
  zoom,
  update,
  search,
};
