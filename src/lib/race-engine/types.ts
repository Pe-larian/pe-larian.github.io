export type RaceDiscipline = "trail" | "road";

export type MapLayerId = "osm" | "topo" | "terrain3d" | "satellite";

export type CheckpointType =
  | "start"
  | "aid"
  | "water"
  | "dropbag"
  | "cutoff"
  | "summit"
  | "finish"
  | "custom";

export type TerrainCategory =
  | "road"
  | "gravel"
  | "singletrack"
  | "climb"
  | "technical"
  | "scree"
  | "descent";

export type GutTolerance = "beginner" | "moderate" | "trained";

export type SweatSodiumCategory = "low" | "moderate" | "high" | "custom";

export type TimezoneCode = "WIB" | "WITA" | "WIT";

export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
  rawEle: number;
  distFromStartM: number;
  gradePct: number;
}

export interface Checkpoint {
  id: string;
  name: string;
  type: CheckpointType;
  distM: number;
  pointIndex: number;
  lat: number;
  lon: number;
  ele: number;
  plannedStopSec: number;
  cutoffElapsedSec?: number;
  terrainAfter: TerrainCategory;
  services: string[];
  notes?: string;
}

export interface RaceMetadata {
  runnerName: string;
  raceName: string;
  discipline: RaceDiscipline;
  raceDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  timezone: TimezoneCode;
  isSample: boolean;
  sourceFileName: string;
}

export interface RunnerProfile {
  weightKg: number;
  flatThresholdPaceSecPerKm: number;
  targetEffortPct: number; // 60..100
  powerHikeGradePct: number; // default 15
  fatigueDriftEnabled: boolean;
  gutTolerance: GutTolerance;
  sweatRateLPerHr: number;
  sweatSodiumCategory: SweatSodiumCategory;
  customSweatSodiumMgPerL?: number;
  caffeineStrategy: boolean;
  targetFinishTimeSec?: number;
  roadSplitPct: number; // -10 (negative split) .. 0 (even) .. +10 (positive split)
}

export interface GpxCleaningStats {
  originalPointCount: number;
  cleanedPointCount: number;
  spikesDetected: number;
  spikesRemoved: number;
  rawGainM: number;
  currentGainM: number;
  smoothingWindow: number;
  demCalibrated: boolean;
}

export interface HourlyWeatherPoint {
  timeIso: string;
  clockLabel: string;
  tempC: number;
  humidityPct: number;
  rainProbPct: number;
  windKmh: number;
  weatherCode: number;
  conditionLabel: string;
}

export interface WeatherForecastResult {
  source: "open-meteo" | "climate-estimate";
  baseElevationM: number;
  startTempC: number;
  summitTempC: number;
  avgHumidityPct: number;
  maxRainProbPct: number;
  heatIndexC: number;
  sweatMultiplier: number;
  sunsetClock: string;
  sunriseClock: string;
  hourly: HourlyWeatherPoint[];
  note: string;
}

export interface SegmentWeatherSnapshot {
  tempC: number;
  humidityPct: number;
  rainProbPct: number;
  conditionLabel: string;
  heatIndexC: number;
}

export interface SegmentSimulation {
  index: number;
  fromCp: Checkpoint;
  toCp: Checkpoint;
  distanceM: number;
  gainM: number;
  lossM: number;
  avgGradePct: number;
  terrain: TerrainCategory;
  terrainFactor: number;
  estimatedMovingSec: number;
  stopSec: number;
  paceSecPerKm: number;
  gapSecPerKm: number;
  arrivalElapsedSec: number;
  departureElapsedSec: number;
  arrivalClockTime: string;
  departureClockTime: string;
  cutoffClockTime?: string;
  cutoffBufferSec?: number;
  cutoffStatus: "none" | "safe" | "tight" | "missed";
  nightRatio: number;
  weather: SegmentWeatherSnapshot;
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
  pacingNote: string;
}

export interface FuelingSafetyChecks {
  gastricCapOk: boolean;
  fluidRateMlPerHr: number;
  dehydrationPct: number;
  dehydrationThresholdPct: number;
  dehydrationOk: boolean;
  dualTransporterRecommended: boolean;
  carbRateGPerHr: number;
  bonkRisk: "low" | "moderate" | "high";
}

export interface RaceSimulationSummary {
  totalDistanceM: number;
  equivalentDistanceKm: number;
  totalGainM: number;
  totalLossM: number;
  minEleM: number;
  maxEleM: number;
  totalMovingSec: number;
  totalStopSec: number;
  totalElapsedSec: number;
  finishClockTime: string;
  avgPaceSecPerKm: number;
  avgGapSecPerKm: number;
  finalCutoffBufferSec?: number;
  finalCutoffStatus: "none" | "safe" | "tight" | "missed";
  totalCarbsG: number;
  totalFluidMl: number;
  totalSodiumMg: number;
  totalCaffeineMg: number;
  totalCaloriesBurnKcal: number;
  totalCaloriesIntakeKcal: number;
  preRaceCarbsMinG: number;
  preRaceCarbsMaxG: number;
  feedingIntervalMin: number;
  totalFeedingSessions: number;
  carbsPerSessionG: number;
  totalGelsCount: number;
  trailSolidRatioActive: boolean;
  fastCarbTotalG: number;
  solidFoodTotalG: number;
  slopeDistribution: {
    flatPct: number;
    climbPct: number;
    steepPct: number;
  };
  safety: FuelingSafetyChecks;
  segments: SegmentSimulation[];
}
