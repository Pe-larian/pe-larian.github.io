import { describe, expect, it } from "vitest";
import {
  cleanSpikes,
  computeElevationTotals,
  detectSpikes,
  exportGpxXml,
  parseGpxXml,
  smoothElevation,
} from "../gpx";
import { buildSampleRoute } from "../sampleRoutes";
import { minettiCostFactor, simulateRace } from "../pacing";
import { computeTargetCarbRateGPerHr } from "../fueling";
import { buildClimateFallbackForecast, applyLapseRateC } from "../weather";
import type { RaceMetadata, RunnerProfile } from "../types";

const BASE_PROFILE: RunnerProfile = {
  weightKg: 64,
  flatThresholdPaceSecPerKm: 285,
  targetEffortPct: 78,
  powerHikeGradePct: 15,
  fatigueDriftEnabled: true,
  gutTolerance: "moderate",
  sweatRateLPerHr: 0.95,
  sweatSodiumCategory: "moderate",
  caffeineStrategy: true,
};

const BASE_META: RaceMetadata = {
  runnerName: "Erdias",
  raceName: "Rinjani 100 60K",
  discipline: "trail",
  raceDate: "2026-11-16",
  startTime: "06:00",
  timezone: "WITA",
  isSample: true,
  sourceFileName: "rinjani-sample.gpx",
};

describe("GPX parser, cleaner & serializer", () => {
  it("roundtrips GPX 1.1 trackpoints and checkpoints cleanly", () => {
    const sample = buildSampleRoute("trail");
    const xml = exportGpxXml(sample.name, sample.points, sample.checkpoints);
    const reparsed = parseGpxXml(xml, "trail");

    expect(reparsed.points.length).toBe(sample.points.length);
    expect(reparsed.checkpoints.length).toBeGreaterThanOrEqual(4);
    expect(xml).toContain("<wpt ");
    expect(xml).toContain("<trkpt ");
  });

  it("detects and removes injected GPS/barometric elevation spikes", () => {
    const sample = buildSampleRoute("trail");
    const spikes = detectSpikes(sample.points);
    expect(spikes.length).toBeGreaterThanOrEqual(3);

    const cleaned = cleanSpikes(sample.points);
    expect(cleaned.removedCount).toBe(spikes.length);
    expect(cleaned.points.length).toBe(sample.points.length - spikes.length);

    const rawTotals = computeElevationTotals(sample.points, true);
    const smoothed = smoothElevation(cleaned.points, 7);
    const smoothTotals = computeElevationTotals(smoothed, false);
    expect(smoothTotals.gainM).toBeLessThan(rawTotals.gainM);
  });
});

describe("Minetti (2002) GAP pacing model", () => {
  it("returns 1.0x cost on flat 0% slope and ~1.66x on +10% climb", () => {
    expect(minettiCostFactor(0)).toBeCloseTo(1.0, 2);
    const climb10 = minettiCostFactor(0.1);
    expect(climb10).toBeGreaterThan(1.55);
    expect(climb10).toBeLessThan(1.75);
  });

  it("clamps steep downhill speedup below -18% due to technical quad braking", () => {
    const moderateDown = minettiCostFactor(-0.1);
    const steepDown = minettiCostFactor(-0.35);
    expect(steepDown).toBeGreaterThan(moderateDown);
  });
});

describe("Science-based fueling & full race simulation", () => {
  it("scales carbohydrate targets by duration and gut tolerance", () => {
    expect(computeTargetCarbRateGPerHr(0.75, "moderate").rateGPerHr).toBeLessThanOrEqual(30);
    expect(computeTargetCarbRateGPerHr(4.5, "beginner").rateGPerHr).toBe(60);
    expect(computeTargetCarbRateGPerHr(4.5, "trained").rateGPerHr).toBeGreaterThanOrEqual(90);
  });

  it("enforces physiological gastric fluid cap <= 1,000 mL/hr and runs end-to-end simulation", () => {
    const sample = buildSampleRoute("trail");
    const cleaned = cleanSpikes(sample.points).points;
    const totals = computeElevationTotals(cleaned, false);
    const forecast = buildClimateFallbackForecast(
      cleaned[0].lat,
      cleaned[0].lon,
      cleaned[0].ele,
      totals.maxEleM,
      BASE_META.raceDate,
      BASE_META.timezone
    );

    const highSweatProfile: RunnerProfile = {
      ...BASE_PROFILE,
      sweatRateLPerHr: 1.8,
    };

    const sim = simulateRace(
      cleaned,
      sample.checkpoints,
      BASE_META,
      highSweatProfile,
      forecast
    );

    expect(sim.segments.length).toBe(sample.checkpoints.length - 1);
    expect(sim.safety.fluidRateMlPerHr).toBeLessThanOrEqual(1000);
    expect(sim.safety.gastricCapOk).toBe(true);
    expect(sim.totalCarbsG).toBeGreaterThan(0);
    expect(sim.totalFluidMl).toBeGreaterThan(0);
    expect(sim.totalSodiumMg).toBeGreaterThan(0);

    // Atmospheric lapse rate cools temperature at higher summit altitude
    expect(applyLapseRateC(26, 1156, 3726)).toBeLessThan(12);
  });
});
