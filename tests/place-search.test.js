import test from "node:test";
import assert from "node:assert/strict";
import {
  belongsToCity,
  searchPlaces,
  normalizePoi,
  resolveCity,
} from "../dist/js/place-search.js";
const city = { name: "扬州市", adcode: "321000" };

test("strict city filter rejects other cities, unknown codes, and misleading names", () => {
  assert.equal(belongsToCity({ adcode: "321002" }, city), true);
  assert.equal(
    belongsToCity({ adcode: "320102", name: "扬州狮子楼" }, city),
    false,
  );
  assert.equal(belongsToCity({ cityname: "扬州市" }, city), false);
  assert.equal(belongsToCity({ adcode: "110105" }, { adcode: "110000" }), true);
  assert.equal(
    belongsToCity({ adcode: "429006" }, { adcode: "429004" }),
    false,
  );
});

test("both provider searches are city-limited and results are postfiltered and deduplicated", async () => {
  const calls = [];
  const poi = {
    id: "a",
    name: "测试店（模拟数据）",
    adcode: "321002",
    location: { lng: 119.4, lat: 32.4 },
  };
  class Service {
    constructor(options) {
      calls.push(options);
    }
    search(term, done) {
      assert.equal(term, "狮子楼");
      done("complete", {
        poiList: { pois: [poi, { ...poi, id: "out", adcode: "320102" }] },
        tips: [poi],
      });
    }
  }
  const found = await searchPlaces(
    { PlaceSearch: Service, AutoComplete: Service },
    "扬州狮子楼",
    city,
  );
  assert.equal(found.length, 1);
  assert.ok(
    calls.every(
      (options) => options.city === "321000" && options.citylimit === true,
    ),
  );
});

test("service failures are not mislabeled as no search results", async () => {
  class Broken {
    search(term, done) {
      done("error", { info: "INVALID_USER_KEY" });
    }
  }
  await assert.rejects(
    searchPlaces({ PlaceSearch: Broken, AutoComplete: Broken }, "店", city),
    /服务不可用/,
  );
});

test("invalid locations are discarded instead of creating unusable markers", () => {
  assert.equal(normalizePoi({ location: [], name: "Bad" }), null);
  assert.equal(normalizePoi({ location: "190,32", name: "Bad" }), null);
  assert.equal(
    normalizePoi({ location: "119.4,32.4", name: "OK" }).location.lng,
    119.4,
  );
});

test("manual city input resolves suggestions, suffix-free names and provider results", async () => {
  assert.equal(
    (await resolveCity(null, "扬州", [
      { name: "扬州市", adcode: "321000" },
    ])).adcode,
    "321000",
  );
  class DistrictSearch {
    search(text, done) {
      assert.equal(text, "苏州");
      done("complete", {
        districtList: [
          {
            name: "苏州市",
            adcode: "320500",
            level: "city",
            center: { lng: 120.58, lat: 31.3 },
          },
        ],
      });
    }
  }
  const resolved = await resolveCity({ DistrictSearch }, "苏州", []);
  assert.equal(resolved.name, "苏州市");
  assert.equal(resolved.adcode, "320500");
});

test("manual city input rejects districts and unknown cities", async () => {
  class DistrictSearch {
    search(text, done) {
      done("complete", {
        districtList: [
          { name: "吴江区", adcode: "320509", level: "district" },
        ],
      });
    }
  }
  await assert.rejects(
    resolveCity({ DistrictSearch }, "吴江区", []),
    /完整城市名/,
  );
});
