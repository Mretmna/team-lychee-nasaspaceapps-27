import { describe, expect, it } from "vitest";
import { distanceKm, filterPoints, parsePointCollection, regionBounds } from "./geo";

describe("radius filtering", () => {
  it("keeps only points inside the selected radius", () => {
    const collection = parsePointCollection({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [43.38323, 38.49457] }, properties: { city: "Van" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [29.0, 41.01] }, properties: { city: "Istanbul" } },
      ],
    });
    const selected = filterPoints(collection, { name: "Van", latitude: 38.49457, longitude: 43.38323, radiusKm: 100 });
    expect(selected.features).toHaveLength(1);
    expect(selected.features[0].geometry.coordinates).toEqual([43.38323, 38.49457]);
    expect(selected.features[0].properties).toBeNull();
  });

  it("measures across the date line", () => {
    expect(distanceKm(0, 179, 0, -179)).toBeLessThan(250);
  });

  it("includes square corners and all points in whole-map mode", () => {
    const points = parsePointCollection({ type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [0.8, 0.8] } },
      { type: "Feature", geometry: { type: "Point", coordinates: [100, 40] } },
    ] });
    const selection = { name: "Equator", latitude: 0, longitude: 0, radiusKm: 100 };
    expect(filterPoints(points, selection, "circle").features).toHaveLength(0);
    expect(filterPoints(points, selection, "square").features).toHaveLength(1);
    expect(filterPoints(points, selection, "full").features).toHaveLength(2);
    expect(regionBounds(selection, "full")).toEqual({ west: -180, east: 180, south: -90, north: 90 });
  });

  it("keeps square points across the date line", () => {
    const points = parsePointCollection({ type: "FeatureCollection", features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [-179.5, 0.5] } },
    ] });
    expect(filterPoints(points, { name: "Date line", latitude: 0, longitude: 179.5, radiusKm: 150 }, "square").features).toHaveLength(1);
  });

  it("rejects geometry that cannot be radius-filtered", () => {
    expect(() => parsePointCollection({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [] } }] })).toThrow(/Point features/);
  });
});
