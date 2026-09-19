import { activePoints } from "./route-engine.js";

// Persist only user choices; map instances and pending requests are runtime-only.
export const $ = (id) => document.getElementById(id);
export const esc = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const sample = [
  { name: "断桥残雪", lng: 120.1491, lat: 30.2592 },
  { name: "灵隐寺", lng: 120.1014, lat: 30.2408 },
  { name: "龙井村", lng: 120.1063, lat: 30.2186 },
  { name: "河坊街", lng: 120.1745, lat: 30.2384 },
  { name: "西湖文化广场", lng: 120.1654, lat: 30.2794 },
].map((p) => ({ ...p, id: crypto.randomUUID(), address: "杭州 · 示例地点" }));
function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function point(p) {
  return p && typeof p.name === "string"
    ? { ...p, id: p.id || crypto.randomUUID() }
    : null;
}
const old = read("trip-stops");
const saved = read("tuji-trip-v2");
const initial = Array.isArray(old) ? old.map(point).filter(Boolean) : sample;
export const state = {
  start: point(saved ? saved.start : initial[0]),
  end: point(saved ? saved.end : initial.length > 1 ? initial.at(-1) : null),
  via: (saved?.via || initial.slice(1, -1)).map(point).filter(Boolean),
  city: saved?.city || null,
  mode: saved?.mode || "driving",
  round: !!saved?.round,
  map: null,
  ready: false,
  markers: [],
  lines: [],
  routes: [],
  selected: 0,
  revision: 0,
  busy: false,
  pick: null,
  searchToken: 0,
  view: { x: 0, y: 0, w: 1200, h: 900 },
};
export const coord = (p) =>
  p && Number.isFinite(p.lng) && Number.isFinite(p.lat);
export const trip = () => activePoints(state);
export function persist() {
  try {
    localStorage.setItem(
      "tuji-trip-v2",
      JSON.stringify({
        start: state.start,
        end: state.end,
        via: state.via,
        mode: state.mode,
        round: state.round,
        city: state.city,
      }),
    );
  } catch {}
}
