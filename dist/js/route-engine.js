/** Pure itinerary rules. Disabled markers remain stored, but never reach routing. */
export function activePoints(trip) {
  return [trip.start, ...trip.via, ...(trip.round ? [] : [trip.end])].filter(
    (point) => point && point.enabled !== false,
  );
}

export function constraints(trip) {
  return {
    fixedStart: Boolean(trip.start && trip.start.enabled !== false),
    fixedEnd: !trip.round && Boolean(trip.end && trip.end.enabled !== false),
    round: trip.round,
    sort: trip.sort,
  };
}

/**
 * Directed costs preserve one-way streets and asymmetric traffic.
 * Up to 11 places use Held–Karp; larger trips use multistart nearest-neighbor.
 * Missing anchors are genuinely free endpoints, not implicitly fixed waypoints.
 */
export function planOrder(matrix, options = {}) {
  const {
    fixedStart = false,
    fixedEnd = false,
    round = false,
    sort = true,
  } = options;
  const n = matrix.length;
  if (n < 2) return Array.from({ length: n }, (_, i) => i);
  const indices = Array.from({ length: n }, (_, i) => i);
  if (!sort) return round ? [...indices, 0] : indices;
  const end = fixedEnd && !round ? n - 1 : null;
  // A closed tour can be rotated to place 0 first when no start was selected.
  const starts = fixedStart || round ? [0] : indices.filter((i) => i !== end);
  let best = null;
  let bestCost = Infinity;
  for (const start of starts) {
    let order;
    if (n > 11) {
      const remaining = new Set(
        indices.filter((i) => i !== start && i !== end),
      );
      order = [start];
      while (remaining.size) {
        const next = [...remaining].reduce((a, b) =>
          matrix[order.at(-1)][a] <= matrix[order.at(-1)][b] ? a : b,
        );
        remaining.delete(next);
        order.push(next);
      }
      if (end !== null) order.push(end);
    } else {
      const size = 1 << n;
      const dp = Array.from({ length: size }, () => Array(n).fill(Infinity));
      const previous = Array.from({ length: size }, () => Array(n).fill(-1));
      dp[1 << start][start] = 0;
      for (let mask = 1; mask < size; mask++) {
        for (let from = 0; from < n; from++) {
          if (!Number.isFinite(dp[mask][from]) || from === end) continue;
          for (let to = 0; to < n; to++) {
            if (mask & (1 << to)) continue;
            const nextMask = mask | (1 << to);
            if (to === end && nextMask !== size - 1) continue;
            const cost = dp[mask][from] + matrix[from][to];
            if (cost < dp[nextMask][to]) {
              dp[nextMask][to] = cost;
              previous[nextMask][to] = from;
            }
          }
        }
      }
      const endings = end === null ? indices.filter((i) => i !== start) : [end];
      const last = endings.reduce((a, b) =>
        dp[size - 1][a] + (round ? matrix[a][start] : 0) <=
        dp[size - 1][b] + (round ? matrix[b][start] : 0)
          ? a
          : b,
      );
      order = [];
      let mask = size - 1;
      let current = last;
      while (current >= 0) {
        order.push(current);
        const prior = previous[mask][current];
        mask ^= 1 << current;
        current = prior;
      }
      order.reverse();
      if (order.length !== n) continue;
    }
    if (round) order.push(start);
    const cost = order
      .slice(1)
      .reduce((total, to, i) => total + matrix[order[i]][to], 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = order;
    }
  }
  if (!best) throw new Error("有效地点之间没有可用的完整路线");
  return best;
}

/** Different policies may return the same road geometry; show it only once. */
export function uniqueRoutes(routes) {
  const seen = new Set();
  return routes
    .filter((route) => {
      const key = route.path
        .map((p) => p.map((v) => Number(v).toFixed(5)).join(","))
        .join(";");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}
