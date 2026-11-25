"use client";

import { ElevationProfileChart } from "@/components/chart/ElevationProfileChart";
import {
  IconArrowLeft,
  IconArrowRight,
  IconPin,
  IconPlus,
  IconTrash,
} from "@/components/Icons";
import { TERRAIN_LABELS } from "@/lib/race-engine/pacing";
import type {
  Checkpoint,
  RaceMetadata,
  StrategyGroupingMode,
  TerrainCategory,
  TrackPoint,
} from "@/lib/race-engine/types";

interface Step2ConfirmDrawerProps {
  metadata: RaceMetadata;
  points: TrackPoint[];
  systemCheckpoints: Checkpoint[];
  customCheckpoints: Checkpoint[];
  strategyGrouping: StrategyGroupingMode;
  onChangeStrategyGrouping: (mode: StrategyGroupingMode) => void;
  totalDistanceKm: number;
  totalGainM: number;
  totalLossM: number;
  hoveredPointIndex: number | null;
  onHoverPointIndex: (idx: number | null) => void;
  onFocusSegment: (segIdx: number) => void;
  onUpdateRaceName: (name: string) => void;
  onUpdateSystemCheckpoint: (id: string, patch: Partial<Checkpoint>) => void;
  onUpdateCustomCheckpoint: (id: string, patch: Partial<Checkpoint>) => void;
  onDeleteCustomCheckpoint: (id: string) => void;
  onAddCheckpointMidpoint: () => void;
  addCpMode: boolean;
  onToggleAddCpMode: () => void;
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
  systemCheckpoints,
  customCheckpoints,
  strategyGrouping,
  onChangeStrategyGrouping,
  totalDistanceKm,
  totalGainM,
  totalLossM,
  hoveredPointIndex,
  onHoverPointIndex,
  onFocusSegment,
  onUpdateRaceName,
  onUpdateSystemCheckpoint,
  onUpdateCustomCheckpoint,
  onDeleteCustomCheckpoint,
  onAddCheckpointMidpoint,
  addCpMode,
  onToggleAddCpMode,
  onBackStep,
  onGenerateStrategy,
}: Step2ConfirmDrawerProps) {
  const activeList =
    strategyGrouping === "segments" ? systemCheckpoints : customCheckpoints;
  const segmentCount = Math.max(0, systemCheckpoints.length - 1);

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
            Konfirmasi segmen, titik checkpoint, dan profil rute GPX sebelum simulasi.
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
              {strategyGrouping === "segments" ? "Segmen" : "Titik CP"}
            </p>
            <p className="font-num mt-0.5 text-sm font-bold text-[#161E19]">
              {strategyGrouping === "segments" ? segmentCount : customCheckpoints.length}
            </p>
          </div>
        </div>

        {/* Compact elevation sparkline */}
        <ElevationProfileChart
          points={points}
          checkpoints={activeList}
          compact
          hoveredPointIndex={hoveredPointIndex}
          onHoverPointIndex={onHoverPointIndex}
        />

        {/* Strategy Grouping Basis Selector */}
        <div className="space-y-1.5">
          <div>
            <p className="text-xs font-bold text-[#161E19]">
              Pilih basis pembagian strategi:
            </p>
            <p className="text-[11px] text-[#525C56]">
              Segmen dibuat otomatis oleh sistem, sedangkan Checkpoints memakai titik CP yang Anda tentukan.
            </p>
          </div>

          <div
            className="grid grid-cols-2 rounded-xl border border-[#E2E5E2] bg-[#F5F5F3] p-1"
            role="tablist"
            aria-label="Basis pembagian strategi race"
          >
            <button
              type="button"
              role="tab"
              aria-selected={strategyGrouping === "segments"}
              onClick={() => onChangeStrategyGrouping("segments")}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                strategyGrouping === "segments"
                  ? "bg-[#1B2B22] text-white"
                  : "text-[#525C56] hover:text-[#161E19]"
              }`}
            >
              Segmen ({segmentCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={strategyGrouping === "checkpoints"}
              onClick={() => onChangeStrategyGrouping("checkpoints")}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                strategyGrouping === "checkpoints"
                  ? "bg-[#1B2B22] text-white"
                  : "text-[#525C56] hover:text-[#161E19]"
              }`}
            >
              Checkpoints ({customCheckpoints.length})
            </button>
          </div>
        </div>

        {/* Active Tab List */}
        {strategyGrouping === "segments" ? (
          <div className="space-y-2">
            {systemCheckpoints.slice(0, -1).map((fromCp, idx) => {
              const toCp = systemCheckpoints[idx + 1];
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
                        onUpdateSystemCheckpoint(fromCp.id, {
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

            {customCheckpoints.map((cp, idx) => {
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
                          onUpdateCustomCheckpoint(cp.id, { name: e.target.value })
                        }
                        className="min-h-[34px] min-w-0 flex-1 rounded-md border border-[#E2E5E2] px-2 text-xs font-semibold text-[#161E19] focus:border-[#1E6B3A]"
                      />
                    </div>
                    {!isEndpoint && (
                      <button
                        type="button"
                        onClick={() => onDeleteCustomCheckpoint(cp.id)}
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
                            onUpdateCustomCheckpoint(cp.id, { plannedStopSec: mins * 60 });
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
                              onUpdateCustomCheckpoint(cp.id, {
                                cutoffElapsedSec: undefined,
                              });
                            } else {
                              const hrs = Math.max(0.5, Number(raw) || 0);
                              onUpdateCustomCheckpoint(cp.id, {
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
