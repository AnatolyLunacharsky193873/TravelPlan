/** API adapters keep provider responses and city validation out of the UI. */
export const defaultCities = [
  { name: "杭州市", adcode: "330100" },
  { name: "扬州市", adcode: "321000" },
  { name: "北京市", adcode: "110000" },
  { name: "上海市", adcode: "310000" },
  { name: "天津市", adcode: "120000" },
  { name: "重庆市", adcode: "500000" },
];

function request(run) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("高德服务请求超时，请重试")),
      15000,
    );
    const done = (status, data) => {
      clearTimeout(timer);
      if (status === "complete") resolve(data);
      else if (status === "no_data") resolve(null);
      else reject(new Error("高德服务暂不可用，请检查 Key、网络或服务额度"));
    };
    try {
      run(done);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/** Use administrative codes, not address substring matching (which leaks namesakes). */
export function belongsToCity(poi, city) {
  if (!city) return true;
  const adcode = String(poi.adcode || "");
  const selected = String(city.adcode);
  if (!/^\d{6}$/.test(adcode) || !/^\d{6}$/.test(selected)) return false;
  if (/^(11|12|31|50)0000$/.test(selected))
    return adcode.slice(0, 2) === selected.slice(0, 2);
  // Directly administered county-level cities must match the entire code.
  return selected.endsWith("00")
    ? adcode.slice(0, 4) === selected.slice(0, 4)
    : adcode === selected;
}

export function normalizePoi(poi, source) {
  const loc = poi?.location;
  if (!loc) return null;
  const pair = typeof loc === "string" ? loc.split(",") : null;
  const lng = Number(pair ? pair[0] : (loc.lng ?? loc.getLng?.()));
  const lat = Number(pair ? pair[1] : (loc.lat ?? loc.getLat?.()));
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90
  )
    return null;
  return {
    id: poi.id || poi.uid || "",
    name: poi.name || "地图地点",
    address: [
      ...new Set(
        [poi.cityname, poi.adname, poi.district, poi.address].filter(
          (value) => typeof value === "string" && value,
        ),
      ),
    ].join(" "),
    adcode: poi.adcode,
    location: { lng, lat },
    source,
  };
}

export function mergePois(groups, city) {
  const seen = new Set();
  return groups
    .flat()
    .filter((poi) => {
      if (!poi || !belongsToCity(poi, city)) return false;
      const key =
        poi.id ||
        [
          poi.name,
          poi.location.lng.toFixed(5),
          poi.location.lat.toFixed(5),
        ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40);
}

export async function listCities(api) {
  const data = await request((done) =>
    new api.DistrictSearch({
      level: "country",
      subdistrict: 2,
      extensions: "base",
      showbiz: false,
    }).search("中国", done),
  );
  const cities = [];
  for (const province of data?.districtList?.[0]?.districtList || []) {
    if (/^(11|12|31|50|81|82)0000$/.test(String(province.adcode))) {
      cities.push(province);
    } else {
      cities.push(...(province.districtList || []));
    }
  }
  if (!cities.length) throw new Error("城市列表暂不可用，请重试");
  return cities
    .map(({ name, adcode, center }) => ({
      name,
      adcode: String(adcode),
      center,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function cityKey(value) {
  return String(value || "")
    .trim()
    .replace(/特别行政区$|自治州$|地区$|市$|盟$/, "");
}

/** Resolve free-form city text to one unambiguous administrative code. */
export async function resolveCity(api, value, knownCities = []) {
  const text = String(value || "").trim();
  if (!text) return null;
  const exact = knownCities.filter(
    (city) =>
      city.adcode === text ||
      city.name === text ||
      cityKey(city.name) === cityKey(text),
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1)
    throw new Error("城市名称不够明确，请输入完整城市名");
  if (!api?.DistrictSearch)
    throw new Error("请先连接高德地图，才能识别这个城市");

  const data = await request((done) =>
    new api.DistrictSearch({
      level: "city",
      subdistrict: 0,
      extensions: "base",
      showbiz: false,
    }).search(text, done),
  );
  const candidates = (data?.districtList || [])
    .filter(
      (item) =>
        item.level === "city" ||
        (item.level === "province" &&
          /^(11|12|31|50|81|82)0000$/.test(String(item.adcode))),
    )
    .map(({ name, adcode, center }) => ({
      name,
      adcode: String(adcode),
      center,
    }));
  const matched = candidates.filter(
    (city) => city.name === text || cityKey(city.name) === cityKey(text),
  );
  const result =
    matched.length === 1
      ? matched[0]
      : candidates.length === 1
        ? candidates[0]
        : null;
  if (!result)
    throw new Error("未能唯一识别该城市，请输入完整城市名，例如“扬州市”");
  return result;
}

export async function searchPlaces(api, keyword, city) {
  const options = { city: city?.adcode || "全国", citylimit: Boolean(city) };
  // Remove only an explicitly selected city's prefix, never guess from place names.
  const shortName = city?.name.replace(/市$/, "");
  const term =
    shortName && keyword.startsWith(shortName)
      ? keyword.slice(shortName.length).replace(/^市/, "").trim() || keyword
      : keyword;
  const place = request((done) =>
    new api.PlaceSearch({
      ...options,
      pageSize: 40,
      pageIndex: 1,
      extensions: "all",
      children: 1,
    }).search(term, done),
  ).then((data) =>
    (data?.poiList?.pois || []).map((p) => normalizePoi(p, "地点搜索")),
  );
  const tips = request((done) =>
    new api.AutoComplete({ ...options, datatype: "poi" }).search(term, done),
  ).then((data) => (data?.tips || []).map((p) => normalizePoi(p, "输入联想")));
  const results = await Promise.allSettled([place, tips]);
  const groups = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  const pois = mergePois(groups, city);
  if (!pois.length && results.some((r) => r.status === "rejected")) {
    throw new Error(
      "部分高德搜索服务不可用，暂未获取可用结果，请检查配置或稍后重试",
    );
  }
  if (!pois.length)
    throw new Error(
      city
        ? `在${city.name}未找到匹配地点。其他城市及归属无法确认的结果已排除，可更换关键词或手动选点。`
        : "高德未找到该地点，可换一个关键词或在地图上手动选点。",
    );
  return pois;
}
