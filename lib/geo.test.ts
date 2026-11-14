import { describe, expect, it } from "vitest";
import { distanceKm, filterPoints, parsePointCollection } from "./geo";

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

  it("rejects geometry that cannot be radius-filtered", () => {
    expect(() => parsePointCollection({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [] } }] })).toThrow(/Point features/);
  });
});
