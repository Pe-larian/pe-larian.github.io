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
import {
  computeEquivalentDistanceKm,
  minettiCostFactor,
  simulateRace,
} from "../pacing";
import {
  computeFeedingSchedule,
  computeHydrationAndSodiumRates,
  computePreRaceCarbs,
  computeTargetCarbRateGPerHr,
} from "../fueling";
import {
  applyLapseRateC,
  buildClimateFallbackForecast,
  detectIndonesianTimezone,
} from "../weather";
import { fetchDemElevations, fetchRaceWeatherForecast } from "../openMeteoClient";
import type { RaceMetadata, RunnerProfile } from "../types";

const BASE_PROFILE: RunnerProfile = {
  weightKg: 65,
  flatThresholdPaceSecPerKm: 300,
  targetEffortPct: 82,
  powerHikeGradePct: 15,
  fatigueDriftEnabled: true,
  gutTolerance: "moderate",
  sweatRateLPerHr: 0.95,
  sweatSodiumCategory: "moderate",
  caffeineStrategy: true,
  roadSplitPct: 0,
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

describe("Minetti (2002) GAP & Naismith equivalent distance", () => {
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

  it("computes Naismith equivalent distance D + EG/100", () => {
    expect(computeEquivalentDistanceKm(20, 1000)).toBe(30);
    expect(computeEquivalentDistanceKm(42.2, 0)).toBe(42.2);
  });
});

describe("New 6-part mathematical fueling & hydration engine", () => {
  it("computes carbohydrate rate by exact duration and gut level (1..3)", () => {
    expect(computeTargetCarbRateGPerHr(0.75, "moderate").rateGPerHr).toBe(0);
    expect(computeTargetCarbRateGPerHr(1.2, "beginner").rateGPerHr).toBe(30);
    expect(computeTargetCarbRateGPerHr(2.0, "beginner").rateGPerHr).toBe(45);
    expect(computeTargetCarbRateGPerHr(2.0, "moderate").rateGPerHr).toBe(60);
    expect(computeTargetCarbRateGPerHr(2.0, "trained").rateGPerHr).toBe(75);
    expect(computeTargetCarbRateGPerHr(4.0, "beginner").rateGPerHr).toBe(60);
    expect(computeTargetCarbRateGPerHr(4.0, "moderate").rateGPerHr).toBe(75);
    expect(computeTargetCarbRateGPerHr(4.0, "trained").rateGPerHr).toBe(90);
    expect(computeTargetCarbRateGPerHr(4.0, "moderate").dualTransporterRecommended).toBe(true);
  });

  it("computes fluid rate (W * 8 * tempMult) clamped [400, 1000] and sodium (500/750/1000 mg/L)", () => {
    const cool = computeHydrationAndSodiumRates(60, 18, "low");
    expect(cool.fluidRateMlPerHr).toBe(480);
    expect(cool.sodiumRateMgPerHr).toBe(240);

    const hotHeavy = computeHydrationAndSodiumRates(90, 31, "high");
    expect(hotHeavy.fluidRateMlPerHr).toBe(1000);
    expect(hotHeavy.sodiumRateMgPerHr).toBe(1000);
  });

  it("computes pre-race carbs, 30-min feeding sessions, and 22g gel counts", () => {
    expect(computePreRaceCarbs(70)).toEqual({ minG: 105, maxG: 140 });
    const sched = computeFeedingSchedule(3.0, 225);
    expect(sched.intervalMin).toBe(30);
    expect(sched.sessions).toBe(5); // floor(180/30) - 1
    expect(sched.totalGelsCount).toBe(11); // ceil(225 / 22)
  });

  it("activates 60/40 gel-solid split & +20% carry water for Trail >3h, and omits carry weight in Road mode", () => {
    const trailSample = buildSampleRoute("trail");
    const cleanedTrail = cleanSpikes(trailSample.points).points;
    const totals = computeElevationTotals(cleanedTrail, false);
    const forecast = buildClimateFallbackForecast(
      cleanedTrail[0].lat,
      cleanedTrail[0].lon,
      cleanedTrail[0].ele,
      totals.maxEleM,
      BASE_META.raceDate,
      BASE_META.timezone
    );

    const trailSim = simulateRace(
      cleanedTrail,
      trailSample.checkpoints,
      BASE_META,
      BASE_PROFILE,
      forecast
    );

    expect(trailSim.trailSolidRatioActive).toBe(true);
    expect(trailSim.fastCarbTotalG).toBeGreaterThan(trailSim.solidFoodTotalG);
    expect(trailSim.segments[0].mandatoryCarryWaterMl).toBeGreaterThan(
      trailSim.segments[0].fluidMl
    );

    const roadSample = buildSampleRoute("road");
    const roadMeta: RaceMetadata = {
      ...BASE_META,
      discipline: "road",
      timezone: "WIB",
    };
    const roadSim = simulateRace(
      roadSample.points,
      roadSample.checkpoints,
      roadMeta,
      { ...BASE_PROFILE, roadSplitPct: -8, targetFinishTimeSec: 3.5 * 3600 },
      forecast
    );

    expect(roadSim.totalElapsedSec).toBeCloseTo(3.5 * 3600, -2);
    expect(roadSim.segments.every((s) => s.carryWeightKg === 0)).toBe(true);
    expect(roadSim.segments.every((s) => s.mandatoryCarryWaterMl === 0)).toBe(true);
    // Negative split => last leg pace faster (lower sec/km) than first leg pace
    expect(roadSim.segments[roadSim.segments.length - 1].paceSecPerKm).toBeLessThan(
      roadSim.segments[0].paceSecPerKm
    );
    expect(applyLapseRateC(26, 1156, 3726)).toBeLessThan(12);
  });
});

describe("Timezone auto-detection & static Open-Meteo adapter", () => {
  it("detects WIB, WITA, and WIT accurately from Indonesian longitudes", () => {
    expect(detectIndonesianTimezone(106.82)).toBe("WIB");
    expect(detectIndonesianTimezone(116.53)).toBe("WITA");
    expect(detectIndonesianTimezone(140.71)).toBe("WIT");
  });

  it("returns honest climate estimate for race dates beyond 16-day forecast window", async () => {
    const res = await fetchRaceWeatherForecast({
      lat: -8.3669,
      lon: 116.5335,
      baseEleM: 1156,
      maxEleM: 3726,
      raceDate: "2027-08-15",
      timezone: "WITA",
    });
    expect(res.source).toBe("climate-estimate");
    expect(res.hourly.length).toBe(5);
    expect(res.summitTempC).toBeLessThan(res.startTempC);
  });

  it("validates DEM coordinate bounds before fetching", async () => {
    await expect(fetchDemElevations([])).rejects.toThrow(/1 sampai 100/);
  });
});
