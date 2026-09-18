import { $, esc, state, coord } from "./state.js";

/**
 * Owns real-map and demo-map rendering, dragging, zoom, and marker interactions.
 * Inject controller callbacks so map code never owns itinerary persistence or routing.
 */
export function createMapView({
  invalidate,
  update,
  assign,
  rolePoints,
  status,
}) {
  function mapXY(p) {
    return [((p.lng - 120.075) / 0.13) * 1200, ((30.305 - p.lat) / 0.11) * 900];
  }
  function coordinates(x, y) {
    return { lng: 120.075 + (x / 1200) * 0.13, lat: 30.305 - (y / 900) * 0.11 };
  }
  function moved(p, lng, lat) {
    p.lng = lng;
    p.lat = lat;
    p.name = "地图选点";
    p.address = lng.toFixed(5) + ", " + lat.toFixed(5);
  }
  // Click toggles validity; dragging only moves the marker and never toggles it.
  function togglePoint(key) {
    const p = rolePoints().find((item) => item.key === key)?.p;
    if (!p) return;
    p.enabled = p.enabled === false;
    state.pick = null;
    update();
    status(
      p.name +
        (p.enabled ? "已启用" : "已停用，不参与规划") +
        " · 确认后重新预览",
    );
  }
  function markerMove(key, lng, lat) {
    const p =
      key === "start"
        ? state.start
        : key === "end"
          ? state.end
          : state.via.find((p) => p.id === key);
    if (!p) return;
    moved(p, lng, lat);
    update();
  }
  function renderMarkers() {
    const points = rolePoints().filter((x) => coord(x.p));
    if (state.ready) {
      if (state.markers.length) state.map.remove(state.markers);
      state.markers = points.map(({ p, key, label }) => {
        const m = new AMap.Marker({
          position: [p.lng, p.lat],
          title:
            p.name +
            (p.enabled === false ? " · 已停用，点击启用" : " · 有效，点击停用"),
          draggable: true,
          bubble: false,
          content: `<span class="map-marker" style="background:${p.enabled === false ? "#6b7280" : key === "end" ? "#ef4444" : "#007aff"}">${p.enabled === false ? "−" : label}</span>`,
          offset: new AMap.Pixel(-15, -15),
          zIndex: 150,
        });
        let suppressClickUntil = 0;
        m.on("click", () => {
          if (Date.now() > suppressClickUntil) togglePoint(key);
        });
        m.on("dragstart", () => {
          suppressClickUntil = Infinity;
          invalidate("位置调整中，确认后重新预览");
        });
        m.on("dragend", (e) => {
          suppressClickUntil = Date.now() + 400;
          markerMove(key, e.lnglat.lng, e.lnglat.lat);
        });
        return m;
      });
      state.map.add(state.markers);
      return;
    }
    const scale = 1 / ($("demoSvg").getScreenCTM?.()?.a || 1);
    $("demoPins").innerHTML = points
      .map(({ p, key, label }) => {
        const [x, y] = mapXY(p);
        return `<g class="demo-pin ${p.enabled === false ? "disabled-pin" : ""}" role="button" tabindex="0" aria-pressed="${p.enabled !== false}" aria-label="${esc(p.name)}：${p.enabled === false ? "已停用" : "有效"}，点击切换" data-key="${key}" transform="translate(${x} ${y}) scale(${scale})"><circle r="17" fill="${p.enabled === false ? "#6b7280" : key === "end" ? "#ef4444" : "#007aff"}"/><text>${p.enabled === false ? "−" : label}</text></g>`;
      })
      .join("");
  }
  function pickAt(lng, lat) {
    if (!state.pick) return;
    const role = state.pick;
    assign(role, {
      id: crypto.randomUUID(),
      name: "地图选点",
      address: lng.toFixed(5) + ", " + lat.toFixed(5),
      lng,
      lat,
    });
  }
  const svg = $("demoSvg"),
    demo = $("demoMap");
  svg.addEventListener("keydown", (e) => {
    const key = e.target.closest("[data-key]")?.dataset.key;
    if (key && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      togglePoint(key);
    }
  });
  function localXY(e) {
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  }
  function applyView() {
    const v = state.view;
    svg.setAttribute("viewBox", [v.x, v.y, v.w, v.h].join(" "));
    if (!state.ready) renderMarkers();
  }
  let drag = null;
  demo.onpointerdown = (e) => {
    if (e.button !== 0) return;
    const pos = localXY(e),
      pin = e.target.closest("[data-key]");
    drag = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      last: pos,
      key: pin?.dataset.key,
      moved: false,
    };
    demo.setPointerCapture(e.pointerId);
    demo.classList.add("dragging");
  };
  demo.onpointermove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const pos = localXY(e);
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4)
      drag.moved = true;
    if (!drag.moved) return;
    if (drag.key) {
      if (!drag.invalidated) {
        invalidate("地点已移动，确认后重新预览");
        drag.invalidated = true;
      }
      const p = rolePoints().find((x) => x.key === drag.key)?.p;
      if (p) {
        Object.assign(p, coordinates(pos.x, pos.y));
        renderMarkers();
      }
    } else {
      state.view.x -= pos.x - drag.last.x;
      state.view.y -= pos.y - drag.last.y;
      applyView();
    }
    drag.last = localXY(e);
  };
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    demo.classList.remove("dragging");
    if (d.key && d.moved) {
      const p = rolePoints().find((x) => x.key === d.key)?.p;
      if (p) markerMove(d.key, p.lng, p.lat);
    } else if (!d.moved && d.key) {
      togglePoint(d.key);
    } else if (!d.moved && state.pick) {
      const q = localXY(e),
        c = coordinates(q.x, q.y);
      pickAt(c.lng, c.lat);
    }
  }
  demo.onpointerup = endDrag;
  demo.onpointercancel = (e) => {
    if (drag?.moved && drag.key) {
      persist();
      render();
    }
    drag = null;
    demo.classList.remove("dragging");
  };
  function zoom(factor, anchor) {
    if (state.ready) {
      state.map.setZoom(state.map.getZoom() + (factor < 1 ? 1 : -1));
      return;
    }
    const v = state.view;
    const q = anchor || { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    const w = Math.max(150, Math.min(6000, v.w * factor)),
      f = w / v.w;
    state.view = {
      x: q.x - (q.x - v.x) * f,
      y: q.y - (q.y - v.y) * f,
      w,
      h: v.h * f,
    };
    applyView();
  }
  demo.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.14 : 1 / 1.14, localXY(e));
    },
    { passive: false },
  );
  $("zoomIn").onclick = () => zoom(0.8);
  $("zoomOut").onclick = () => zoom(1.25);
  function fitMap() {
    if (state.ready) {
      const all = [...state.markers, ...state.lines];
      if (all.length)
        state.map.setFitView(
          all,
          false,
          innerWidth > 800 ? [90, 90, 140, 410] : [60, 60, 70, 60],
        );
      return;
    }
    const points = rolePoints()
      .filter((x) => coord(x.p))
      .map((x) => mapXY(x.p));
    if (!points.length) state.view = { x: 0, y: 0, w: 1200, h: 900 };
    else {
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1]);
      // Padding is in screen pixels so distant nodes still fit without clipped pins.
      const screenWidth = demo.clientWidth || 1200,
        screenHeight = demo.clientHeight || 900;
      const left = innerWidth > 800 ? 410 : 45,
        right = 55,
        top = 70,
        bottom = 95;
      const availableWidth = Math.max(80, screenWidth - left - right);
      const availableHeight = Math.max(80, screenHeight - top - bottom);
      const scale = Math.min(
        availableWidth / Math.max(250, Math.max(...xs) - Math.min(...xs)),
        availableHeight / Math.max(250, Math.max(...ys) - Math.min(...ys)),
      );
      const w = screenWidth / scale,
        h = screenHeight / scale;
      state.view = {
        x:
          (Math.min(...xs) + Math.max(...xs)) / 2 -
          (left + availableWidth / 2) / scale,
        y:
          (Math.min(...ys) + Math.max(...ys)) / 2 -
          (top + availableHeight / 2) / scale,
        w,
        h,
      };
    }
    applyView();
  }
  $("fitMapButton").onclick = fitMap;
  $("closePreview").onclick = () => {
    invalidate("预览已收起，可继续调整地点");
  };

  return {
    renderMarkers,
    fitMap,
    pickAt,
    mapXY,
    togglePoint,
    markerMove,
    zoom,
  };
}
