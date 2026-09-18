/** Normalize routing provider results; this service never draws an automatic preview. */
export function query(points, mode, policy) {
  return new Promise((resolve, reject) => {
    const opts = {
      policy,
      extensions: "all",
      hideMarkers: true,
      autoFitView: false,
    };
    const service =
      mode === "walking"
        ? new AMap.Walking(opts)
        : mode === "riding"
          ? new AMap.Riding(opts)
          : new AMap.Driving(opts);
    const timer = setTimeout(
      () => reject(new Error("路线请求超时，请重试")),
      20000,
    );
    const callback = (status, data) => {
      clearTimeout(timer);
      if (status !== "complete" || !data?.routes?.length)
        return reject(new Error("该路线暂不可用，请检查地点或高德服务额度"));
      const routes = data.routes
        .map((route) => {
          const path = (route.steps || [])
            .flatMap((step) => step.path || [])
            .map((p) => [
              p.lng ?? p.getLng?.() ?? p[0],
              p.lat ?? p.getLat?.() ?? p[1],
            ]);
          return {
            time: Number(route.time),
            distance: Number(route.distance),
            path,
          };
        })
        .filter(
          (r) =>
            r.path.length > 1 &&
            Number.isFinite(r.time) &&
            Number.isFinite(r.distance),
        );
      routes.length ? resolve(routes) : reject(new Error("未返回可用路线"));
    };
    const a = [points[0].lng, points[0].lat],
      b = [points.at(-1).lng, points.at(-1).lat];
    if (mode === "driving")
      service.search(
        a,
        b,
        { waypoints: points.slice(1, -1).map((p) => [p.lng, p.lat]) },
        callback,
      );
    else service.search(a, b, callback);
  });
}
