/** Pure itinerary rules. Disabled markers remain stored, but never reach routing. */
export function activePoints(trip) {
  return [trip.start, ...trip.via, ...(trip.round ? [] : [trip.end])].filter(
    (point) => point && point.enabled !== false,
  );
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
