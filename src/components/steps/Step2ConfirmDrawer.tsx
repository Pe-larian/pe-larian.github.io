"use client";

import { useState } from "react";
import { ElevationProfileChart } from "@/components/chart/ElevationProfileChart";
import {
  IconAlert,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconDownload,
  IconMountain,
  IconPin,
  IconPlus,
  IconTrash,
  IconUndo,
} from "@/components/Icons";
import { TERRAIN_LABELS } from "@/lib/race-engine/pacing";
import type {
  Checkpoint,
  GpxCleaningStats,
  RaceMetadata,
  TerrainCategory,
  TrackPoint,
} from "@/lib/race-engine/types";

interface Step2ConfirmDrawerProps {
  metadata: RaceMetadata;
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  cleaningStats: GpxCleaningStats;
  totalDistanceKm: number;
  totalGainM: number;
  totalLossM: number;
  hoveredPointIndex: number | null;
  onHoverPointIndex: (idx: number | null) => void;
  onFocusSegment: (segIdx: number) => void;
  onUpdateRaceName: (name: string) => void;
  onUpdateCheckpoint: (id: string, patch: Partial<Checkpoint>) => void;
  onDeleteCheckpoint: (id: string) => void;
  onAddCheckpointMidpoint: () => void;
  addCpMode: boolean;
  onToggleAddCpMode: () => void;
  onCleanSpikes: () => void;
  onSmoothChange: (windowSize: number) => void;
  onCalibrateDem: () => void;
  demLoading: boolean;
  demMessage: { type: "ok" | "error"; text: string } | null;
  canUndo: boolean;
  onUndo: () => void;
  onExportGpx: () => void;
  onBackStep: () => void;
  onGenerateStrategy: () => void;
}

const TERRAIN_OPTIONS: TerrainCategory[] = [
  "road",
  "gravel",
  "singletrack",
  "climb",
  "technical",
  "scree",
  "descent",
];

function computeSegmentStats(points: TrackPoint[], fromCp: Checkpoint, toCp: Checkpoint) {
  const startIdx = Math.min(fromCp.pointIndex, toCp.pointIndex);
  const endIdx = Math.max(fromCp.pointIndex, toCp.pointIndex);
  let gain = 0;
  let loss = 0;
  for (let i = startIdx + 1; i <= endIdx && i < points.length; i++) {
    const d = points[i].ele - points[i - 1].ele;
    if (d > 0) gain += d;
    else loss += Math.abs(d);
  }
  const distKm = Math.max(0.1, (toCp.distM - fromCp.distM) / 1000);
  const avgGrade = ((toCp.ele - fromCp.ele) / Math.max(10, toCp.distM - fromCp.distM)) * 100;
  return {
    distKm,
    gainM: Math.round(gain),
    lossM: Math.round(loss),
    avgGradePct: avgGrade,
  };
}

export function Step2ConfirmDrawer({
  metadata,
  points,
  checkpoints,
  cleaningStats,
  totalDistanceKm,
  totalGainM,
  totalLossM,
  hoveredPointIndex,
  onHoverPointIndex,
  onFocusSegment,
  onUpdateRaceName,
  onUpdateCheckpoint,
  onDeleteCheckpoint,
  onAddCheckpointMidpoint,
  addCpMode,
  onToggleAddCpMode,
  onCleanSpikes,
  onSmoothChange,
  onCalibrateDem,
  demLoading,
  demMessage,
  canUndo,
  onUndo,
  onExportGpx,
  onBackStep,
  onGenerateStrategy,
}: Step2ConfirmDrawerProps) {
  const [subTab, setSubTab] = useState<"segments" | "checkpoints">("segments");
  const segmentCount = Math.max(0, checkpoints.length - 1);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
        {/* Editable Route Title */}
        <div>
          <label htmlFor="confirm-race-title" className="sr-only">
            Judul rute race
          </label>
          <input
            id="confirm-race-title"
            type="text"
            value={metadata.raceName}
            onChange={(e) => onUpdateRaceName(e.target.value)}
            className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-base font-bold text-[#161E19] hover:border-[#E2E5E2] focus:border-[#1E6B3A] focus:bg-white"
          />
          <p className="px-1 text-[11px] text-[#525C56]">
            Konfirmasi segmen, titik checkpoint, dan kualitas elevasi GPX sebelum simulasi.
          </p>
        </div>

        {/* 4-stat inline row */}
        <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-[#E2E5E2] bg-[#F5F5F3] p-2.5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#525C56]">
              Jarak
            </p>
            <p className="font-num mt-0.5 text-sm font-bold text-[#161E19]">
              {totalDistanceKm.toFixed(1)} km
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#525C56]">
              Gain
            </p>
            <p className="font-num mt-0.5 text-sm font-bold text-[#146342]">
              +{totalGainM} m
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#525C56]">
              Loss
            </p>
            <p className="font-num mt-0.5 text-sm font-bold text-[#161E19]">
              -{totalLossM} m
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#525C56]">
              Segmen
            </p>
            <p className="font-num mt-0.5 text-sm font-bold text-[#161E19]">
              {segmentCount}
            </p>
          </div>
        </div>

        {/* Compact elevation sparkline */}
        <ElevationProfileChart
          points={points}
          checkpoints={checkpoints}
          compact
          hoveredPointIndex={hoveredPointIndex}
          onHoverPointIndex={onHoverPointIndex}
        />

        {/* GPX Cleaning & DEM Quick Controls */}
        <div className="rounded-xl border border-[#E2E5E2] bg-[#F5F5F3] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#161E19]">
              Perbaikan GPX & Elevasi
            </span>
            <span className="font-num text-[11px] text-[#525C56]">
              Gain awal +{cleaningStats.rawGainM} m
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={onCleanSpikes}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#8C948E] bg-white px-2.5 text-xs font-semibold text-[#161E19] hover:bg-[#ECEFED]"
            >
              Rapikan spike
              {cleaningStats.spikesDetected > 0 && (
                <span className="font-num rounded bg-[#FDF3E3] px-1.5 py-0.5 text-[10px] font-bold text-[#8A4B00]">
                  {cleaningStats.spikesDetected}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onCalibrateDem}
              disabled={demLoading}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#8C948E] bg-white px-2.5 text-xs font-semibold text-[#161E19] hover:bg-[#ECEFED] disabled:opacity-50"
            >
              <IconMountain size={14} />
              {demLoading ? "Kalibrasi..." : "Kalibrasi DEM"}
            </button>

            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Batalkan perubahan terakhir"
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E2E5E2] bg-white px-2.5 text-xs font-semibold text-[#161E19] hover:bg-[#ECEFED] disabled:opacity-40"
            >
              <IconUndo size={14} />
              Undo
            </button>

            <button
              type="button"
              onClick={onExportGpx}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#E2E5E2] bg-white px-2.5 text-xs font-semibold text-[#161E19] hover:bg-[#ECEFED] lg:hidden"
            >
              <IconDownload size={14} />
              Export .gpx
            </button>
          </div>

          <div className="mt-2.5 flex items-center gap-2.5">
            <label
              htmlFor="gpx-smooth-slider"
              className="shrink-0 text-[11px] font-medium text-[#525C56]"
            >
              Haluskan elevasi
            </label>
            <input
              id="gpx-smooth-slider"
              type="range"
              min={1}
              max={9}
              step={2}
              value={cleaningStats.smoothingWindow}
              onChange={(e) => onSmoothChange(Number(e.target.value))}
              className="h-2 flex-1 accent-[#1E6B3A]"
            />
            <span className="font-num w-10 text-right text-[11px] font-semibold text-[#161E19]">
              {cleaningStats.smoothingWindow === 1
                ? "Asli"
                : `${cleaningStats.smoothingWindow}pt`}
            </span>
          </div>

          {demMessage && (
            <div
              role="status"
              className={`mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] ${
                demMessage.type === "ok"
                  ? "bg-[#EAF6F0] text-[#146342]"
                  : "bg-[#FEE2E2] text-[#991B1B]"
              }`}
            >
              {demMessage.type === "ok" ? (
                <IconCheck size={13} className="mt-0.5 shrink-0" />
              ) : (
                <IconAlert size={13} className="mt-0.5 shrink-0" />
              )}
              <span>{demMessage.text}</span>
            </div>
          )}
        </div>

        {/* Sub-tabs: Segmen | Checkpoints */}
        <div
          className="grid grid-cols-2 rounded-lg border border-[#E2E5E2] bg-[#F5F5F3] p-1"
          role="tablist"
          aria-label="Mode edit rute"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "segments"}
            onClick={() => setSubTab("segments")}
            className={`min-h-[36px] rounded-md text-xs font-semibold transition-colors ${
              subTab === "segments"
                ? "bg-white text-[#161E19] shadow-xs"
                : "text-[#525C56] hover:text-[#161E19]"
            }`}
          >
            Segmen ({segmentCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "checkpoints"}
            onClick={() => setSubTab("checkpoints")}
            className={`min-h-[36px] rounded-md text-xs font-semibold transition-colors ${
              subTab === "checkpoints"
                ? "bg-white text-[#161E19] shadow-xs"
                : "text-[#525C56] hover:text-[#161E19]"
            }`}
          >
            Checkpoints ({checkpoints.length})
          </button>
        </div>

        {/* Tab content */}
        {subTab === "segments" ? (
          <div className="space-y-2">
            {checkpoints.slice(0, -1).map((fromCp, idx) => {
              const toCp = checkpoints[idx + 1];
              const stats = computeSegmentStats(points, fromCp, toCp);
              return (
                <div
                  key={`${fromCp.id}-${toCp.id}`}
                  className="rounded-xl border border-[#E2E5E2] bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onFocusSegment(idx)}
                      className="text-left text-xs font-bold text-[#161E19] hover:text-[#1E6B3A]"
                    >
                      S{idx + 1}: {fromCp.name} -&gt; {toCp.name}
                    </button>
                    <span className="font-num shrink-0 text-xs font-semibold text-[#161E19]">
                      {stats.distKm.toFixed(1)} km
                    </span>
                  </div>

                  <div className="font-num mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#525C56]">
                    <span className="text-[#146342]">+{stats.gainM} m</span>
                    <span>-{stats.lossM} m</span>
                    <span>
                      Rata-rata {stats.avgGradePct >= 0 ? "+" : ""}
                      {stats.avgGradePct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <label
                      htmlFor={`terrain-${fromCp.id}`}
                      className="text-[11px] font-medium text-[#525C56]"
                    >
                      Karakter medan
                    </label>
                    <select
                      id={`terrain-${fromCp.id}`}
                      value={fromCp.terrainAfter}
                      onChange={(e) =>
                        onUpdateCheckpoint(fromCp.id, {
                          terrainAfter: e.target.value as TerrainCategory,
                        })
                      }
                      className="min-h-[34px] rounded-md border border-[#8C948E] bg-white px-2 text-xs font-medium text-[#161E19]"
                    >
                      {TERRAIN_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {TERRAIN_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={onAddCheckpointMidpoint}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#8C948E] bg-white px-3 text-xs font-semibold text-[#161E19] hover:bg-[#F5F5F3]"
              >
                <IconPlus size={14} />
                Tambah CP
              </button>
              <button
                type="button"
                onClick={onToggleAddCpMode}
                aria-pressed={addCpMode}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${
                  addCpMode
                    ? "border-[#1E6B3A] bg-[#1E6B3A] text-white"
                    : "border-[#8C948E] bg-white text-[#161E19] hover:bg-[#F5F5F3]"
                }`}
              >
                <IconPin size={14} />
                {addCpMode ? "Klik peta aktif" : "Klik di Peta"}
              </button>
            </div>

            {checkpoints.map((cp, idx) => {
              const isEndpoint = cp.type === "start" || cp.type === "finish";
              const stopMinutes = Math.round(cp.plannedStopSec / 60);
              const cutoffHours =
                cp.cutoffElapsedSec !== undefined
                  ? Number((cp.cutoffElapsedSec / 3600).toFixed(1))
                  : "";

              return (
                <div
                  key={cp.id}
                  className="rounded-xl border border-[#E2E5E2] bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="font-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F5F5F3] text-[11px] font-bold text-[#161E19]">
                        {cp.type === "start"
                          ? "S"
                          : cp.type === "finish"
                            ? "F"
                            : idx}
                      </span>
                      <input
                        type="text"
                        value={cp.name}
                        aria-label={`Nama checkpoint ${idx + 1}`}
                        onChange={(e) =>
                          onUpdateCheckpoint(cp.id, { name: e.target.value })
                        }
                        className="min-h-[34px] min-w-0 flex-1 rounded-md border border-[#E2E5E2] px-2 text-xs font-semibold text-[#161E19] focus:border-[#1E6B3A]"
                      />
                    </div>
                    {!isEndpoint && (
                      <button
                        type="button"
                        onClick={() => onDeleteCheckpoint(cp.id)}
                        aria-label={`Hapus ${cp.name}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#991B1B] hover:bg-[#FEE2E2]"
                      >
                        <IconTrash size={15} />
                      </button>
                    )}
                  </div>

                  <div className="font-num mt-1.5 flex items-center gap-3 text-[11px] text-[#525C56]">
                    <span>KM {(cp.distM / 1000).toFixed(1)}</span>
                    <span>{cp.ele} mdpl</span>
                  </div>

                  {cp.type !== "start" && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor={`stop-${cp.id}`}
                          className="block text-[10px] font-medium text-[#525C56]"
                        >
                          Stop aid (menit)
                        </label>
                        <input
                          id={`stop-${cp.id}`}
                          type="number"
                          min={0}
                          max={120}
                          disabled={cp.type === "finish"}
                          value={stopMinutes}
                          onChange={(e) => {
                            const mins = Math.max(0, Number(e.target.value) || 0);
                            onUpdateCheckpoint(cp.id, { plannedStopSec: mins * 60 });
                          }}
                          className="font-num mt-0.5 min-h-[34px] w-full rounded-md border border-[#8C948E] bg-white px-2 text-xs text-[#161E19] disabled:bg-[#F5F5F3]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`cot-${cp.id}`}
                          className="block text-[10px] font-medium text-[#525C56]"
                        >
                          COT (jam dr start)
                        </label>
                        <input
                          id={`cot-${cp.id}`}
                          type="number"
                          min={0}
                          step={0.5}
                          placeholder="Opsional"
                          value={cutoffHours}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              onUpdateCheckpoint(cp.id, { cutoffElapsedSec: undefined });
                            } else {
                              const hrs = Math.max(0.5, Number(raw) || 0);
                              onUpdateCheckpoint(cp.id, {
                                cutoffElapsedSec: Math.round(hrs * 3600),
                              });
                            }
                          }}
                          className="font-num mt-0.5 min-h-[34px] w-full rounded-md border border-[#8C948E] bg-white px-2 text-xs text-[#161E19]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="flex items-center gap-2 border-t border-[#E2E5E2] bg-white px-5 py-3.5">
        <button
          type="button"
          onClick={onBackStep}
          aria-label="Kembali ke Data & GPX"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#8C948E] bg-white text-[#161E19] hover:bg-[#F5F5F3]"
        >
          <IconArrowLeft size={18} />
        </button>
        <button
          type="button"
          onClick={onGenerateStrategy}
          className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#1B2B22] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#161E19]"
        >
          Generate Strategi Race
          <IconArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
