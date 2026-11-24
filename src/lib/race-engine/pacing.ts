import { computeSegmentFueling, evaluateFuelingSafety } from "./fueling";
import type {
  Checkpoint,
  RaceMetadata,
  RaceSimulationSummary,
  RunnerProfile,
  SegmentSimulation,
  TerrainCategory,
  TrackPoint,
  WeatherForecastResult,
} from "./types";
import {
  computeSweatHeatMultiplier,
  estimateSolarTimes,
  sampleWeatherForSegment,
  timezoneToOffsetHours,
} from "./weather";

export const TERRAIN_FACTORS: Record<TerrainCategory, number> = {
  road: 1.0,
  gravel: 1.12,
  singletrack: 1.2,
  climb: 1.28,
  technical: 1.35,
  scree: 1.45,
  descent: 1.18,
};

export const TERRAIN_LABELS: Record<TerrainCategory, string> = {
  road: "Aspal",
  gravel: "Gravel / Tanah",
  singletrack: "Singletrack",
  climb: "Tanjakan",
  technical: "Teknis / Akar",
  scree: "Scree Vulkanik",
  descent: "Turunan",
};

/**
 * Minetti et al. (2002) energetic cost of running on slope g (decimal, e.g., 0.10 for +10%).
 * Clamped at -0.18 downhill to reflect eccentric quad braking on steep trail descents.
 */
export function minettiCostFactor(gradeDecimal: number): number {
  const g = Math.max(-0.18, Math.min(0.45, gradeDecimal));
  const flatCost = 3.6;
  const cost =
    155.4 * g ** 5 -
    30.4 * g ** 4 -
    43.3 * g ** 3 +
    46.3 * g ** 2 +
    19.5 * g +
    flatCost;

  const baseRatio = Math.max(0.75, cost / flatCost);

  // On steep descents below -18%, technical eccentric quad braking slows pace back down
  if (gradeDecimal < -0.18) {
    const extraSteep = Math.min(0.25, Math.abs(gradeDecimal) - 0.18);
    return baseRatio * (1.0 + extraSteep * 2.2);
  }

  return baseRatio;
}

export function parseClockToSeconds(clockHHMM: string): number {
  const [hStr, mStr] = clockHHMM.split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  return h * 3600 + m * 60;
}

export function formatClockTime(
  startClockSec: number,
  elapsedSec: number,
  tz: string
): string {
  const totalSec = Math.round(startClockSec + elapsedSec);
  const daySec = ((totalSec % 86400) + 86400) % 86400;
  const hh = String(Math.floor(daySec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((daySec % 3600) / 60)).padStart(2, "0");
  return `${hh}:${mm} ${tz}`;
}

export function formatDuration(seconds: number): string {
  const abs = Math.max(0, Math.round(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}j ${String(m).padStart(2, "0")}m`;
}

export function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "0:00";
  const rounded = Math.round(secPerKm);
  const min = Math.floor(rounded / 60);
  const sec = rounded % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function buildPacingNote(
  avgGradePct: number,
  terrain: TerrainCategory,
  powerHikeThreshold: number,
  tempC: number,
  nightRatio: number
): string {
  const notes: string[] = [];
  if (avgGradePct >= powerHikeThreshold) {
    notes.push(`Power-hike konsisten (>${powerHikeThreshold}%)`);
  } else if (avgGradePct >= 7) {
    notes.push("Jaga ritme tanjakan, hindari lonjakan HR");
  } else if (avgGradePct <= -9) {
    notes.push("Kontrol langkah turunan, lindungi paha depan");
  } else {
    notes.push("Ritme stabil, efisien di jalur datar");
  }
  if (terrain === "scree") {
    notes.push("medan scree lepas");
  } else if (terrain === "technical") {
    notes.push("fokus pijakan teknis");
  }
  if (tempC <= 14) {
    notes.push(`suhu sejuk ${tempC.toFixed(0)}°C`);
  } else if (tempC >= 30) {
    notes.push(`waspada panas ${tempC.toFixed(0)}°C`);
  }
  if (nightRatio >= 0.3) {
    notes.push("siapkan headlamp");
  }
  return notes.join(" · ");
}

export function simulateRace(
  points: TrackPoint[],
  checkpoints: Checkpoint[],
  metadata: RaceMetadata,
  profile: RunnerProfile,
  forecast: WeatherForecastResult
): RaceSimulationSummary {
  const orderedCps = [...checkpoints].sort((a, b) => a.distM - b.distM);
  const startClockSec = parseClockToSeconds(metadata.startTime);
  const solar = estimateSolarTimes(
    points[0]?.lat ?? -8.36,
    points[0]?.lon ?? 116.53,
    metadata.raceDate,
    timezoneToOffsetHours(metadata.timezone)
  );

  // Slope distribution across all trackpoints
  let flatDist = 0;
  let climbDist = 0;
  let steepDist = 0;
  let minEleM = Infinity;
  let maxEleM = -Infinity;
  let totalGainM = 0;
  let totalLossM = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.ele < minEleM) minEleM = p.ele;
    if (p.ele > maxEleM) maxEleM = p.ele;
    if (i > 0) {
      const prev = points[i - 1];
      const dDist = Math.max(0, p.distFromStartM - prev.distFromStartM);
      const dEle = p.ele - prev.ele;
      if (dEle > 0) totalGainM += dEle;
      else totalLossM += Math.abs(dEle);

      const absG = Math.abs(p.gradePct);
      if (absG < 5) flatDist += dDist;
      else if (absG <= 15) climbDist += dDist;
      else steepDist += dDist;
    }
  }

  const totalDistAll = Math.max(1, flatDist + climbDist + steepDist);
  const flatPct = Math.round((flatDist / totalDistAll) * 100);
  const climbPct = Math.round((climbDist / totalDistAll) * 100);
  const steepPct = Math.max(0, 100 - flatPct - climbPct);

  // Effort factor: 85% effort => threshold pace * (85/effort)
  const effortMultiplier = 85 / Math.max(55, Math.min(100, profile.targetEffortPct));
  const baseFlatPaceSecPerKm = profile.flatThresholdPaceSecPerKm * effortMultiplier;

  // Pass 1: estimate pacing & moving times per segment
  interface RawLeg {
    index: number;
    fromCp: Checkpoint;
    toCp: Checkpoint;
    distanceM: number;
    gainM: number;
    lossM: number;
    avgGradePct: number;
    terrain: TerrainCategory;
    terrainFactor: number;
    movingSec: number;
    stopSec: number;
    avgMetabolicRatio: number;
    midEleM: number;
    arrivalElapsedSec: number;
    departureElapsedSec: number;
    nightRatio: number;
    weather: ReturnType<typeof sampleWeatherForSegment>;
  }

  const rawLegs: RawLeg[] = [];
  let cumulativeElapsedSec = 0;

  for (let i = 0; i < orderedCps.length - 1; i++) {
    const fromCp = orderedCps[i];
    const toCp = orderedCps[i + 1];

    const startIdx = Math.min(fromCp.pointIndex, toCp.pointIndex);
    const endIdx = Math.max(fromCp.pointIndex, toCp.pointIndex);

    let legDistM = 0;
    let legGainM = 0;
    let legLossM = 0;
    let legWeightedCost = 0;
    let eleSum = 0;
    let eleCount = 0;

    for (let j = startIdx + 1; j <= endIdx && j < points.length; j++) {
      const prev = points[j - 1];
      const curr = points[j];
      const segDist = Math.max(0.1, curr.distFromStartM - prev.distFromStartM);
      const dEle = curr.ele - prev.ele;
      const gradeDec = dEle / segDist;

      legDistM += segDist;
      if (dEle > 0) legGainM += dEle;
      else legLossM += Math.abs(dEle);

      let costRatio = minettiCostFactor(gradeDec);
      if (gradeDec * 100 >= profile.powerHikeGradePct) {
        costRatio *= 1.08;
      }

      legWeightedCost += costRatio * segDist;
      eleSum += curr.ele;
      eleCount += 1;
    }

    if (legDistM < 1) {
      legDistM = Math.max(100, toCp.distM - fromCp.distM);
    }

    const avgMetabolicRatio =
      legWeightedCost > 0 ? legWeightedCost / legDistM : minettiCostFactor(0);
    const midEleM = eleCount > 0 ? eleSum / eleCount : (fromCp.ele + toCp.ele) / 2;
    const terrain = fromCp.terrainAfter;
    const terrainFactor = TERRAIN_FACTORS[terrain] ?? 1.15;

    // Altitude penalty above 2,000 m (~3.5% per 500m)
    const altitudeFactor = midEleM > 2000 ? 1 + ((midEleM - 2000) / 500) * 0.035 : 1.0;

    // Fatigue drift past 3 hours (~1.6% slower per hour)
    const priorHours = cumulativeElapsedSec / 3600;
    const fatigueFactor =
      profile.fatigueDriftEnabled && priorHours > 3
        ? 1 + Math.min(0.22, (priorHours - 3) * 0.016)
        : 1.0;

    // Sample weather near segment midpoint
    const approxMidHour =
      (startClockSec + cumulativeElapsedSec + (legDistM / 1000) * baseFlatPaceSecPerKm * 0.5) /
      3600;
    const weather = sampleWeatherForSegment(forecast, approxMidHour, midEleM);

    // Heat pace penalty above 26 C Heat Index
    const heatPaceFactor =
      weather.heatIndexC > 26 ? 1 + Math.min(0.12, (weather.heatIndexC - 26) * 0.008) : 1.0;

    const movingSec = Math.round(
      (legDistM / 1000) *
        baseFlatPaceSecPerKm *
        avgMetabolicRatio *
        terrainFactor *
        altitudeFactor *
        fatigueFactor *
        heatPaceFactor
    );

    const stopSec = i === orderedCps.length - 2 ? 0 : toCp.plannedStopSec;
    const arrivalElapsedSec = cumulativeElapsedSec + movingSec;
    const departureElapsedSec = arrivalElapsedSec + stopSec;

    // Night ratio calculation based on solar sunset / sunrise
    const legStartMin = ((startClockSec + cumulativeElapsedSec) / 60) % 1440;
    const legEndMin = legStartMin + movingSec / 60;
    let nightOverlapMin = 0;
    if (legStartMin < solar.sunriseMin) {
      nightOverlapMin += Math.max(0, Math.min(legEndMin, solar.sunriseMin) - legStartMin);
    }
    if (legEndMin > solar.sunsetMin) {
      nightOverlapMin += Math.max(0, legEndMin - Math.max(legStartMin, solar.sunsetMin));
    }
    const nightRatio = Math.max(0, Math.min(1, nightOverlapMin / Math.max(1, movingSec / 60)));

    const avgGradePct = Number((((toCp.ele - fromCp.ele) / legDistM) * 100).toFixed(1));

    rawLegs.push({
      index: i,
      fromCp,
      toCp,
      distanceM: legDistM,
      gainM: Math.round(legGainM),
      lossM: Math.round(legLossM),
      avgGradePct,
      terrain,
      terrainFactor,
      movingSec,
      stopSec,
      avgMetabolicRatio,
      midEleM,
      arrivalElapsedSec,
      departureElapsedSec,
      nightRatio,
      weather,
    });

    cumulativeElapsedSec = departureElapsedSec;
  }

  const totalRaceHours = Math.max(0.25, cumulativeElapsedSec / 3600);

  // Pass 2: compute science-based fueling per segment
  let totalCarbsG = 0;
  let totalFluidMl = 0;
  let totalSodiumMg = 0;
  let totalCaffeineMg = 0;
  let totalCaloriesBurnKcal = 0;
  let totalSweatLossMl = 0;
  let totalMovingSec = 0;
  let totalStopSec = 0;

  const segments: SegmentSimulation[] = rawLegs.map((leg) => {
    const heatMult = computeSweatHeatMultiplier(leg.weather.heatIndexC);
    const fuel = computeSegmentFueling({
      segmentIndex: leg.index,
      totalSegments: rawLegs.length,
      durationSec: leg.movingSec + leg.stopSec,
      distanceM: leg.distanceM,
      metabolicCostRatio: leg.avgMetabolicRatio,
      totalRaceHours,
      discipline: metadata.discipline,
      profile,
      heatMultiplier: heatMult,
    });

    totalCarbsG += fuel.carbsG;
    totalFluidMl += fuel.fluidMl;
    totalSodiumMg += fuel.sodiumMg;
    totalCaffeineMg += fuel.caffeineMg;
    totalCaloriesBurnKcal += fuel.caloriesKcal;
    totalSweatLossMl += fuel.sweatLossMl;
    totalMovingSec += leg.movingSec;
    totalStopSec += leg.stopSec;

    const cutoffSec = leg.toCp.cutoffElapsedSec;
    let cutoffBufferSec: number | undefined;
    let cutoffStatus: SegmentSimulation["cutoffStatus"] = "none";
    let cutoffClockTime: string | undefined;

    if (cutoffSec !== undefined && cutoffSec > 0) {
      cutoffBufferSec = Math.round(cutoffSec - leg.arrivalElapsedSec);
      cutoffClockTime = formatClockTime(startClockSec, cutoffSec, metadata.timezone);
      if (cutoffBufferSec < 0) cutoffStatus = "missed";
      else if (cutoffBufferSec < 2400) cutoffStatus = "tight";
      else cutoffStatus = "safe";
    }

    const distKm = Math.max(0.05, leg.distanceM / 1000);
    const paceSecPerKm = leg.movingSec / distKm;
    const gapSecPerKm = paceSecPerKm / Math.max(0.8, leg.avgMetabolicRatio);

    return {
      index: leg.index,
      fromCp: leg.fromCp,
      toCp: leg.toCp,
      distanceM: leg.distanceM,
      gainM: leg.gainM,
      lossM: leg.lossM,
      avgGradePct: leg.avgGradePct,
      terrain: leg.terrain,
      terrainFactor: leg.terrainFactor,
      estimatedMovingSec: leg.movingSec,
      stopSec: leg.stopSec,
      paceSecPerKm,
      gapSecPerKm,
      arrivalElapsedSec: leg.arrivalElapsedSec,
      departureElapsedSec: leg.departureElapsedSec,
      arrivalClockTime: formatClockTime(startClockSec, leg.arrivalElapsedSec, metadata.timezone),
      departureClockTime: formatClockTime(
        startClockSec,
        leg.departureElapsedSec,
        metadata.timezone
      ),
      cutoffClockTime,
      cutoffBufferSec,
      cutoffStatus,
      nightRatio: leg.nightRatio,
      weather: leg.weather,
      carbsG: fuel.carbsG,
      fluidMl: fuel.fluidMl,
      sodiumMg: fuel.sodiumMg,
      caffeineMg: fuel.caffeineMg,
      caloriesKcal: fuel.caloriesKcal,
      carryWeightKg: fuel.carryWeightKg,
      packSummary: fuel.packSummary,
      pacingNote: buildPacingNote(
        leg.avgGradePct,
        leg.terrain,
        profile.powerHikeGradePct,
        leg.weather.tempC,
        leg.nightRatio
      ),
    };
  });

  const totalDistanceM = points.length > 0 ? points[points.length - 1].distFromStartM : 0;
  const totalElapsedSec = totalMovingSec + totalStopSec;
  const distKmTotal = Math.max(0.1, totalDistanceM / 1000);
  const avgPaceSecPerKm = totalMovingSec / distKmTotal;
  const avgGapSecPerKm =
    segments.length > 0
      ? segments.reduce((acc, s) => acc + s.gapSecPerKm * s.distanceM, 0) /
        Math.max(1, totalDistanceM)
      : avgPaceSecPerKm;

  const lastSeg = segments[segments.length - 1];
  const safety = evaluateFuelingSafety({
    totalRaceHours,
    totalFluidMl,
    totalSweatLossMl,
    totalCarbsG,
    totalCaloriesBurnKcal,
    discipline: metadata.discipline,
    profile,
  });

  return {
    totalDistanceM,
    totalGainM: Math.round(totalGainM),
    totalLossM: Math.round(totalLossM),
    minEleM: Number.isFinite(minEleM) ? Math.round(minEleM) : 0,
    maxEleM: Number.isFinite(maxEleM) ? Math.round(maxEleM) : 0,
    totalMovingSec,
    totalStopSec,
    totalElapsedSec,
    finishClockTime: formatClockTime(startClockSec, totalElapsedSec, metadata.timezone),
    avgPaceSecPerKm,
    avgGapSecPerKm,
    finalCutoffBufferSec: lastSeg?.cutoffBufferSec,
    finalCutoffStatus: lastSeg?.cutoffStatus ?? "none",
    totalCarbsG,
    totalFluidMl,
    totalSodiumMg,
    totalCaffeineMg,
    totalCaloriesBurnKcal,
    totalCaloriesIntakeKcal: totalCarbsG * 4,
    slopeDistribution: { flatPct, climbPct, steepPct },
    safety,
    segments,
  };
}
