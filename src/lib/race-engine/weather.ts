import type {
  HourlyWeatherPoint,
  SegmentWeatherSnapshot,
  WeatherForecastResult,
} from "./types";

/**
 * Standard environmental lapse rate: -0.65 C per 100m altitude gain.
 */
export function applyLapseRateC(
  baseTempC: number,
  baseEleM: number,
  targetEleM: number
): number {
  const deltaM = targetEleM - baseEleM;
  return Number((baseTempC - (deltaM / 100) * 0.65).toFixed(1));
}

/**
 * Simplified Rothfusz / Steadman Tropical Heat Index (Celsius).
 */
export function computeHeatIndexC(tempC: number, humidityPct: number): number {
  if (tempC < 24 || humidityPct < 40) return Number(tempC.toFixed(1));
  const tF = (tempC * 9) / 5 + 32;
  const r = humidityPct;
  const hiF =
    -42.379 +
    2.04901523 * tF +
    10.14333127 * r -
    0.22475541 * tF * r -
    0.00683783 * tF * tF -
    0.05481717 * r * r +
    0.00122874 * tF * tF * r +
    0.00085282 * tF * r * r -
    0.00000199 * tF * tF * r * r;
  return Number((((hiF - 32) * 5) / 9).toFixed(1));
}

export function computeSweatHeatMultiplier(heatIndexC: number): number {
  if (heatIndexC <= 22) return 1.0;
  if (heatIndexC <= 27) return 1.08;
  if (heatIndexC <= 32) return 1.18;
  if (heatIndexC <= 37) return 1.3;
  return 1.4;
}

export function wmoCodeToIndonesian(code: number): string {
  if (code === 0) return "Cerah";
  if (code <= 2) return "Cerah berawan";
  if (code === 3) return "Berawan";
  if (code === 45 || code === 48) return "Berkabut";
  if (code >= 51 && code <= 57) return "Gerimis";
  if (code >= 61 && code <= 65) return "Hujan ringan";
  if (code >= 80 && code <= 82) return "Hujan lokal";
  if (code >= 95) return "Badai petir";
  return "Berawan";
}

/**
 * Approximate solar sunrise and sunset in local timezone for Indonesian / tropical latitudes.
 */
export function estimateSolarTimes(
  lat: number,
  lon: number,
  raceDate: string,
  tzOffsetHours: number
): { sunriseMin: number; sunsetMin: number; sunriseClock: string; sunsetClock: string } {
  const dateObj = new Date(`${raceDate}T12:00:00Z`);
  const startOfYear = new Date(Date.UTC(dateObj.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.max(
    1,
    Math.min(365, Math.floor((dateObj.getTime() - startOfYear.getTime()) / 86400000))
  );

  const declRad = (23.44 * Math.PI / 180) * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const latRad = (lat * Math.PI) / 180;
  const cosH = Math.max(
    -0.95,
    Math.min(0.95, -Math.tan(latRad) * Math.tan(declRad))
  );
  const halfDayHours = (Math.acos(cosH) * 180) / Math.PI / 15;

  // Solar noon offset from timezone meridian
  const tzMeridianLon = tzOffsetHours * 15;
  const lonCorrectionHours = (tzMeridianLon - lon) / 15;
  const solarNoonHours = 12 + lonCorrectionHours;

  const sunriseMin = Math.round((solarNoonHours - halfDayHours) * 60);
  const sunsetMin = Math.round((solarNoonHours + halfDayHours) * 60);

  const fmt = (mins: number) => {
    const wrapped = ((mins % 1440) + 1440) % 1440;
    const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
    const mm = String(wrapped % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  return {
    sunriseMin,
    sunsetMin,
    sunriseClock: fmt(sunriseMin),
    sunsetClock: fmt(sunsetMin),
  };
}

export function timezoneToOffsetHours(tz: "WIB" | "WITA" | "WIT"): number {
  if (tz === "WIB") return 7;
  if (tz === "WITA") return 8;
  return 9;
}

/**
 * Auto-detect Indonesian timezone (WIB/WITA/WIT) from route start longitude.
 */
export function detectIndonesianTimezone(lon: number): "WIB" | "WITA" | "WIT" {
  if (!Number.isFinite(lon) || lon < 114.5) return "WIB";
  if (lon <= 129.0) return "WITA";
  return "WIT";
}

/**
 * Deterministic tropical climate fallback used when race date is beyond Open-Meteo's 16-day forecast window
 * or when offline. Always tagged honestly as source: "climate-estimate".
 */
export function buildClimateFallbackForecast(
  lat: number,
  lon: number,
  baseEleM: number,
  maxEleM: number,
  raceDate: string,
  tz: "WIB" | "WITA" | "WIT"
): WeatherForecastResult {
  const solar = estimateSolarTimes(lat, lon, raceDate, timezoneToOffsetHours(tz));
  // Sea-level tropical baseline ~29 C adjusted to start elevation
  const baseMorningTemp = applyLapseRateC(29.5, 0, baseEleM);
  const slots = [
    { hour: 6, delta: -2.0, hum: 84, rain: 15, wind: 8, code: 1 },
    { hour: 9, delta: 1.5, hum: 76, rain: 20, wind: 11, code: 2 },
    { hour: 12, delta: 3.5, hum: 72, rain: 35, wind: 15, code: 61 },
    { hour: 15, delta: 2.0, hum: 78, rain: 40, wind: 14, code: 80 },
    { hour: 18, delta: -1.5, hum: 85, rain: 25, wind: 10, code: 3 },
  ];

  const hourly: HourlyWeatherPoint[] = slots.map((s) => {
    const temp = Number((baseMorningTemp + s.delta).toFixed(1));
    return {
      timeIso: `${raceDate}T${String(s.hour).padStart(2, "0")}:00`,
      clockLabel: `${String(s.hour).padStart(2, "0")}:00`,
      tempC: temp,
      humidityPct: s.hum,
      rainProbPct: s.rain,
      windKmh: s.wind,
      weatherCode: s.code,
      conditionLabel: wmoCodeToIndonesian(s.code),
    };
  });

  const startTempC = hourly[0].tempC;
  const summitTempC = applyLapseRateC(hourly[2].tempC, baseEleM, maxEleM);
  const avgHumidityPct = 79;
  const maxRainProbPct = 40;
  const heatIndexC = computeHeatIndexC(hourly[2].tempC, avgHumidityPct);

  return {
    source: "climate-estimate",
    baseElevationM: baseEleM,
    startTempC,
    summitTempC,
    avgHumidityPct,
    maxRainProbPct,
    heatIndexC,
    sweatMultiplier: computeSweatHeatMultiplier(heatIndexC),
    sunsetClock: `${solar.sunsetClock} ${tz}`,
    sunriseClock: `${solar.sunriseClock} ${tz}`,
    hourly,
    note: "Estimasi iklim ketinggian (tanggal race di luar jendela prakiraan 16 hari).",
  };
}

export function sampleWeatherForSegment(
  forecast: WeatherForecastResult,
  midpointHourOfDay: number,
  segmentMidEleM: number
): SegmentWeatherSnapshot {
  const wrappedHour = ((midpointHourOfDay % 24) + 24) % 24;
  let closest = forecast.hourly[0];
  let bestDiff = Infinity;

  for (const h of forecast.hourly) {
    const hr = Number(h.clockLabel.slice(0, 2));
    const diff = Math.abs(hr - wrappedHour);
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = h;
    }
  }

  const adjustedTemp = applyLapseRateC(
    closest.tempC,
    forecast.baseElevationM,
    segmentMidEleM
  );
  const heatIndexC = computeHeatIndexC(adjustedTemp, closest.humidityPct);

  return {
    tempC: adjustedTemp,
    humidityPct: closest.humidityPct,
    rainProbPct: closest.rainProbPct,
    conditionLabel: closest.conditionLabel,
    heatIndexC,
  };
}
