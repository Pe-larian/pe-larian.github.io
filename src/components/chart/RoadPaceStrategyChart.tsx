"use client";

import { useMemo } from "react";
import { IconUndo } from "@/components/Icons";
import { formatPace } from "@/lib/race-engine/pacing";

interface RoadPaceStrategyChartProps {
  distanceKm: number;
  stopSec: number;
  avgPaceSecPerKm: number;
  totalElapsedSec: number;
  roadSplitPct: number; // >0 Positive Split (faster start), <0 Negative Split (faster finish)
  onChangePaceSec: (paceSecPerKm: number) => void;
  onChangeSplitPct: (splitPct: number) => void;
  onReset: () => void;
}

const MIN_PACE_SEC = 180; // 3:00 /km (Challenging / right end of slider)
const MAX_PACE_SEC = 540; // 9:00 /km (Ringan / left end of slider)

function formatClockHMS(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatCorosPace(secPerKm: number): string {
  const rounded = Math.max(120, Math.round(secPerKm));
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}'${String(s).padStart(2, "0")}"`;
}

export function RoadPaceStrategyChart({
  distanceKm,
  avgPaceSecPerKm,
  totalElapsedSec,
  roadSplitPct,
  onChangePaceSec,
  onChangeSplitPct,
  onReset,
}: RoadPaceStrategyChartProps) {
  const safeDistKm = Math.max(1, distanceKm);
  const clampedPace = Math.max(MIN_PACE_SEC, Math.min(MAX_PACE_SEC, Math.round(avgPaceSecPerKm)));

  // Invert slider so LEFT = Ringan (slower pace) and RIGHT = Challenging (faster pace)
  const effortSliderValue = MAX_PACE_SEC + MIN_PACE_SEC - clampedPace;

  // Coros split slider: LEFT (-10) = Positive Split (roadSplitPct = +10), RIGHT (+10) = Negative Split (roadSplitPct = -10)
  const corosSplitSliderValue = -roadSplitPct;

  const { fastestKmSec, slowestKmSec, chartPoints, yTicks, xTicks } = useMemo(() => {
    const splitDec = Math.max(-0.15, Math.min(0.15, roadSplitPct / 100));
    const sampleCount = 12;
    const rawSamples: Array<{ km: number; paceSec: number }> = [];

    for (let i = 0; i <= sampleCount; i++) {
      const progress = i / sampleCount; // 0..1
      const mult = 1 + (progress - 0.5) * splitDec;
      const paceSec = clampedPace * mult;
      rawSamples.push({ km: progress * safeDistKm, paceSec });
    }

    const paces = rawSamples.map((p) => p.paceSec);
    const fastest = Math.min(...paces);
    const slowest = Math.max(...paces);

    // Build Y-axis bounds centered around avg pace (faster pace at TOP, slower at BOTTOM)
    const halfSpan = Math.max(75, Math.ceil((slowest - fastest) * 0.9 + 45));
    const topPace = Math.max(120, Math.round((clampedPace - halfSpan) / 10) * 10);
    const bottomPace = Math.round((clampedPace + halfSpan) / 10) * 10;
    const span = Math.max(60, bottomPace - topPace);

    const w = 380;
    const h = 132;
    const padL = 44;
    const padR = 12;
    const padT = 12;
    const padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const xOf = (km: number) => padL + (km / safeDistKm) * plotW;
    // Faster (smaller sec/km) -> higher on chart (smaller y)
    const yOf = (sec: number) => padT + ((sec - topPace) / span) * plotH;

    const mapped = rawSamples.map((s) => ({
      x: xOf(s.km),
      y: yOf(s.paceSec),
    }));

    const ticksY = [0, 0.33, 0.66, 1].map((f) => {
      const sec = Math.round(topPace + span * f);
      return { y: yOf(sec), label: formatCorosPace(sec) };
    });

    const ticksX = [0, 1 / 3, 2 / 3, 1].map((f) => ({
      x: padL + plotW * f,
      label: f === 0 ? "0" : `${(safeDistKm * f).toFixed(1)}`,
    }));

    return {
      fastestKmSec: fastest,
      slowestKmSec: slowest,
      chartPoints: { mapped, w, h, padL, padR, padT, padB, plotH },
      yTicks: ticksY,
      xTicks: ticksX,
    };
  }, [clampedPace, roadSplitPct, safeDistKm]);

  const linePath = chartPoints.mapped
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    `${linePath} L ${chartPoints.mapped[chartPoints.mapped.length - 1].x.toFixed(1)} ${(
      chartPoints.padT + chartPoints.plotH
    ).toFixed(1)} L ${chartPoints.mapped[0].x.toFixed(1)} ${(
      chartPoints.padT + chartPoints.plotH
    ).toFixed(1)} Z`;

  const splitBadgeText =
    roadSplitPct > 1
      ? `Positive Split (+${roadSplitPct}%)`
      : roadSplitPct < -1
        ? `Negative Split (${roadSplitPct}%)`
        : "Even Pace (0%)";

  return (
    <div className="space-y-3">
      {/* Top Hero: Target Time | Average Pace + Reset */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[#525C56]">
          Target Time | Average Pace
        </span>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-[#E2E5E2] bg-[#F5F5F3] px-2.5 text-[11px] font-semibold text-[#161E19] hover:bg-[#ECEFED]"
        >
          <IconUndo size={12} />
          Reset
        </button>
      </div>

      <div className="flex items-baseline gap-3">
        <span className="font-num text-2xl font-extrabold tracking-tight text-[#161E19]">
          {formatClockHMS(totalElapsedSec)}
        </span>
        <span className="h-5 w-px bg-[#D4DAD6]" aria-hidden="true" />
        <span className="font-num text-xl font-bold text-[#1E6B3A]">
          {formatCorosPace(clampedPace)}
          <span className="ml-0.5 text-xs font-semibold text-[#525C56]">/km</span>
        </span>
      </div>

      {/* Full-width Effort / Target Pace Slider */}
      <div className="w-full">
        <label htmlFor="road-coros-effort-slider" className="sr-only">
          Geser untuk mengatur target waktu dan pace rata-rata
        </label>
        <input
          id="road-coros-effort-slider"
          type="range"
          min={MIN_PACE_SEC}
          max={MAX_PACE_SEC}
          step={5}
          value={effortSliderValue}
          onChange={(e) => {
            const val = Number(e.target.value);
            const nextPace = MAX_PACE_SEC + MIN_PACE_SEC - val;
            onChangePaceSec(nextPace);
          }}
          className="block h-2.5 w-full accent-[#1E6B3A]"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] font-medium text-[#525C56]">
          <span>Ringan ({formatPace(MAX_PACE_SEC)} /km)</span>
          <span>Challenging ({formatPace(MIN_PACE_SEC)} /km)</span>
        </div>
      </div>

      {/* Pace Strategy Section */}
      <div className="border-t border-[#E2E5E2] pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[#161E19]">Pace Strategy</span>
          <span className="font-num rounded-full bg-[#EAF6F0] px-2.5 py-0.5 text-[10px] font-bold text-[#146342]">
            {splitBadgeText}
          </span>
        </div>

        {/* Fastest 1km | Slowest 1km Highlight Box */}
        <div className="mt-2 grid grid-cols-2 divide-x divide-[#E2E5E2] rounded-xl border border-[#E2E5E2] bg-[#F5F5F3] py-2.5 text-center">
          <div>
            <p className="font-num text-base font-extrabold text-[#161E19]">
              {formatCorosPace(fastestKmSec)}
              <span className="ml-0.5 text-[11px] font-medium text-[#525C56]">/km</span>
            </p>
            <p className="mt-0.5 text-[11px] text-[#525C56]">Fastest 1km</p>
          </div>
          <div>
            <p className="font-num text-base font-extrabold text-[#161E19]">
              {formatCorosPace(slowestKmSec)}
              <span className="ml-0.5 text-[11px] font-medium text-[#525C56]">/km</span>
            </p>
            <p className="mt-0.5 text-[11px] text-[#525C56]">Slowest 1km</p>
          </div>
        </div>

        {/* Live SVG Pace Strategy Chart (Faster at top, Slower at bottom) */}
        <div className="mt-2.5 rounded-xl border border-[#E2E5E2] bg-white p-2">
          <svg
            viewBox={`0 0 ${chartPoints.w} ${chartPoints.h}`}
            className="block h-auto w-full select-none"
            role="img"
            aria-label="Grafik strategi pace terhadap jarak"
          >
            <defs>
              <linearGradient id="roadPaceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1E6B3A" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#1E6B3A" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {yTicks.map((tick, idx) => (
              <g key={idx}>
                <line
                  x1={chartPoints.padL}
                  x2={chartPoints.w - chartPoints.padR}
                  y1={tick.y}
                  y2={tick.y}
                  stroke="#ECEFED"
                  strokeWidth="1"
                />
                <text
                  x={chartPoints.padL - 6}
                  y={tick.y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="#525C56"
                  className="font-num"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            <path d={areaPath} fill="url(#roadPaceFill)" />
            <path
              d={linePath}
              fill="none"
              stroke="#1E6B3A"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {xTicks.map((tick, idx) => (
              <text
                key={idx}
                x={tick.x}
                y={chartPoints.h - 5}
                textAnchor={idx === 0 ? "start" : idx === xTicks.length - 1 ? "end" : "middle"}
                fontSize="9"
                fill="#525C56"
                className="font-num"
              >
                {tick.label}
                {idx === xTicks.length - 1 ? " km" : ""}
              </text>
            ))}
          </svg>
        </div>

        {/* Full-width Split Slider: Left = Positive Split, Center = Even, Right = Negative Split */}
        <div className="mt-2.5 w-full">
          <label htmlFor="road-coros-split-slider" className="sr-only">
            Geser untuk mengatur strategi Positive Split, Even Pace, atau Negative Split
          </label>
          <input
            id="road-coros-split-slider"
            type="range"
            min={-10}
            max={10}
            step={1}
            value={corosSplitSliderValue}
            onChange={(e) => {
              const sliderVal = Number(e.target.value);
              onChangeSplitPct(-sliderVal);
            }}
            className="block h-2.5 w-full accent-[#1E6B3A]"
          />
          <div className="mt-1 grid grid-cols-3 text-[10px] leading-tight text-[#525C56]">
            <div className="text-left">
              <p className="font-semibold text-[#161E19]">Positive Split</p>
              <p>mulai cepat, finis santai</p>
            </div>
            <div className="text-center">
              <p className="font-semibold text-[#161E19]">Even Pace</p>
              <p>rata stabil</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-[#161E19]">Negative Split</p>
              <p>mulai santai, finis cepat</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
