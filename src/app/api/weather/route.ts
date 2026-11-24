import { NextRequest, NextResponse } from "next/server";
import {
  applyLapseRateC,
  buildClimateFallbackForecast,
  computeHeatIndexC,
  computeSweatHeatMultiplier,
  estimateSolarTimes,
  timezoneToOffsetHours,
  wmoCodeToIndonesian,
} from "@/lib/race-engine/weather";
import type { HourlyWeatherPoint, TimezoneCode, WeatherForecastResult } from "@/lib/race-engine/types";

interface CacheEntry {
  expiresAt: number;
  data: WeatherForecastResult;
}

// Short-lived in-memory cache keyed strictly by rounded public geo grid + date (zero user data stored)
const WEATHER_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const baseEleM = Number(searchParams.get("baseEle") ?? "0");
  const maxEleM = Number(searchParams.get("maxEle") ?? String(baseEleM));
  const raceDate = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const tzParam = (searchParams.get("tz") ?? "WITA") as TimezoneCode;
  const tz: TimezoneCode = tzParam === "WIB" || tzParam === "WIT" ? tzParam : "WITA";

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Koordinat lat/lon tidak valid." }, { status: 400 });
  }

  const gridLat = lat.toFixed(2);
  const gridLon = lon.toFixed(2);
  const cacheKey = `${gridLat},${gridLon},${Math.round(baseEleM / 50) * 50},${Math.round(maxEleM / 50) * 50},${raceDate},${tz}`;
  const cached = WEATHER_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=900" },
    });
  }

  const now = new Date();
  const target = new Date(`${raceDate}T00:00:00Z`);
  const diffDays = Math.floor((target.getTime() - now.getTime()) / 86400000);

  // Open-Meteo Forecast API covers up to 16 days ahead; beyond that, return honest climate estimate
  if (Number.isNaN(diffDays) || diffDays < -1 || diffDays > 15) {
    const fallback = buildClimateFallbackForecast(lat, lon, baseEleM, maxEleM, raceDate, tz);
    return NextResponse.json(fallback, {
      headers: { "Cache-Control": "public, max-age=900" },
    });
  }

  try {
    const tzIana =
      tz === "WIB"
        ? "Asia/Jakarta"
        : tz === "WIT"
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
    const solar = estimateSolarTimes(lat, lon, raceDate, timezoneToOffsetHours(tz));

    const payload: WeatherForecastResult = {
      source: "open-meteo",
      baseElevationM: Math.round(baseEleM),
      startTempC,
      summitTempC,
      avgHumidityPct,
      maxRainProbPct,
      heatIndexC,
      sweatMultiplier: computeSweatHeatMultiplier(heatIndexC),
      sunsetClock: `${solar.sunsetClock} ${tz}`,
      sunriseClock: `${solar.sunriseClock} ${tz}`,
      hourly,
      note: "Prakiraan langsung Open-Meteo (disesuaikan lapse rate ketinggian -0,65°C per 100 m).",
    };

    WEATHER_CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: payload });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=900" },
    });
  } catch {
    const fallback = buildClimateFallbackForecast(lat, lon, baseEleM, maxEleM, raceDate, tz);
    return NextResponse.json(fallback, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }
}
