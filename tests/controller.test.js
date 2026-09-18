import test from "node:test";
import assert from "node:assert/strict";

// A small DOM/provider fixture exercises the actual controller without live API keys.
const elements = new Map(),
  memory = new Map(),
  pending = [];
const element = () => ({
  value: "",
  hidden: true,
  checked: false,
  disabled: false,
  innerHTML: "",
  textContent: "",
  dataset: {},
  clientWidth: 1200,
  clientHeight: 900,
  classList: { add() {}, remove() {}, toggle() {} },
  setAttribute() {},
  replaceChildren() {},
  addEventListener() {},
  appendChild() {},
  setPointerCapture() {},
});
const get = (id) => {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id);
};
globalThis.document = {
  getElementById: get,
  querySelectorAll: () => [],
  querySelector: element,
  createElement: element,
  head: element(),
};
globalThis.window = { addEventListener() {} };
globalThis.innerWidth = 1200;
globalThis.localStorage = {
  getItem: (key) => memory.get(key) || null,
  setItem: (key, value) => memory.set(key, value),
};
let deferred = false;
class Service {
  constructor(options) {
    this.options = options;
  }
  search(a, b, options, callback) {
    if (typeof options === "function") callback = options;
    const policy = this.options.policy || 0;
    const path = [
      a,
      ...(options?.waypoints || []),
      [b[0] + policy * 0.00001, b[1]],
      b,
    ].map(([lng, lat]) => ({ lng, lat }));
    const finish = () =>
      callback("complete", {
        routes: [{ time: 100 + policy, distance: 1000, steps: [{ path }] }],
      });
    deferred ? pending.push(finish) : queueMicrotask(finish);
  }
}
class Marker {
  constructor(options) {
    this.options = options;
    this.events = {};
  }
  on(name, fn) {
    this.events[name] = fn;
  }
}
globalThis.AMap = {
  Driving: Service,
  Walking: Service,
  Riding: Service,
  DrivingPolicy: { REAL_TRAFFIC: 4, LEAST_FEE: 1, LEAST_DISTANCE: 2 },
  Marker,
  Pixel: class {},
  Polyline: class {},
};
const { state, sample } = await import("../dist/js/state.js");
const app = await import("../dist/app.js");

test("controller: optional endpoints, marker toggle/drag, confirmation, clearing and stale requests", async () => {
  app.clearAll();
  assert.equal(get("routeSummary").hidden, true);
  await assert.rejects(app.confirmPreview(), /至少/);
  state.via = sample.slice(0, 3).map((p) => ({ ...p }));
  app.update();
  assert.equal(state.start, null);
  assert.equal(state.end, null);
  assert.equal(get("routeSummary").hidden, true);
  await app.confirmPreview();
  assert.equal(state.routes[0].order.length, 3);
  app.togglePoint(state.via[1].id);
  assert.equal(get("routeSummary").hidden, true);
  await app.confirmPreview();
  assert.equal(state.routes[0].order.length, 2);
  app.togglePoint(state.via[1].id);
  assert.equal(state.via[1].enabled, true);
  state.round = true;
  app.update();
  await app.confirmPreview();
  assert.equal(state.routes[0].order[0].id, state.routes[0].order.at(-1).id);
  state.round = false;
  state.map = { add() {}, remove() {}, setFitView() {} };
  state.ready = true;
  state.sort = false;
  app.update();
  await app.confirmPreview();
  assert.equal(state.routes.length, 3);
  const marker = state.markers[0];
  marker.events.click();
  assert.equal(state.via[0].enabled, false);
  assert.equal(get("routeSummary").hidden, true);
  const disabledMarker = state.markers[0];
  disabledMarker.events.dragstart();
  disabledMarker.events.dragend({ lnglat: { lng: 120.16, lat: 30.26 } });
  disabledMarker.events.click();
  assert.equal(state.via[0].enabled, false);
  assert.equal(state.via[0].lng, 120.16);
  app.togglePoint(state.via[0].id);
  deferred = true;
  const planning = app.confirmPreview();
  await new Promise((resolve) => setImmediate(resolve));
  app.clearAll();
  pending.splice(0).forEach((finish) => finish());
  await assert.rejects(planning, /行程已更改/);
  assert.equal(state.routes.length, 0);
  assert.equal(get("routeSummary").hidden, true);
  assert.deepEqual(JSON.parse(memory.get("tuji-trip-v2")).via, []);
  await app.search("via", "迟到的旧搜索", state.searchToken - 1);
  assert.equal(state.via.length, 0);
});
