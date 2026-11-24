"use client";

import { useState } from "react";
import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconPrint,
  IconSliders,
} from "@/components/Icons";
import { formatDuration, formatPace } from "@/lib/race-engine/pacing";
import type {
  GutTolerance,
  RaceSimulationSummary,
  RunnerProfile,
  SegmentSimulation,
  SweatSodiumCategory,
} from "@/lib/race-engine/types";

interface Step3StrategyTabProps {
  profile: RunnerProfile;
  simulation: RaceSimulationSummary;
  onUpdateProfile: (patch: Partial<RunnerProfile>) => void;
  onFocusSegment: (segIdx: number) => void;
  onOpenPrintModal: () => void;
  onCopyWhatsApp: () => void;
  copiedWa: boolean;
}

function cutoffBadge(seg: SegmentSimulation) {
  if (seg.cutoffStatus === "none" || seg.cutoffBufferSec === undefined) {
    return null;
  }
  const absMins = Math.abs(Math.round(seg.cutoffBufferSec / 60));
  const hrs = Math.floor(absMins / 60);
  const mins = absMins % 60;
  const deltaText = hrs > 0 ? `${hrs}j ${mins}m` : `${mins}m`;

  if (seg.cutoffStatus === "missed") {
    return (
      <span className="font-num inline-flex items-center rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-bold text-[#991B1B]">
        Lewat COT (-{deltaText})
      </span>
    );
  }
  if (seg.cutoffStatus === "tight") {
    return (
      <span className="font-num inline-flex items-center rounded-full bg-[#FDF3E3] px-2 py-0.5 text-[10px] font-bold text-[#8A4B00]">
        COT Ketat (+{deltaText})
      </span>
    );
  }
  return (
    <span className="font-num inline-flex items-center rounded-full bg-[#EAF6F0] px-2 py-0.5 text-[10px] font-bold text-[#146342]">
      Aman (+{deltaText})
    </span>
  );
}

export function Step3StrategyTab({
  profile,
  simulation,
  onUpdateProfile,
  onFocusSegment,
  onOpenPrintModal,
  onCopyWhatsApp,
  copiedWa,
}: Step3StrategyTabProps) {
  const [showTuner, setShowTuner] = useState(false);

  const flatPaceMin = Math.floor(profile.flatThresholdPaceSecPerKm / 60);
  const flatPaceSec = Math.round(profile.flatThresholdPaceSecPerKm % 60);

  const finalBannerClasses =
    simulation.finalCutoffStatus === "missed"
      ? "border-[#FECACA] bg-[#FEE2E2] text-[#991B1B]"
      : simulation.finalCutoffStatus === "tight"
        ? "border-[#FDE68A] bg-[#FDF3E3] text-[#8A4B00]"
        : "border-[#CBEAD9] bg-[#EAF6F0] text-[#146342]";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
        {/* Projected Finish & COT Banner */}
        <div className={`rounded-xl border p-3 ${finalBannerClasses}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide">
                Proyeksi Finis
              </p>
              <p className="font-num mt-0.5 text-lg font-bold">
                {simulation.finishClockTime} ({formatDuration(simulation.totalElapsedSec)})
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium">Avg Pace / GAP</p>
              <p className="font-num mt-0.5 text-xs font-bold">
                {formatPace(simulation.avgPaceSecPerKm)} / {formatPace(simulation.avgGapSecPerKm)} /km
              </p>
            </div>
          </div>

          {simulation.finalCutoffBufferSec !== undefined && (
            <p className="font-num mt-1.5 text-xs font-semibold">
              {simulation.finalCutoffBufferSec >= 0
                ? `Margin COT akhir: +${formatDuration(simulation.finalCutoffBufferSec)} lebih cepat dari batas waktu.`
                : `Peringatan: melewati COT akhir sebesar ${formatDuration(
                    Math.abs(simulation.finalCutoffBufferSec)
                  )}.`}
            </p>
          )}
        </div>

        {/* Total Nutrition + Physiological Guardrails */}
        <div className="rounded-xl border border-[#E2E5E2] bg-[#F5F5F3] p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#161E19]">
              Total Fueling & Cek Fisiologi
            </h2>
            <button
              type="button"
              onClick={() => setShowTuner((v) => !v)}
              aria-expanded={showTuner}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-[#8C948E] bg-white px-2.5 text-[11px] font-semibold text-[#161E19] hover:bg-[#ECEFED]"
            >
              <IconSliders size={13} />
              Ubah profil
              <IconChevronDown
                size={13}
                className={`transition-transform ${showTuner ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-[#E2E5E2] bg-white p-2.5 text-center">
            <div>
              <p className="text-[10px] text-[#525C56]">Karbohidrat</p>
              <p className="font-num mt-0.5 text-sm font-bold text-[#161E19]">
                {simulation.totalCarbsG} g
              </p>
              <p className="font-num text-[10px] text-[#525C56]">
                {simulation.safety.carbRateGPerHr} g/jam
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#525C56]">Cairan</p>
              <p className="font-num mt-0.5 text-sm font-bold text-[#161E19]">
                {(simulation.totalFluidMl / 1000).toFixed(1)} L
              </p>
              <p className="font-num text-[10px] text-[#525C56]">
                {simulation.safety.fluidRateMlPerHr} mL/jam
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#525C56]">Natrium</p>
              <p className="font-num mt-0.5 text-sm font-bold text-[#161E19]">
                {(simulation.totalSodiumMg / 1000).toFixed(1)} g
              </p>
              <p className="font-num text-[10px] text-[#525C56]">
                {simulation.totalCaffeineMg > 0
                  ? `Kafein ${simulation.totalCaffeineMg} mg`
                  : "Tanpa kafein"}
              </p>
            </div>
          </div>

          {/* Physiological Safety Chips */}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold ${
                simulation.safety.gastricCapOk
                  ? "bg-[#EAF6F0] text-[#146342]"
                  : "bg-[#FEE2E2] text-[#991B1B]"
              }`}
            >
              {simulation.safety.gastricCapOk ? (
                <IconCheck size={12} />
              ) : (
                <IconAlert size={12} />
              )}
              Batas lambung &lt;= 1000 mL/jam
            </span>

            <span
              className={`font-num inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold ${
                simulation.safety.dehydrationOk
                  ? "bg-[#EAF6F0] text-[#146342]"
                  : "bg-[#FDF3E3] text-[#8A4B00]"
              }`}
            >
              Dehidrasi ~{simulation.safety.dehydrationPct}% (batas{" "}
              {simulation.safety.dehydrationThresholdPct}%)
            </span>

            {simulation.safety.dualTransporterRecommended && (
              <span className="inline-flex items-center rounded-md bg-white px-2 py-1 font-medium text-[#161E19] ring-1 ring-[#E2E5E2]">
                Gunakan rasio glukosa:fruktosa 2:1 / 1:0.8
              </span>
            )}

            {simulation.safety.bonkRisk !== "low" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#FDF3E3] px-2 py-1 font-semibold text-[#8A4B00]">
                <IconAlert size={12} />
                Risiko bonk: {simulation.safety.bonkRisk === "high" ? "tinggi" : "sedang"}
              </span>
            )}
          </div>

          {/* Inline Collapsible Pacing & Fueling Tuner */}
          {showTuner && (
            <div className="mt-3 space-y-2.5 border-t border-[#E2E5E2] pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="tuner-pace-min"
                    className="block text-[11px] font-semibold text-[#161E19]"
                  >
                    Pace datar (menit:detik/km)
                  </label>
                  <div className="mt-1 flex items-center gap-1">
                    <input
                      id="tuner-pace-min"
                      type="number"
                      min={3}
                      max={10}
                      value={flatPaceMin}
                      onChange={(e) => {
                        const m = Math.max(3, Math.min(10, Number(e.target.value) || 5));
                        onUpdateProfile({ flatThresholdPaceSecPerKm: m * 60 + flatPaceSec });
                      }}
                      className="font-num min-h-[36px] w-full rounded-md border border-[#8C948E] bg-white px-2 text-xs text-[#161E19]"
                    />
                    <span className="font-bold text-[#525C56]">:</span>
                    <input
                      aria-label="Detik pace datar"
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      value={flatPaceSec}
                      onChange={(e) => {
                        const s = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                        onUpdateProfile({ flatThresholdPaceSecPerKm: flatPaceMin * 60 + s });
                      }}
                      className="font-num min-h-[36px] w-full rounded-md border border-[#8C948E] bg-white px-2 text-xs text-[#161E19]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="tuner-effort"
                    className="block text-[11px] font-semibold text-[#161E19]"
                  >
                    Target effort ({profile.targetEffortPct}%)
                  </label>
                  <input
                    id="tuner-effort"
                    type="range"
                    min={65}
                    max={98}
                    value={profile.targetEffortPct}
                    onChange={(e) =>
                      onUpdateProfile({ targetEffortPct: Number(e.target.value) })
                    }
                    className="mt-3 h-2 w-full accent-[#1E6B3A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="tuner-gut"
                    className="block text-[11px] font-semibold text-[#161E19]"
                  >
                    Toleransi lambung
                  </label>
                  <select
                    id="tuner-gut"
                    value={profile.gutTolerance}
                    onChange={(e) =>
                      onUpdateProfile({ gutTolerance: e.target.value as GutTolerance })
                    }
                    className="mt-1 min-h-[36px] w-full rounded-md border border-[#8C948E] bg-white px-2 text-xs text-[#161E19]"
                  >
                    <option value="beginner">Pemula (40-50 g/jam)</option>
                    <option value="moderate">Moderat (60-70 g/jam)</option>
                    <option value="trained">Terlatih (75-90 g/jam)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="tuner-sodium"
                    className="block text-[11px] font-semibold text-[#161E19]"
                  >
                    Kadar garam keringat
                  </label>
                  <select
                    id="tuner-sodium"
                    value={profile.sweatSodiumCategory}
                    onChange={(e) =>
                      onUpdateProfile({
                        sweatSodiumCategory: e.target.value as SweatSodiumCategory,
                      })
                    }
                    className="mt-1 min-h-[36px] w-full rounded-md border border-[#8C948E] bg-white px-2 text-xs text-[#161E19]"
                  >
                    <option value="low">Rendah (~500 mg/L)</option>
                    <option value="moderate">Sedang (~800 mg/L)</option>
                    <option value="high">Tinggi / Salty (~1150 mg/L)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="tuner-sweat"
                    className="block text-[11px] font-semibold text-[#161E19]"
                  >
                    Laju keringat ({profile.sweatRateLPerHr.toFixed(1)} L/jam)
                  </label>
                  <input
                    id="tuner-sweat"
                    type="range"
                    min={0.4}
                    max={1.6}
                    step={0.1}
                    value={profile.sweatRateLPerHr}
                    onChange={(e) =>
                      onUpdateProfile({ sweatRateLPerHr: Number(e.target.value) })
                    }
                    className="mt-2 h-2 w-full accent-[#1E6B3A]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="tuner-powerhike"
                    className="block text-[11px] font-semibold text-[#161E19]"
                  >
                    Batas power-hike ({profile.powerHikeGradePct}%)
                  </label>
                  <input
                    id="tuner-powerhike"
                    type="range"
                    min={8}
                    max={22}
                    step={1}
                    value={profile.powerHikeGradePct}
                    onChange={(e) =>
                      onUpdateProfile({ powerHikeGradePct: Number(e.target.value) })
                    }
                    className="mt-2 h-2 w-full accent-[#1E6B3A]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[#161E19]">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={profile.fatigueDriftEnabled}
                    onChange={(e) =>
                      onUpdateProfile({ fatigueDriftEnabled: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#1E6B3A]"
                  />
                  Model fatigue drift (&gt;3 jam)
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={profile.caffeineStrategy}
                    onChange={(e) =>
                      onUpdateProfile({ caffeineStrategy: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#1E6B3A]"
                  />
                  Strategi kafein paruh akhir
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Unified Per-Segment Pacing + Fueling Cards */}
        <section aria-labelledby="heading-strategy-segments" className="space-y-2.5">
          <h2
            id="heading-strategy-segments"
            className="text-xs font-bold uppercase tracking-wide text-[#161E19]"
          >
            Rencana Per Segmen ({simulation.segments.length})
          </h2>

          {simulation.segments.map((seg) => (
            <article
              key={seg.index}
              className="rounded-xl border border-[#E2E5E2] bg-white p-3.5"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onFocusSegment(seg.index)}
                  className="text-left text-xs font-bold text-[#161E19] hover:text-[#1E6B3A]"
                >
                  S{seg.index + 1}: {seg.fromCp.name} -&gt; {seg.toCp.name}
                </button>
                {cutoffBadge(seg)}
              </div>

              {/* Arrival & Timing strip */}
              <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-lg bg-[#F5F5F3] p-2 text-center">
                <div>
                  <p className="text-[10px] text-[#525C56]">Target Tiba</p>
                  <p className="font-num text-xs font-bold text-[#161E19]">
                    {seg.arrivalClockTime.slice(0, 5)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#525C56]">Durasi / Stop</p>
                  <p className="font-num text-xs font-bold text-[#161E19]">
                    {formatDuration(seg.estimatedMovingSec)}
                    {seg.stopSec > 0 ? ` +${Math.round(seg.stopSec / 60)}m` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#525C56]">Pace / GAP</p>
                  <p className="font-num text-xs font-bold text-[#161E19]">
                    {formatPace(seg.paceSecPerKm)} / {formatPace(seg.gapSecPerKm)}
                  </p>
                </div>
              </div>

              {/* Pacing & Terrain guidance */}
              <p className="mt-2 text-xs text-[#161E19]">
                <span className="font-semibold">Pacing:</span> {seg.pacingNote}.
              </p>

              {/* Fueling Breakdown Box */}
              <div className="mt-2 rounded-lg border border-[#E2E5E2] bg-[#FAFAF8] p-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-[#161E19]">Target Fueling Segmen</span>
                  <span className="font-num text-[#525C56]">
                    Beban bawaan ~{seg.carryWeightKg.toFixed(1)} kg
                  </span>
                </div>
                <div className="font-num mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#161E19]">
                  <span>Karbo: {seg.carbsG} g</span>
                  <span>Cairan: {seg.fluidMl} mL</span>
                  <span>Natrium: {seg.sodiumMg} mg</span>
                  {seg.caffeineMg > 0 && (
                    <span className="text-[#8A4B00]">Kafein: {seg.caffeineMg} mg</span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-[#525C56]">
                  Bawaan praktis: <strong className="text-[#161E19]">{seg.packSummary}</strong>
                </p>
              </div>
            </article>
          ))}
        </section>
      </div>

      {/* Bottom CTA Bar */}
      <div className="flex items-center gap-2 border-t border-[#E2E5E2] bg-white px-5 py-3.5">
        <button
          type="button"
          onClick={onOpenPrintModal}
          className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1B2B22] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#161E19]"
        >
          <IconPrint size={16} />
          Print CP Card / Wristband
        </button>
        <button
          type="button"
          onClick={onCopyWhatsApp}
          className={`inline-flex min-h-[46px] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
            copiedWa
              ? "border-[#146342] bg-[#EAF6F0] text-[#146342]"
              : "border-[#8C948E] bg-white text-[#161E19] hover:bg-[#F5F5F3]"
          }`}
        >
          {copiedWa ? <IconCheck size={15} /> : <IconCopy size={15} />}
          {copiedWa ? "Tersalin" : "Copy WA"}
        </button>
      </div>
    </div>
  );
}
