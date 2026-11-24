import type {
  FuelingSafetyChecks,
  GutTolerance,
  RaceDiscipline,
  RunnerProfile,
  SweatSodiumCategory,
} from "./types";

const GASTRIC_FLUID_CEILING_ML_PER_HR = 1000;

export function getSweatSodiumMgPerL(
  category: SweatSodiumCategory,
  customMgPerL?: number
): number {
  if (category === "custom" && customMgPerL && customMgPerL > 100) {
    return customMgPerL;
  }
  switch (category) {
    case "low":
      return 450;
    case "high":
      return 1300;
    case "moderate":
    default:
      return 850;
  }
}

/**
 * Science-based carbohydrate rate (g/hr) following Jeukendrup (2014) / GSSI guidelines:
 * driven primarily by race duration and gut tolerance, not linearly by body mass.
 */
export function computeTargetCarbRateGPerHr(
  totalRaceHours: number,
  gutTolerance: GutTolerance
): { rateGPerHr: number; dualTransporterRecommended: boolean } {
  if (totalRaceHours < 1.0) {
    return { rateGPerHr: 25, dualTransporterRecommended: false };
  }
  if (totalRaceHours < 2.0) {
    const rate = gutTolerance === "beginner" ? 40 : gutTolerance === "trained" ? 60 : 50;
    return { rateGPerHr: rate, dualTransporterRecommended: false };
  }
  if (totalRaceHours < 3.0) {
    const rate = gutTolerance === "beginner" ? 55 : gutTolerance === "trained" ? 80 : 65;
    return { rateGPerHr: rate, dualTransporterRecommended: rate >= 60 };
  }
  // > 180 min endurance efforts
  const rate =
    gutTolerance === "beginner" ? 60 : gutTolerance === "trained" ? 95 : 72;
  return { rateGPerHr: rate, dualTransporterRecommended: true };
}

/**
 * Compute per-segment carbs, fluid (capped safely under gastric ceiling),
 * sodium, caffeine, calorie burn, and practical pack translation.
 */
export function computeSegmentFueling(params: {
  segmentIndex: number;
  totalSegments: number;
  durationSec: number;
  distanceM: number;
  metabolicCostRatio: number;
  totalRaceHours: number;
  discipline: RaceDiscipline;
  profile: RunnerProfile;
  heatMultiplier: number;
}): {
  carbsG: number;
  fluidMl: number;
  sodiumMg: number;
  caffeineMg: number;
  caloriesKcal: number;
  carryWeightKg: number;
  packSummary: string;
  fluidRateMlPerHr: number;
  sweatLossMl: number;
} {
  const {
    segmentIndex,
    totalSegments,
    durationSec,
    distanceM,
    metabolicCostRatio,
    totalRaceHours,
    discipline,
    profile,
    heatMultiplier,
  } = params;

  const hours = Math.max(0.05, durationSec / 3600);
  const { rateGPerHr } = computeTargetCarbRateGPerHr(totalRaceHours, profile.gutTolerance);

  const carbsG = Math.round(rateGPerHr * hours);

  // Sweat rate scaled by Tropical Heat Index multiplier
  const effectiveSweatMlPerHr = profile.sweatRateLPerHr * 1000 * heatMultiplier;
  const sweatLossMl = effectiveSweatMlPerHr * hours;

  // Target 72% fluid replacement capped safely at physiological gastric emptying ceiling
  const rawFluidRateMlPerHr = effectiveSweatMlPerHr * 0.72;
  const fluidRateMlPerHr = Math.min(
    GASTRIC_FLUID_CEILING_ML_PER_HR - 50,
    Math.max(400, Math.round(rawFluidRateMlPerHr))
  );
  const fluidMl = Math.round((fluidRateMlPerHr * hours) / 50) * 50;

  // Sodium replacement scaled to ~75% of sweat sodium loss
  const sweatNaMgPerL = getSweatSodiumMgPerL(
    profile.sweatSodiumCategory,
    profile.customSweatSodiumMgPerL
  );
  const sodiumMg = Math.round(((sweatLossMl / 1000) * sweatNaMgPerL * 0.75) / 50) * 50;

  // Caffeine strategy: 1-3 mg/kg distributed at mid-race and late-race legs
  let caffeineMg = 0;
  if (profile.caffeineStrategy && totalRaceHours >= 2.0) {
    const midIdx = Math.floor(totalSegments / 2);
    const lateIdx = Math.max(midIdx + 1, totalSegments - 1);
    const dose = Math.min(120, Math.max(60, Math.round((profile.weightKg * 1.4) / 10) * 10));
    if (segmentIndex === 0 && totalRaceHours >= 3) {
      caffeineMg = Math.round(dose * 0.8);
    } else if (segmentIndex === midIdx || segmentIndex === lateIdx) {
      caffeineMg = dose;
    }
  }

  // Caloric expenditure (~1.036 kcal/kg/km on flat, scaled by Minetti metabolic cost ratio)
  const distKm = distanceM / 1000;
  const caloriesKcal = Math.round(profile.weightKg * distKm * 1.036 * metabolicCostRatio);

  // Practical pack conversion
  const flasksCount = Math.max(1, Math.ceil(fluidMl / 500));
  const gelsCount = Math.max(1, Math.floor((carbsG * 0.7) / 25));
  const remainingCarbs = Math.max(0, carbsG - gelsCount * 25);
  const barsOrMix = remainingCarbs >= 25 ? Math.round(remainingCarbs / 30) : 0;
  const saltCaps = Math.max(1, Math.round(sodiumMg / 300));

  const items: string[] = [];
  if (discipline === "trail") {
    items.push(`${gelsCount} Gel`);
    if (barsOrMix > 0) items.push(`${barsOrMix} Bar/Mix`);
    items.push(`${flasksCount}x500mL Flask`);
  } else {
    items.push(`${gelsCount} Gel`);
    items.push(`Minum WS ~${fluidMl} mL`);
  }
  items.push(`${saltCaps} Salt Cap`);
  if (caffeineMg > 0) items.push(`+${caffeineMg} mg Kafein`);

  const carryWeightKg = Number(
    ((fluidMl / 1000) + (carbsG * 1.45) / 1000).toFixed(2)
  );

  return {
    carbsG,
    fluidMl,
    sodiumMg,
    caffeineMg,
    caloriesKcal,
    carryWeightKg,
    packSummary: items.join(" · "),
    fluidRateMlPerHr,
    sweatLossMl,
  };
}

export function evaluateFuelingSafety(params: {
  totalRaceHours: number;
  totalFluidMl: number;
  totalSweatLossMl: number;
  totalCarbsG: number;
  totalCaloriesBurnKcal: number;
  discipline: RaceDiscipline;
  profile: RunnerProfile;
}): FuelingSafetyChecks {
  const {
    totalRaceHours,
    totalFluidMl,
    totalSweatLossMl,
    totalCarbsG,
    totalCaloriesBurnKcal,
    discipline,
    profile,
  } = params;

  const hours = Math.max(0.25, totalRaceHours);
  const fluidRateMlPerHr = Math.round(totalFluidMl / hours);
  const carbRateGPerHr = Math.round(totalCarbsG / hours);
  const netFluidDeficitL = Math.max(0, (totalSweatLossMl - totalFluidMl) / 1000);
  const dehydrationPct = Number(
    ((netFluidDeficitL / Math.max(35, profile.weightKg)) * 100).toFixed(1)
  );
  const dehydrationThresholdPct = discipline === "road" ? 2.0 : 3.0;

  // Baseline endogenous glycogen (~1,800 kcal) + exogenous carbs (4 kcal/g)
  const totalAvailableKcal = 1800 + totalCarbsG * 4;
  const deficitRatio = totalCaloriesBurnKcal > 0 ? totalAvailableKcal / totalCaloriesBurnKcal : 1;
  const bonkRisk: "low" | "moderate" | "high" =
    deficitRatio >= 0.92 ? "low" : deficitRatio >= 0.78 ? "moderate" : "high";

  return {
    gastricCapOk: fluidRateMlPerHr <= GASTRIC_FLUID_CEILING_ML_PER_HR,
    fluidRateMlPerHr,
    dehydrationPct,
    dehydrationThresholdPct,
    dehydrationOk: dehydrationPct <= dehydrationThresholdPct,
    dualTransporterRecommended: totalRaceHours >= 2.0 && carbRateGPerHr >= 60,
    carbRateGPerHr,
    bonkRisk,
  };
}
