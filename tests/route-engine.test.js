import test from "node:test";
import assert from "node:assert/strict";
import { activePoints, uniqueRoutes } from "../dist/js/route-engine.js";

test("disabled nodes are excluded without changing the stored itinerary", () => {
  const trip = {
    start: { name: "A", enabled: false },
    via: [{ name: "B" }, { name: "C", enabled: false }, { name: "D" }],
    end: null,
    round: false,
  };
  assert.deepEqual(
    activePoints(trip).map((p) => p.name),
    ["B", "D"],
  );
  trip.via[1].enabled = true;
  assert.deepEqual(
    activePoints(trip).map((p) => p.name),
    ["B", "C", "D"],
  );
});

test("duplicate route geometry is merged and alternatives are capped at three", () => {
  const routes = [1, 1, 2, 3, 4].map((n) => ({
    path: [
      [0, 0],
      [n, n],
    ],
  }));
  assert.equal(uniqueRoutes(routes).length, 3);
});
