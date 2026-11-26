"use client";

import { useRef } from "react";
import { ElevationProfileChart } from "@/components/chart/ElevationProfileChart";
import {
  IconArrowRight,
  IconCloudRain,
  IconDownload,
  IconSun,
  IconUpload,
} from "@/components/Icons";
import { formatDuration, TERRAIN_LABELS } from "@/lib/race-engine/pacing";
import type {
  Checkpoint,
  RaceMetadata,
  RaceSimulationSummary,
  StrategyGroupingMode,
  TrackPoint,
  WeatherForecastResult,
} from "@/lib/race-engine/types";

interface Step3OverviewTabProps {
  metadata: RaceMetadata;
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  simulation: RaceSimulationSummary;
  strategyGrouping: StrategyGroupingMode;
  onChangeStrategyGrouping: (mode: StrategyGroupingMode) => void;
  systemSegmentCount: number;
  customCheckpointCount: number;
  weather: WeatherForecastResult;
  weatherLoading: boolean;
  hoveredPointIndex: number | null;
  onHoverPointIndex: (idx: number | null) => void;
  onFocusSegment: (segIdx: number) => void;
  onUploadGpxFile: (file: File) => void;
  onExportGpx: () => void;
  onSwitchToStrategyTab: () => void;
}

export function Step3OverviewTab({
  metadata,
  points,
  checkpoints,
  simulation,
  strategyGrouping,
  onChangeStrategyGrouping,
  systemSegmentCount,
  customCheckpointCount,
  weather,
  weatherLoading,
  hoveredPointIndex,
  onHoverPointIndex,
  onFocusSegment,
  onUploadGpxFile,
  onExportGpx,
  onSwitchToStrategyTab,
}: Step3OverviewTabProps) {
  const reuploadRef = useRef<HTMLInputElement | null>(null);

  let sunsetDistM: number | null = null;
  const sunsetParts = weather.sunsetClock.split(":");
  const sunsetMin =
    (Number(sunsetParts[0]) || 18) * 60 + (Number(sunsetParts[1]?.slice(0, 2)) || 0);
  const startParts = metadata.startTime.split(":");
  const startMin = (Number(startParts[0]) || 6) * 60 + (Number(startParts[1]) || 0);
  const secUntilSunset = (sunsetMin - startMin) * 60;

  if (secUntilSunset > 0 && secUntilSunset < simulation.totalElapsedSec) {
    for (const seg of simulation.segments) {
      const segStartSec = seg.arrivalElapsedSec - seg.estimatedMovingSec;
      if (secUntilSunset >= segStartSec && secUntilSunset <= seg.arrivalElapsedSec) {
        const frac = (secUntilSunset - segStartSec) / Math.max(1, seg.estimatedMovingSec);
        sunsetDistM = seg.fromCp.distM + (seg.toCp.distM - seg.fromCp.distM) * frac;
        break;
      }
    }
  }

  const isLiveForecast = weather.source === "open-meteo";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {/* 4-stat inline row */}
        <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-[#E2E5E2] bg-[#F5F5F3] p-2.5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#525C56]">
              Jarak
            </p>
            <p className="font-num mt-0.5 text-sm font-bold text-[#161E19]">
              {(simulation.totalDistanceM / 1000).toFixed(1)} km
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#525C56]">
              Gain
            </p>
            <p className="font-num mt-0.5 text-sm font-bold text-[#146342]">
              +{simulation.totalGainM} m
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#525C56]">
              Durasi
            </p>
            <p className="font-num mt-0.5 text-sm font-bold text-[#161E19]">
              {formatDuration(simulation.totalElapsedSec)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#525C56]">
              Est. Finis
            </p>
            <p className="font-num mt-0.5 text-sm font-bold text-[#161E19]">
              {simulation.finishClockTime.slice(0, 5)}
            </p>
          </div>
        </div>

        {/* Cleanly Wrapped GPX Action Bar (never clips on 390px mobile) */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E2E5E2] bg-white p-3">
          <input
            ref={reuploadRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadGpxFile(f);
              e.target.value = "";
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#161E19]">
              {metadata.sourceFileName}
            </p>
            <p className="text-[11px] text-[#525C56]">
              {metadata.isSample ? "Sample GPX aktif" : "File GPX pengguna"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => reuploadRef.current?.click()}
              className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg border border-[#8C948E] bg-white px-2.5 text-xs font-semibold text-[#161E19] hover:bg-[#F5F5F3]"
            >
              <IconUpload size={13} />
              Upload ulang GPX
            </button>
            <button
              type="button"
              onClick={onExportGpx}
              className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg border border-[#8C948E] bg-white px-2.5 text-xs font-semibold text-[#161E19] hover:bg-[#F5F5F3]"
            >
              <IconDownload size={13} />
              Export .GPX
            </button>
          </div>
        </div>

        {/* Elevation & Gradient Chart */}
        <section aria-labelledby="heading-elevation">
          <div className="mb-1.5 flex items-center justify-between">
            <h2
              id="heading-elevation"
              className="text-xs font-bold uppercase tracking-wide text-[#161E19]"
            >
              Grafik Elevasi & Gradient
            </h2>
            <span className="font-num text-[11px] text-[#525C56]">
              {simulation.minEleM} m s.d. {simulation.maxEleM} m
            </span>
          </div>
          <ElevationProfileChart
            points={points}
            checkpoints={checkpoints}
            hoveredPointIndex={hoveredPointIndex}
            onHoverPointIndex={onHoverPointIndex}
            slopeDistribution={simulation.slopeDistribution}
            sunsetDistM={sunsetDistM}
            sunsetClock={weather.sunsetClock}
          />
        </section>

        {/* Segment / Checkpoint Dual Summary List */}
        <section aria-labelledby="heading-segments">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2
              id="heading-segments"
              className="text-xs font-bold uppercase tracking-wide text-[#161E19]"
            >
              {strategyGrouping === "segments"
                ? `Segmen Rute (${simulation.segments.length})`
                : `Checkpoints Rute (${simulation.segments.length})`}
            </h2>

            <div
              className="inline-flex rounded-lg border border-[#E2E5E2] bg-[#F5F5F3] p-0.5"
              role="group"
              aria-label="Pilih ringkasan per segmen atau checkpoint"
            >
              <button
                type="button"
                onClick={() => onChangeStrategyGrouping("segments")}
                aria-pressed={strategyGrouping === "segments"}
                className={`min-h-[30px] rounded-md px-2.5 text-[11px] font-semibold transition-colors ${
                  strategyGrouping === "segments"
                    ? "bg-[#1B2B22] text-white"
                    : "text-[#525C56] hover:text-[#161E19]"
                }`}
              >
                Segmen ({systemSegmentCount})
              </button>
              <button
                type="button"
                onClick={() => onChangeStrategyGrouping("checkpoints")}
                aria-pressed={strategyGrouping === "checkpoints"}
                className={`min-h-[30px] rounded-md px-2.5 text-[11px] font-semibold transition-colors ${
                  strategyGrouping === "checkpoints"
                    ? "bg-[#1B2B22] text-white"
                    : "text-[#525C56] hover:text-[#161E19]"
                }`}
              >
                CP ({customCheckpointCount})
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {simulation.segments.map((seg) => (
              <button
                key={seg.index}
                type="button"
                onClick={() => onFocusSegment(seg.index)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#E2E5E2] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#1E6B3A] hover:bg-[#F5F5F3]"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[#161E19]">
                    {strategyGrouping === "segments" ? `S${seg.index + 1}` : `CP${seg.index + 1}`}:{" "}
                    {seg.fromCp.name} -&gt; {seg.toCp.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#525C56]">
                    {TERRAIN_LABELS[seg.terrain]} ·{" "}
                    <span className="font-num">
                      +{seg.gainM}m / -{seg.lossM}m ({seg.avgGradePct >= 0 ? "+" : ""}
                      {seg.avgGradePct}%)
                    </span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-num text-xs font-bold text-[#161E19]">
                    {(seg.distanceM / 1000).toFixed(1)} km
                  </p>
                  <p className="font-num text-[11px] text-[#525C56]">
                    {formatDuration(seg.estimatedMovingSec)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Weather Forecast Section: Honest Empty State when live forecast/rain is unavailable */}
        <section
          aria-labelledby="heading-weather"
          className="rounded-xl border border-[#E2E5E2] bg-[#F5F5F3] p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="heading-weather"
              className="text-xs font-bold uppercase tracking-wide text-[#161E19]"
            >
              Prakiraan Cuaca Race
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                weatherLoading
                  ? "bg-white text-[#525C56]"
                  : isLiveForecast
                    ? "bg-[#EAF6F0] text-[#146342]"
                    : "bg-[#FDF3E3] text-[#8A4B00]"
              }`}
            >
              {weatherLoading
                ? "Memuat..."
                : isLiveForecast
                  ? "Open-Meteo Live"
                  : "Belum Tersedia"}
            </span>
          </div>

          {weatherLoading ? (
            <div className="mt-2.5 rounded-lg border border-[#E2E5E2] bg-white px-3 py-5 text-center text-xs text-[#525C56]">
              Mengambil prakiraan cuaca dan prediksi hujan untuk tanggal race...
            </div>
          ) : !isLiveForecast ? (
            <div
              role="status"
              className="mt-2.5 flex flex-col items-center rounded-lg border border-[#E2E5E2] bg-white px-4 py-5 text-center"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F5F3] text-[#525C56]">
                <IconCloudRain size={18} />
              </span>
              <p className="mt-2 text-xs font-bold text-[#161E19]">
                Ramalan cuaca & prediksi hujan belum tertampil
              </p>
              <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-[#525C56]">
                Prakiraan cuaca dan peluang hujan dari Open-Meteo belum tersedia untuk tanggal{" "}
                <strong className="font-num text-[#161E19]">{metadata.raceDate}</strong> (baru
                tersedia mulai 16 hari sebelum hari race).
              </p>
            </div>
          ) : (
            <>
              <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-[#E2E5E2] bg-white p-2.5 text-center">
                <div>
                  <p className="text-[10px] text-[#525C56]">Start / Puncak</p>
                  <p className="font-num mt-0.5 text-xs font-bold text-[#161E19]">
                    {weather.startTempC.toFixed(0)}° / {weather.summitTempC.toFixed(0)}°C
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#525C56]">Heat Index / RH</p>
                  <p className="font-num mt-0.5 text-xs font-bold text-[#161E19]">
                    {weather.heatIndexC.toFixed(0)}°C · {weather.avgHumidityPct}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#525C56]">Sunset</p>
                  <p className="font-num mt-0.5 text-xs font-bold text-[#161E19]">
                    {weather.sunsetClock.slice(0, 5)} {metadata.timezone}
                  </p>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-5 gap-1">
                {weather.hourly.map((h) => (
                  <div
                    key={h.clockLabel}
                    className="flex flex-col items-center rounded-lg border border-[#E2E5E2] bg-white px-1 py-1.5 text-center"
                  >
                    <span className="font-num text-[10px] font-medium text-[#525C56]">
                      {h.clockLabel}
                    </span>
                    <span className="my-1 text-[#1E6B3A]">
                      {h.rainProbPct >= 35 ? <IconCloudRain size={14} /> : <IconSun size={14} />}
                    </span>
                    <span className="font-num text-xs font-bold text-[#161E19]">
                      {h.tempC.toFixed(0)}°
                    </span>
                    <span className="font-num text-[10px] text-[#525C56]">
                      {h.rainProbPct}%
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-2 text-[11px] text-[#525C56]">{weather.note}</p>
            </>
          )}
        </section>
      </div>

      {/* Bottom CTA Bar */}
      <div className="flex items-center gap-2 border-t border-[#E2E5E2] bg-white px-5 py-3.5">
        <button
          type="button"
          onClick={onSwitchToStrategyTab}
          className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1B2B22] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#161E19]"
        >
          Strategi Pacing &amp; Fueling
          <IconArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
