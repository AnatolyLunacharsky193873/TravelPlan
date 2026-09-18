import test from "node:test";
import assert from "node:assert/strict";
import {
  activePoints,
  constraints,
  planOrder,
  uniqueRoutes,
} from "../dist/js/route-engine.js";

function permutations(items) {
  return items.length
    ? items.flatMap((value, index) =>
        permutations(items.filter((_, i) => i !== index)).map((rest) => [
          value,
          ...rest,
        ]),
      )
    : [[]];
}
const cost = (order, matrix) =>
  order.slice(1).reduce((total, to, i) => total + matrix[order[i]][to], 0);

test("disabled nodes are excluded without changing the stored itinerary", () => {
  const trip = {
    start: { name: "A", enabled: false },
    via: [{ name: "B" }, { name: "C", enabled: false }, { name: "D" }],
    end: null,
    round: false,
    sort: true,
  };
  assert.deepEqual(
    activePoints(trip).map((p) => p.name),
    ["B", "D"],
  );
  assert.equal(constraints(trip).fixedStart, false);
  trip.via[1].enabled = true;
  assert.deepEqual(
    activePoints(trip).map((p) => p.name),
    ["B", "C", "D"],
  );
});

test("free, one-sided, fixed endpoints and round trips match brute-force directed optimum", () => {
  const matrix = [
    [0, 9, 2, 7, 6],
    [3, 0, 4, 2, 8],
    [6, 8, 0, 3, 1],
    [2, 7, 5, 0, 4],
    [9, 1, 6, 8, 0],
  ];
  for (const fixedStart of [false, true])
    for (const fixedEnd of [false, true])
      for (const round of [false, true]) {
        const options = { fixedStart, fixedEnd, round, sort: true };
        const candidates = permutations([0, 1, 2, 3, 4])
          .filter(
            (p) =>
              (!fixedStart || p[0] === 0) &&
              (!fixedEnd || round || p.at(-1) === 4),
          )
          .map((p) => (round ? [...p, p[0]] : p));
        const order = planOrder(matrix, options);
        assert.equal(
          cost(order, matrix),
          Math.min(...candidates.map((p) => cost(p, matrix))),
          JSON.stringify(options),
        );
        assert.equal(new Set(order).size, 5);
      }
});

test("unordered trips preserve list order; two free nodes and empty trips work", () => {
  assert.deepEqual(
    planOrder([
      [0, 9],
      [1, 0],
    ]),
    [1, 0],
  );
  assert.deepEqual(
    planOrder(
      [
        [0, 9],
        [1, 0],
      ],
      { sort: false, round: true },
    ),
    [0, 1, 0],
  );
  assert.deepEqual(planOrder([]), []);
});

test("large-trip fallback visits every node once and preserves requested anchors", () => {
  const matrix = Array.from({ length: 13 }, (_, i) =>
    Array.from({ length: 13 }, (_, j) => Math.abs(i - j)),
  );
  const order = planOrder(matrix, { fixedStart: true, fixedEnd: true });
  assert.equal(order[0], 0);
  assert.equal(order.at(-1), 12);
  assert.equal(new Set(order).size, 13);
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
