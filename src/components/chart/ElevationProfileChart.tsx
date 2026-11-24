"use client";

import { useMemo, useRef } from "react";
import type { Checkpoint, TrackPoint } from "@/lib/race-engine/types";

interface ElevationProfileChartProps {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  compact?: boolean;
  hoveredPointIndex: number | null;
  onHoverPointIndex?: (index: number | null) => void;
  slopeDistribution?: { flatPct: number; climbPct: number; steepPct: number };
  sunsetDistM?: number | null;
  sunsetClock?: string;
}

function gradeColor(gradePct: number): string {
  const abs = Math.abs(gradePct);
  if (abs >= 15) return "#B91C1C";
  if (abs >= 8) return "#D97706";
  return "#1E6B3A";
}

export function ElevationProfileChart({
  points,
  checkpoints,
  compact = false,
  hoveredPointIndex,
  onHoverPointIndex,
  slopeDistribution,
  sunsetDistM = null,
  sunsetClock,
}: ElevationProfileChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const chart = useMemo(() => {
    if (points.length < 2) return null;

    const width = 420;
    const height = compact ? 74 : 156;
    const padL = compact ? 6 : 36;
    const padR = compact ? 6 : 12;
    const padT = compact ? 8 : 20;
    const padB = compact ? 8 : 24;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const totalDistM = Math.max(1, points[points.length - 1].distFromStartM);
    let minEle = Infinity;
    let maxEle = -Infinity;
    let peakIdx = 0;

    for (let i = 0; i < points.length; i++) {
      const ele = points[i].ele;
      if (ele < minEle) minEle = ele;
      if (ele > maxEle) {
        maxEle = ele;
        peakIdx = i;
      }
    }

    const eleSpan = Math.max(40, maxEle - minEle);
    const eleMinPad = Math.max(0, minEle - eleSpan * 0.08);
    const eleMaxPad = maxEle + eleSpan * 0.1;
    const eleRange = Math.max(1, eleMaxPad - eleMinPad);

    const xOf = (distM: number) => padL + (distM / totalDistM) * plotW;
    const yOf = (ele: number) => padT + plotH - ((ele - eleMinPad) / eleRange) * plotH;

    // Downsample to at most 140 buckets for crisp SVG rendering
    const step = Math.max(1, Math.floor(points.length / 140));
    const sampled: Array<{ idx: number; x: number; y: number; pt: TrackPoint }> = [];
    for (let i = 0; i < points.length; i += step) {
      const pt = points[i];
      sampled.push({ idx: i, x: xOf(pt.distFromStartM), y: yOf(pt.ele), pt });
    }
    const lastPt = points[points.length - 1];
    if (sampled[sampled.length - 1]?.idx !== points.length - 1) {
      sampled.push({
        idx: points.length - 1,
        x: xOf(lastPt.distFromStartM),
        y: yOf(lastPt.ele),
        pt: lastPt,
      });
    }

    const areaPath =
      `M ${sampled[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} ` +
      sampled.map((s) => `L ${s.x.toFixed(1)} ${s.y.toFixed(1)}`).join(" ") +
      ` L ${sampled[sampled.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

    const segments = [];
    for (let i = 1; i < sampled.length; i++) {
      const prev = sampled[i - 1];
      const curr = sampled[i];
      segments.push({
        x1: prev.x,
        y1: prev.y,
        x2: curr.x,
        y2: curr.y,
        color: gradeColor(curr.pt.gradePct),
      });
    }

    const peak = points[peakIdx];
    const peakCoord = {
      x: xOf(peak.distFromStartM),
      y: yOf(peak.ele),
      ele: Math.round(peak.ele),
    };

    const yTicks = [Math.round(minEle), Math.round((minEle + maxEle) / 2), Math.round(maxEle)];
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      x: padL + plotW * f,
      label: `${((totalDistM * f) / 1000).toFixed(0)}k`,
    }));

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      totalDistM,
      xOf,
      yOf,
      areaPath,
      segments,
      peakCoord,
      yTicks,
      xTicks,
    };
  }, [points, compact]);

  if (!chart) {
    return (
      <div className="rounded-lg border border-[#E2E5E2] bg-[#F5F5F3] px-3 py-4 text-center text-xs text-[#525C56]">
        Profil elevasi akan muncul setelah rute GPX dimuat.
      </div>
    );
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onHoverPointIndex || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * chart.width;
    const ratio = Math.max(0, Math.min(1, (relX - chart.padL) / chart.plotW));
    const targetDist = ratio * chart.totalDistM;

    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(points[i].distFromStartM - targetDist);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    onHoverPointIndex(bestIdx);
  };

  const hoveredPt =
    hoveredPointIndex !== null && points[hoveredPointIndex] ? points[hoveredPointIndex] : null;
  const hoverX = hoveredPt ? chart.xOf(hoveredPt.distFromStartM) : null;
  const hoverY = hoveredPt ? chart.yOf(hoveredPt.ele) : null;

  const sunsetX =
    !compact && sunsetDistM !== null && sunsetDistM > 0 && sunsetDistM < chart.totalDistM
      ? chart.xOf(sunsetDistM)
      : null;

  return (
    <div className="w-full">
      <div className="relative rounded-lg border border-[#E2E5E2] bg-white p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="block h-auto w-full select-none"
          role="img"
          aria-label="Grafik profil elevasi dan kemiringan rute"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => onHoverPointIndex?.(null)}
        >
          <defs>
            <linearGradient id="eleFillGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1E6B3A" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#1E6B3A" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {!compact &&
            chart.yTicks.map((tickEle, i) => {
              const y = chart.yOf(tickEle);
              return (
                <g key={i}>
                  <line
                    x1={chart.padL}
                    x2={chart.width - chart.padR}
                    y1={y}
                    y2={y}
                    stroke="#ECEFED"
                    strokeWidth="1"
                  />
                  <text
                    x={chart.padL - 5}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="#525C56"
                    className="font-num"
                  >
                    {tickEle}m
                  </text>
                </g>
              );
            })}

          <path d={chart.areaPath} fill="url(#eleFillGrad)" />

          {chart.segments.map((seg, idx) => (
            <line
              key={idx}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke={seg.color}
              strokeWidth={compact ? 2 : 2.4}
              strokeLinecap="round"
            />
          ))}

          {sunsetX !== null && (
            <g>
              <line
                x1={sunsetX}
                x2={sunsetX}
                y1={chart.padT}
                y2={chart.padT + chart.plotH}
                stroke="#8A4B00"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
              <text
                x={Math.min(chart.width - 54, Math.max(chart.padL + 4, sunsetX + 4))}
                y={chart.padT + 10}
                fontSize="8.5"
                fontWeight="600"
                fill="#8A4B00"
              >
                Sunset {sunsetClock ? sunsetClock.slice(0, 5) : ""}
              </text>
            </g>
          )}

          {!compact &&
            checkpoints.slice(1, -1).map((cp) => {
              const cx = chart.xOf(cp.distM);
              const cy = chart.yOf(cp.ele);
              return (
                <g key={cp.id}>
                  <line
                    x1={cx}
                    x2={cx}
                    y1={cy}
                    y2={chart.padT + chart.plotH}
                    stroke="#D4DAD6"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <circle cx={cx} cy={cy} r="3" fill="#FFFFFF" stroke="#161E19" strokeWidth="1.5" />
                </g>
              );
            })}

          {!compact && (
            <g>
              <circle
                cx={chart.peakCoord.x}
                cy={chart.peakCoord.y}
                r="3.2"
                fill="#B91C1C"
                stroke="#FFFFFF"
                strokeWidth="1.2"
              />
              <text
                x={Math.min(chart.width - 42, Math.max(chart.padL + 4, chart.peakCoord.x))}
                y={Math.max(11, chart.peakCoord.y - 7)}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="#161E19"
                className="font-num"
              >
                {chart.peakCoord.ele}m
              </text>
            </g>
          )}

          {hoverX !== null && hoverY !== null && (
            <g>
              <line
                x1={hoverX}
                x2={hoverX}
                y1={chart.padT}
                y2={chart.padT + chart.plotH}
                stroke="#161E19"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle cx={hoverX} cy={hoverY} r="4" fill="#1E6B3A" stroke="#FFFFFF" strokeWidth="2" />
            </g>
          )}

          {!compact &&
            chart.xTicks.map((t, i) => (
              <text
                key={i}
                x={t.x}
                y={chart.height - 6}
                textAnchor={i === 0 ? "start" : i === chart.xTicks.length - 1 ? "end" : "middle"}
                fontSize="9"
                fill="#525C56"
                className="font-num"
              >
                {t.label}
              </text>
            ))}
        </svg>

        {hoveredPt && (
          <div className="mt-1.5 flex items-center justify-between border-t border-[#E2E5E2] pt-1.5 text-[11px] text-[#525C56]">
            <span className="font-num font-semibold text-[#161E19]">
              KM {(hoveredPt.distFromStartM / 1000).toFixed(1)}
            </span>
            <span className="font-num">Elevasi {Math.round(hoveredPt.ele)} m</span>
            <span
              className="font-num font-semibold"
              style={{ color: gradeColor(hoveredPt.gradePct) }}
            >
              {hoveredPt.gradePct >= 0 ? "+" : ""}
              {hoveredPt.gradePct.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {!compact && slopeDistribution && (
        <div className="mt-2.5">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#ECEFED]">
            <div
              style={{ width: `${slopeDistribution.flatPct}%` }}
              className="bg-[#1E6B3A]"
              title={`Datar (<5%): ${slopeDistribution.flatPct}%`}
            />
            <div
              style={{ width: `${slopeDistribution.climbPct}%` }}
              className="bg-[#D97706]"
              title={`Menanjak/Turun (5-15%): ${slopeDistribution.climbPct}%`}
            />
            <div
              style={{ width: `${slopeDistribution.steepPct}%` }}
              className="bg-[#B91C1C]"
              title={`Curam (>15%): ${slopeDistribution.steepPct}%`}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#525C56]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#1E6B3A]" />
              &lt;5% ({slopeDistribution.flatPct}%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#D97706]" />
              5-15% ({slopeDistribution.climbPct}%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#B91C1C]" />
              &gt;15% ({slopeDistribution.steepPct}%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
