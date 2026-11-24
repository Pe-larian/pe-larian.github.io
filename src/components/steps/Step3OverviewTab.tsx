"use client";

import { useRef } from "react";
import { ElevationProfileChart } from "@/components/chart/ElevationProfileChart";
import {
  IconArrowRight,
  IconCloudRain,
  IconDownload,
  IconPrint,
  IconSun,
  IconUpload,
} from "@/components/Icons";
import { formatDuration, TERRAIN_LABELS } from "@/lib/race-engine/pacing";
import type {
  Checkpoint,
  RaceMetadata,
  RaceSimulationSummary,
  TrackPoint,
  WeatherForecastResult,
} from "@/lib/race-engine/types";

interface Step3OverviewTabProps {
  metadata: RaceMetadata;
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  simulation: RaceSimulationSummary;
  weather: WeatherForecastResult;
  weatherLoading: boolean;
  hoveredPointIndex: number | null;
  onHoverPointIndex: (idx: number | null) => void;
  onFocusSegment: (segIdx: number) => void;
  onUploadGpxFile: (file: File) => void;
  onExportGpx: () => void;
  onSwitchToStrategyTab: () => void;
  onOpenPrintModal: () => void;
}

export function Step3OverviewTab({
  metadata,
  points,
  checkpoints,
  simulation,
  weather,
  weatherLoading,
  hoveredPointIndex,
  onHoverPointIndex,
  onFocusSegment,
  onUploadGpxFile,
  onExportGpx,
  onSwitchToStrategyTab,
  onOpenPrintModal,
}: Step3OverviewTabProps) {
  const reuploadRef = useRef<HTMLInputElement | null>(null);

  // Estimate distance where sunset occurs based on segment arrival clocks
  let sunsetDistM: number | null = null;
  const sunsetParts = weather.sunsetClock.split(":");
  const sunsetMin = (Number(sunsetParts[0]) || 18) * 60 + (Number(sunsetParts[1]?.slice(0, 2)) || 0);
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

        {/* Compact GPX Action Bar directly inside Overview (Opsi B) */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E5E2] bg-white px-3 py-2">
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
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#161E19]">
              {metadata.sourceFileName}
            </p>
            <p className="text-[11px] text-[#525C56]">
              {metadata.isSample ? "Sample GPX aktif" : "File GPX pengguna"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => reuploadRef.current?.click()}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#8C948E] bg-white px-2.5 text-xs font-semibold text-[#161E19] hover:bg-[#F5F5F3]"
            >
              <IconUpload size={13} />
              Upload ulang GPX
            </button>
            <button
              type="button"
              onClick={onExportGpx}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#8C948E] bg-white px-2.5 text-xs font-semibold text-[#161E19] hover:bg-[#F5F5F3]"
            >
              <IconDownload size={13} />
              Export .GPX
            </button>
          </div>
        </div>

        {/* Elevation & Gradient Chart */}
        <section aria-labelledby="heading-elevation">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 id="heading-elevation" className="text-xs font-bold uppercase tracking-wide text-[#161E19]">
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

        {/* Segment Summary List */}
        <section aria-labelledby="heading-segments">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 id="heading-segments" className="text-xs font-bold uppercase tracking-wide text-[#161E19]">
              Segmen Rute ({simulation.segments.length})
            </h2>
            <span className="text-[11px] text-[#525C56]">Klik untuk fokus di peta</span>
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
                    S{seg.index + 1}: {seg.fromCp.name} -&gt; {seg.toCp.name}
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

        {/* Weather Forecast Section */}
        <section
          aria-labelledby="heading-weather"
          className="rounded-xl border border-[#E2E5E2] bg-[#F5F5F3] p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id="heading-weather" className="text-xs font-bold uppercase tracking-wide text-[#161E19]">
              Prakiraan Cuaca Race
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                weather.source === "open-meteo"
                  ? "bg-[#EAF6F0] text-[#146342]"
                  : "bg-[#FDF3E3] text-[#8A4B00]"
              }`}
            >
              {weatherLoading
                ? "Memuat..."
                : weather.source === "open-meteo"
                  ? "Open-Meteo Live"
                  : "Estimasi Iklim"}
            </span>
          </div>

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
        </section>
      </div>

      {/* Bottom CTA Bar */}
      <div className="flex items-center gap-2 border-t border-[#E2E5E2] bg-white px-5 py-3.5">
        <button
          type="button"
          onClick={onSwitchToStrategyTab}
          className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1B2B22] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#161E19]"
        >
          Strategi Pacing & Fueling
          <IconArrowRight size={16} />
        </button>
        <button
          type="button"
          onClick={onOpenPrintModal}
          aria-label="Buka modal Print CP Card"
          className="inline-flex min-h-[46px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#8C948E] bg-white px-3 text-xs font-semibold text-[#161E19] hover:bg-[#F5F5F3]"
        >
          <IconPrint size={16} />
          Print
        </button>
      </div>
    </div>
  );
}
