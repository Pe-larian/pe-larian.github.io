import type {
  FuelingSafetyChecks,
  GutTolerance,
  RaceDiscipline,
  RunnerProfile,
  SweatSodiumCategory,
} from "./types";

const GASTRIC_FLUID_CEILING_ML_PER_HR = 1000;
const MIN_FLUID_ML_PER_HR = 400;
export const STANDARD_GEL_CARBS_G = 22;
export const FEEDING_INTERVAL_MIN = 30;

export function getSweatSodiumMgPerL(
  category: SweatSodiumCategory,
  customMgPerL?: number
): number {
  if (category === "custom" && customMgPerL && customMgPerL > 100) {
    return customMgPerL;
  }
  switch (category) {
    case "low":
      return 500;
    case "high":
      return 1000;
    case "moderate":
    default:
      return 750;
  }
}

/**
 * Standard sports nutrition carbohydrate rate (g/hr) based on duration (T_est) and gut level (1..3):
 * - T_est < 1.0 hr -> 0 g/hr
 * - 1.0 <= T_est < 1.5 hr -> 30 g/hr
 * - 1.5 <= T_est <= 2.5 hr -> 45 + 15 * (Gut_Lvl - 1) [45, 60, 75]
 * - T_est > 2.5 hr -> 60 + 15 * (Gut_Lvl - 1) [60, 75, 90]
 */
export function computeTargetCarbRateGPerHr(
  totalRaceHours: number,
  gutTolerance: GutTolerance = "moderate"
): { rateGPerHr: number; dualTransporterRecommended: boolean } {
  const gutLvl = gutTolerance === "beginner" ? 1 : gutTolerance === "trained" ? 3 : 2;

  if (totalRaceHours < 1.0) {
    return { rateGPerHr: 0, dualTransporterRecommended: false };
  }
  if (totalRaceHours < 1.5) {
    return { rateGPerHr: 30, dualTransporterRecommended: false };
  }
  if (totalRaceHours <= 2.5) {
    const rate = 45 + 15 * (gutLvl - 1);
    return { rateGPerHr: rate, dualTransporterRecommended: rate > 60 };
  }
  const rate = 60 + 15 * (gutLvl - 1);
  return { rateGPerHr: rate, dualTransporterRecommended: rate > 60 };
}

/**
 * Hydration & Sodium Engine:
 * - Base Fluid = W * 8 mL/hr
 * - Temp < 20C -> 1.0x | 20..28C -> 1.25x | > 28C -> 1.5x
 * - Safe gastric bounds: [400, 1000] mL/hr
 * - Sodium: (H_rate / 1000) * (500 | 750 | 1000 mg/L)
 */
export function computeHydrationAndSodiumRates(
  weightKg: number,
  tempC: number,
  sweatCategory: SweatSodiumCategory = "moderate",
  customMgPerL?: number
): { fluidRateMlPerHr: number; sodiumRateMgPerHr: number; tempTier: 1 | 2 | 3 } {
  const safeWeight = Math.max(35, weightKg);
  const baseFluid = safeWeight * 8;
  const tempTier: 1 | 2 | 3 = tempC < 20 ? 1 : tempC <= 28 ? 2 : 3;
  const tempMult = tempTier === 1 ? 1.0 : tempTier === 2 ? 1.25 : 1.5;

  const fluidRateMlPerHr = Math.min(
    GASTRIC_FLUID_CEILING_ML_PER_HR,
    Math.max(MIN_FLUID_ML_PER_HR, Math.round(baseFluid * tempMult))
  );

  const sweatNaMgPerL = getSweatSodiumMgPerL(sweatCategory, customMgPerL);
  const sodiumRateMgPerHr = Math.round((fluidRateMlPerHr / 1000) * sweatNaMgPerL);

  return { fluidRateMlPerHr, sodiumRateMgPerHr, tempTier };
}

export function computePreRaceCarbs(weightKg: number): { minG: number; maxG: number } {
  const safeWeight = Math.max(35, weightKg);
  return {
    minG: Math.round(safeWeight * 1.5),
    maxG: Math.round(safeWeight * 2.0),
  };
}

export function computeFeedingSchedule(
  totalRaceHours: number,
  totalCarbsG: number
): {
  intervalMin: number;
  sessions: number;
  carbsPerSessionG: number;
  totalGelsCount: number;
} {
  const rawSessions = Math.floor((totalRaceHours * 60) / FEEDING_INTERVAL_MIN) - 1;
  const sessions = totalCarbsG <= 0 ? 0 : Math.max(1, rawSessions);
  const carbsPerSessionG = sessions > 0 ? Math.round(totalCarbsG / sessions) : 0;
  const totalGelsCount =
    totalCarbsG > 0 ? Math.ceil(totalCarbsG / STANDARD_GEL_CARBS_G) : 0;

  return {
    intervalMin: FEEDING_INTERVAL_MIN,
    sessions,
    carbsPerSessionG,
    totalGelsCount,
  };
}

/**
 * Compute per-segment carbs, fluid, mandatory Trail carry water (+20% buffer),
 * sodium, caffeine, calorie burn, and Road vs Trail practical summary.
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
  segmentTempC: number;
  heatMultiplier: number;
}): {
  carbsG: number;
  fluidMl: number;
  mandatoryCarryWaterMl: number;
  sodiumMg: number;
  caffeineMg: number;
  caloriesKcal: number;
  carryWeightKg: number;
  gelsCount: number;
  fastCarbG: number;
  solidFoodCarbG: number;
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
    segmentTempC,
    heatMultiplier,
  } = params;

  const hours = Math.max(0.05, durationSec / 3600);
  const { rateGPerHr } = computeTargetCarbRateGPerHr(totalRaceHours, profile.gutTolerance);
  const carbsG = Math.round(rateGPerHr * hours);

  const { fluidRateMlPerHr, sodiumRateMgPerHr } = computeHydrationAndSodiumRates(
    profile.weightKg,
    segmentTempC,
    profile.sweatSodiumCategory,
    profile.customSweatSodiumMgPerL
  );

  const fluidMl = Math.round((fluidRateMlPerHr * hours) / 50) * 50;
  const sodiumMg = Math.round((sodiumRateMgPerHr * hours) / 25) * 25;

  // Estimate actual sweat loss for dehydration safety check
  const effectiveSweatMlPerHr = profile.sweatRateLPerHr * 1000 * heatMultiplier;
  const sweatLossMl = effectiveSweatMlPerHr * hours;

  // Caffeine strategy: optional late-race boost for >= 2h efforts
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

  // Caloric expenditure (~1.036 kcal/kg/km scaled by Minetti metabolic cost ratio)
  const distKm = distanceM / 1000;
  const caloriesKcal = Math.round(profile.weightKg * distKm * 1.036 * metabolicCostRatio);

  // Trail > 3 hours uses 60% fast-absorbing (gel/drink) + 40% solid real food
  const trailSolidRatioActive = discipline === "trail" && totalRaceHours > 3.0 && carbsG > 0;
  const fastCarbG = trailSolidRatioActive ? Math.round(carbsG * 0.6) : carbsG;
  const solidFoodCarbG = trailSolidRatioActive ? Math.max(0, carbsG - fastCarbG) : 0;

  const gelsCount =
    fastCarbG > 0 ? Math.ceil(fastCarbG / STANDARD_GEL_CARBS_G) : 0;

  // Road mode does not carry water/gear between WS; Trail carries fluid with +20% safety buffer
  const mandatoryCarryWaterMl =
    discipline === "trail"
      ? Math.round((fluidRateMlPerHr * hours * 1.2) / 50) * 50
      : 0;

  const carryWeightKg =
    discipline === "trail"
      ? Number(((mandatoryCarryWaterMl / 1000) + (carbsG * 1.45) / 1000).toFixed(2))
      : 0;

  const items: string[] = [];
  if (discipline === "trail") {
    if (gelsCount > 0) items.push(`${gelsCount} Gel (@22g)`);
    if (solidFoodCarbG > 0) {
      items.push(`Real food ~${solidFoodCarbG}g (kurma/roti/kentang)`);
    }
    const flasksCount = Math.max(1, Math.ceil(mandatoryCarryWaterMl / 500));
    items.push(`Wajib bawa ${mandatoryCarryWaterMl} mL (${flasksCount}x500mL)`);
  } else {
    if (gelsCount > 0) items.push(`${gelsCount} Gel (@22g)`);
    else items.push("Tanpa gel wajib (<1 jam)");
    items.push(`Minum WS ~${fluidMl} mL`);
  }
  if (sodiumMg > 0) items.push(`Natrium ${sodiumMg} mg`);
  if (caffeineMg > 0) items.push(`Kafein ${caffeineMg} mg`);

  return {
    carbsG,
    fluidMl,
    mandatoryCarryWaterMl,
    sodiumMg,
    caffeineMg,
    caloriesKcal,
    carryWeightKg,
    gelsCount,
    fastCarbG,
    solidFoodCarbG,
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
    dualTransporterRecommended: carbRateGPerHr > 60,
    carbRateGPerHr,
    bonkRisk,
  };
}
