import type {
  HourlyWeatherPoint,
  TimezoneCode,
  WeatherForecastResult,
} from "./types";
import {
  applyLapseRateC,
  buildClimateFallbackForecast,
  computeHeatIndexC,
  computeSweatHeatMultiplier,
  estimateSolarTimes,
  timezoneToOffsetHours,
  wmoCodeToIndonesian,
} from "./weather";

interface WeatherCacheEntry {
  expiresAt: number;
  data: WeatherForecastResult;
}

const WEATHER_CACHE = new Map<string, WeatherCacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface FetchWeatherParams {
  lat: number;
  lon: number;
  baseEleM: number;
  maxEleM: number;
  raceDate: string;
  timezone: TimezoneCode;
}

/**
 * Fetches hourly race-day weather directly from Open-Meteo's public CORS-enabled API,
 * adjusting summit/segment temperatures using environmental lapse rate.
 * Falls back transparently to altitude climate estimates if outside the 16-day window or offline.
 */
export async function fetchRaceWeatherForecast({
  lat,
  lon,
  baseEleM,
  maxEleM,
  raceDate,
  timezone,
}: FetchWeatherParams): Promise<WeatherForecastResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Koordinat lat/lon tidak valid.");
  }

  const gridLat = lat.toFixed(2);
  const gridLon = lon.toFixed(2);
  const cacheKey = `${gridLat},${gridLon},${Math.round(baseEleM / 50) * 50},${Math.round(maxEleM / 50) * 50},${raceDate},${timezone}`;
  const cached = WEATHER_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const now = new Date();
  const target = new Date(`${raceDate}T00:00:00Z`);
  const diffDays = Math.floor((target.getTime() - now.getTime()) / 86400000);

  if (Number.isNaN(diffDays) || diffDays < -1 || diffDays > 15) {
    return buildClimateFallbackForecast(lat, lon, baseEleM, maxEleM, raceDate, timezone);
  }

  try {
    const tzIana =
      timezone === "WIB"
        ? "Asia/Jakarta"
        : timezone === "WIT"
          ? "Asia/Jayapura"
          : "Asia/Makassar";

    const omUrl = new URL("https://api.open-meteo.com/v1/forecast");
    omUrl.searchParams.set("latitude", lat.toFixed(4));
    omUrl.searchParams.set("longitude", lon.toFixed(4));
    omUrl.searchParams.set("elevation", String(Math.max(0, Math.round(baseEleM))));
    omUrl.searchParams.set(
      "hourly",
      "temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m"
    );
    omUrl.searchParams.set("start_date", raceDate);
    omUrl.searchParams.set("end_date", raceDate);
    omUrl.searchParams.set("timezone", tzIana);

    const res = await fetch(omUrl.toString(), {
      signal: AbortSignal.timeout(7000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }

    const json = await res.json();
    const times: string[] = json?.hourly?.time ?? [];
    const temps: number[] = json?.hourly?.temperature_2m ?? [];
    const hums: number[] = json?.hourly?.relative_humidity_2m ?? [];
    const rains: number[] = json?.hourly?.precipitation_probability ?? [];
    const codes: number[] = json?.hourly?.weather_code ?? [];
    const winds: number[] = json?.hourly?.wind_speed_10m ?? [];

    if (times.length === 0) {
      throw new Error("Empty Open-Meteo hourly array");
    }

    const targetHours = [6, 9, 12, 15, 18];
    const hourly: HourlyWeatherPoint[] = targetHours.map((hr) => {
      const idx = Math.min(times.length - 1, Math.max(0, hr));
      const code = Number(codes[idx] ?? 2);
      return {
        timeIso: times[idx],
        clockLabel: `${String(hr).padStart(2, "0")}:00`,
        tempC: Number((temps[idx] ?? 24).toFixed(1)),
        humidityPct: Math.round(hums[idx] ?? 78),
        rainProbPct: Math.round(rains[idx] ?? 20),
        windKmh: Math.round(winds[idx] ?? 10),
        weatherCode: code,
        conditionLabel: wmoCodeToIndonesian(code),
      };
    });

    const startTempC = hourly[0].tempC;
    const middayTempC = hourly[2].tempC;
    const summitTempC = applyLapseRateC(middayTempC, baseEleM, maxEleM);
    const avgHumidityPct = Math.round(
      hourly.reduce((acc, h) => acc + h.humidityPct, 0) / hourly.length
    );
    const maxRainProbPct = Math.max(...hourly.map((h) => h.rainProbPct));
    const heatIndexC = computeHeatIndexC(middayTempC, avgHumidityPct);
    const solar = estimateSolarTimes(
      lat,
      lon,
      raceDate,
      timezoneToOffsetHours(timezone)
    );

    const payload: WeatherForecastResult = {
      source: "open-meteo",
      baseElevationM: Math.round(baseEleM),
      startTempC,
      summitTempC,
      avgHumidityPct,
      maxRainProbPct,
      heatIndexC,
      sweatMultiplier: computeSweatHeatMultiplier(heatIndexC),
      sunsetClock: `${solar.sunsetClock} ${timezone}`,
      sunriseClock: `${solar.sunriseClock} ${timezone}`,
      hourly,
      note: "Prakiraan langsung Open-Meteo (disesuaikan lapse rate ketinggian -0,65°C per 100 m).",
    };

    WEATHER_CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: payload });
    return payload;
  } catch {
    return buildClimateFallbackForecast(lat, lon, baseEleM, maxEleM, raceDate, timezone);
  }
}

/**
 * Fetches calibrated Copernicus DEM 90m elevations for up to 100 sampled route points
 * directly from Open-Meteo's CORS-enabled Elevation API.
 */
export async function fetchDemElevations(
  coords: Array<{ lat: number; lon: number }>
): Promise<number[]> {
  if (!Array.isArray(coords) || coords.length === 0 || coords.length > 100) {
    throw new Error("Jumlah titik kalibrasi DEM harus antara 1 sampai 100.");
  }

  const lats = coords.map((c) => Number(c.lat).toFixed(5)).join(",");
  const lons = coords.map((c) => Number(c.lon).toFixed(5)).join(",");
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Layanan DEM Open-Meteo mengembalikan HTTP ${res.status}.`);
  }

  const json = await res.json();
  const elevation: number[] = Array.isArray(json?.elevation) ? json.elevation : [];
  if (elevation.length !== coords.length) {
    throw new Error("Respon elevasi DEM tidak lengkap.");
  }

  return elevation;
}
