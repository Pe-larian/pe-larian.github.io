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
  RaceDiscipline,
  RaceSimulationSummary,
  RunnerProfile,
  SegmentSimulation,
  SweatSodiumCategory,
} from "@/lib/race-engine/types";

interface Step3StrategyTabProps {
  discipline: RaceDiscipline;
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

function splitLabelText(splitPct: number): string {
  if (splitPct <= -2) return `Negative Split (${splitPct}% · paruh akhir lebih cepat)`;
  if (splitPct >= 2) return `Positive Split (+${splitPct}% · paruh awal lebih cepat)`;
  return "Even Split (0% · pace rata stabil)";
}

export function Step3StrategyTab({
  discipline,
  profile,
  simulation,
  onUpdateProfile,
  onFocusSegment,
  onOpenPrintModal,
  onCopyWhatsApp,
  copiedWa,
}: Step3StrategyTabProps) {
  const [showAdvancedFuel, setShowAdvancedFuel] = useState(false);

  const distKm = Math.max(0.5, simulation.totalDistanceM / 1000);
  const stopSec = simulation.totalStopSec;

  // Road Target Pace & Time slider bounds
  const roadPaceSec = Math.max(
    180,
    Math.min(570, Math.round(simulation.avgPaceSecPerKm / 5) * 5)
  );
  const roadMinTimeSec = Math.round(distKm * 180 + stopSec);
  const roadMaxTimeSec = Math.round(distKm * 570 + stopSec);
  const currentTimeSec = Math.round(simulation.totalElapsedSec);

  // Trail Target Time slider bounds based on Naismith equivalent distance
  const trailMinTimeSec = Math.max(
    1800,
    Math.round(simulation.equivalentDistanceKm * 240 + stopSec)
  );
  const trailMaxTimeSec = Math.max(
    trailMinTimeSec + 3600,
    Math.round(simulation.equivalentDistanceKm * 720 + stopSec)
  );

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
        <div className={`rounded-xl border p-3.5 ${finalBannerClasses}`}>
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
              <p className="text-[11px] font-medium">
                {discipline === "road" ? "Target Pace" : "Rata-rata Pace / GAP"}
              </p>
              <p className="font-num mt-0.5 text-xs font-bold">
                {discipline === "road"
                  ? `${formatPace(simulation.avgPaceSecPerKm)} /km`
                  : `${formatPace(simulation.avgPaceSecPerKm)} / ${formatPace(
                      simulation.avgGapSecPerKm
                    )} /km`}
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

        {/* Full-Width Pacing Sliders (Road vs Trail) */}
        <section
          aria-labelledby="heading-pacing-sliders"
          className="space-y-3 rounded-xl border border-[#E2E5E2] bg-white p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="heading-pacing-sliders"
              className="text-xs font-bold uppercase tracking-wide text-[#161E19]"
            >
              {discipline === "road"
                ? "Atur Target Pace, Waktu & Split"
                : "Atur Target Waktu Finis Trail"}
            </h2>
            {profile.targetFinishTimeSec !== undefined && (
              <button
                type="button"
                onClick={() => onUpdateProfile({ targetFinishTimeSec: undefined })}
                className="text-[11px] font-semibold text-[#1E6B3A] hover:underline"
              >
                Reset otomatis
              </button>
            )}
          </div>

          {discipline === "road" ? (
            <div className="space-y-3">
              {/* Full-width Target Pace Slider */}
              <div className="w-full">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="road-pace-slider" className="font-semibold text-[#161E19]">
                    Target Pace Rata-rata
                  </label>
                  <span className="font-num font-bold text-[#1E6B3A]">
                    {formatPace(roadPaceSec)} /km
                  </span>
                </div>
                <input
                  id="road-pace-slider"
                  type="range"
                  min={180}
                  max={570}
                  step={5}
                  value={roadPaceSec}
                  onChange={(e) => {
                    const nextPace = Number(e.target.value);
                    const nextTotalSec = Math.round(distKm * nextPace + stopSec);
                    onUpdateProfile({
                      flatThresholdPaceSecPerKm: nextPace,
                      targetFinishTimeSec: nextTotalSec,
                    });
                  }}
                  className="mt-1.5 block h-2.5 w-full accent-[#1E6B3A]"
                />
                <div className="font-num mt-0.5 flex justify-between text-[10px] text-[#525C56]">
                  <span>3:00 /km</span>
                  <span>6:15 /km</span>
                  <span>9:30 /km</span>
                </div>
              </div>

              {/* Full-width Target Finish Time Slider */}
              <div className="w-full">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="road-time-slider" className="font-semibold text-[#161E19]">
                    Target Waktu Finis
                  </label>
                  <span className="font-num font-bold text-[#161E19]">
                    {formatDuration(currentTimeSec)}
                  </span>
                </div>
                <input
                  id="road-time-slider"
                  type="range"
                  min={roadMinTimeSec}
                  max={roadMaxTimeSec}
                  step={60}
                  value={Math.max(roadMinTimeSec, Math.min(roadMaxTimeSec, currentTimeSec))}
                  onChange={(e) => {
                    const nextTime = Number(e.target.value);
                    const nextPace = Math.max(
                      180,
                      Math.min(570, Math.round((nextTime - stopSec) / distKm))
                    );
                    onUpdateProfile({
                      targetFinishTimeSec: nextTime,
                      flatThresholdPaceSecPerKm: nextPace,
                    });
                  }}
                  className="mt-1.5 block h-2.5 w-full accent-[#1E6B3A]"
                />
                <div className="font-num mt-0.5 flex justify-between text-[10px] text-[#525C56]">
                  <span>{formatDuration(roadMinTimeSec)}</span>
                  <span>{formatDuration(roadMaxTimeSec)}</span>
                </div>
              </div>

              {/* Full-width Positive / Negative Split Slider */}
              <div className="w-full border-t border-[#E2E5E2] pt-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <label htmlFor="road-split-slider" className="font-semibold text-[#161E19]">
                    Strategi Split
                  </label>
                  <span className="font-num text-[11px] font-bold text-[#1E6B3A]">
                    {splitLabelText(profile.roadSplitPct)}
                  </span>
                </div>
                <input
                  id="road-split-slider"
                  type="range"
                  min={-10}
                  max={10}
                  step={1}
                  value={profile.roadSplitPct}
                  onChange={(e) =>
                    onUpdateProfile({ roadSplitPct: Number(e.target.value) })
                  }
                  className="mt-1.5 block h-2.5 w-full accent-[#1E6B3A]"
                />
                <div className="mt-0.5 flex justify-between text-[10px] text-[#525C56]">
                  <span>Negative (-10%)</span>
                  <span>Even (0%)</span>
                  <span>Positive (+10%)</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-lg bg-[#F5F5F3] px-3 py-2 text-xs">
                <span className="text-[#525C56]">Jarak Ekuivalen (Naismith)</span>
                <span className="font-num font-bold text-[#161E19]">
                  {simulation.equivalentDistanceKm} km-effort
                </span>
              </div>

              <div className="w-full">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="trail-time-slider" className="font-semibold text-[#161E19]">
                    Target Waktu Finis
                  </label>
                  <span className="font-num font-bold text-[#1E6B3A]">
                    {formatDuration(currentTimeSec)}
                  </span>
                </div>
                <input
                  id="trail-time-slider"
                  type="range"
                  min={trailMinTimeSec}
                  max={trailMaxTimeSec}
                  step={300}
                  value={Math.max(trailMinTimeSec, Math.min(trailMaxTimeSec, currentTimeSec))}
                  onChange={(e) =>
                    onUpdateProfile({ targetFinishTimeSec: Number(e.target.value) })
                  }
                  className="mt-1.5 block h-2.5 w-full accent-[#1E6B3A]"
                />
                <div className="font-num mt-0.5 flex justify-between text-[10px] text-[#525C56]">
                  <span>{formatDuration(trailMinTimeSec)}</span>
                  <span>{formatDuration(trailMaxTimeSec)}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Standard Fueling Summary + Pre-Race + 30-Min Schedule */}
        <section
          aria-labelledby="heading-fueling-summary"
          className="rounded-xl border border-[#E2E5E2] bg-[#F5F5F3] p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="heading-fueling-summary"
              className="text-xs font-bold uppercase tracking-wide text-[#161E19]"
            >
              Kebutuhan Nutrisi Standar
            </h2>
            <button
              type="button"
              onClick={() => setShowAdvancedFuel((v) => !v)}
              aria-expanded={showAdvancedFuel}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-[#8C948E] bg-white px-2.5 text-[11px] font-semibold text-[#161E19] hover:bg-[#ECEFED]"
            >
              <IconSliders size={13} />
              Sesuaikan
              <IconChevronDown
                size={13}
                className={`transition-transform ${showAdvancedFuel ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg border border-[#E2E5E2] bg-white p-2.5 text-center">
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
                {simulation.totalGelsCount} Gel (@22g)
              </p>
            </div>
          </div>

          {/* Actionable Pre-Race & 30-Min Schedule */}
          <div className="mt-2 space-y-1.5 rounded-lg border border-[#E2E5E2] bg-white p-2.5 text-xs text-[#161E19]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#525C56]">Makan Pra-Lari (2-3 jam sebelum start)</span>
              <span className="font-num font-bold">
                {simulation.preRaceCarbsMinG}-{simulation.preRaceCarbsMaxG} g karbo
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#525C56]">Jadwal Konsumsi</span>
              <span className="font-num font-bold">
                {simulation.totalFeedingSessions > 0
                  ? `Tiap ${simulation.feedingIntervalMin} mnt (${simulation.totalFeedingSessions} sesi · ~${simulation.carbsPerSessionG}g)`
                  : "Durasi <1 jam (cukup air)"}
              </span>
            </div>
            {simulation.trailSolidRatioActive && (
              <div className="flex items-center justify-between gap-2 border-t border-[#E2E5E2] pt-1.5">
                <span className="text-[#525C56]">Komposisi Trail (&gt;3 jam)</span>
                <span className="font-num font-semibold text-[#146342]">
                  60% Gel/Cair ({simulation.fastCarbTotalG}g) · 40% Real Food (
                  {simulation.solidFoodTotalG}g)
                </span>
              </div>
            )}
          </div>

          {/* Safety Guardrails */}
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
              Cairan aman &lt;= 1000 mL/jam
            </span>

            {simulation.safety.dualTransporterRecommended && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#FDF3E3] px-2 py-1 font-semibold text-[#8A4B00]">
                <IconAlert size={12} />
                Wajib rasio Glukosa : Fruktosa 2:1 / 1:0.8 (&gt;60 g/jam)
              </span>
            )}
          </div>

          {/* Optional Simple Profile Adjustments */}
          {showAdvancedFuel && (
            <div className="mt-3 space-y-2.5 border-t border-[#E2E5E2] pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="tuner-gut"
                    className="block text-[11px] font-semibold text-[#161E19]"
                  >
                    Toleransi perut
                  </label>
                  <select
                    id="tuner-gut"
                    value={profile.gutTolerance}
                    onChange={(e) =>
                      onUpdateProfile({ gutTolerance: e.target.value as GutTolerance })
                    }
                    className="mt-1 min-h-[38px] w-full rounded-md border border-[#8C948E] bg-white px-2 text-xs text-[#161E19]"
                  >
                    <option value="beginner">Pemula (ringan)</option>
                    <option value="moderate">Standar (umum)</option>
                    <option value="trained">Terlatih (tinggi)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="tuner-sodium"
                    className="block text-[11px] font-semibold text-[#161E19]"
                  >
                    Laju keringat & garam
                  </label>
                  <select
                    id="tuner-sodium"
                    value={profile.sweatSodiumCategory}
                    onChange={(e) =>
                      onUpdateProfile({
                        sweatSodiumCategory: e.target.value as SweatSodiumCategory,
                      })
                    }
                    className="mt-1 min-h-[38px] w-full rounded-md border border-[#8C948E] bg-white px-2 text-xs text-[#161E19]"
                  >
                    <option value="low">Rendah (500 mg/L)</option>
                    <option value="moderate">Sedang (750 mg/L)</option>
                    <option value="high">Tinggi / Asin (1000 mg/L)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[#161E19]">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={profile.caffeineStrategy}
                    onChange={(e) =>
                      onUpdateProfile({ caffeineStrategy: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#1E6B3A]"
                  />
                  Tambahkan kafein paruh akhir
                </label>
              </div>
            </div>
          )}
        </section>

        {/* Per-Segment Pacing + Fueling Cards */}
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
                  <p className="text-[10px] text-[#525C56]">
                    {discipline === "road" ? "Target Pace" : "Pace / GAP"}
                  </p>
                  <p className="font-num text-xs font-bold text-[#161E19]">
                    {discipline === "road"
                      ? `${formatPace(seg.paceSecPerKm)} /km`
                      : `${formatPace(seg.paceSecPerKm)} / ${formatPace(seg.gapSecPerKm)}`}
                  </p>
                </div>
              </div>

              {discipline === "trail" && (
                <p className="mt-2 text-xs text-[#161E19]">
                  <span className="font-semibold">Pacing:</span> {seg.pacingNote}.
                </p>
              )}

              {/* Fueling Breakdown Box: Road omits carry weight & flasks */}
              <div className="mt-2 rounded-lg border border-[#E2E5E2] bg-[#FAFAF8] p-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-[#161E19]">Target Fueling Segmen</span>
                  {discipline === "trail" && (
                    <span className="font-num text-[#525C56]">
                      Beban bawaan ~{seg.carryWeightKg.toFixed(1)} kg
                    </span>
                  )}
                </div>
                <div className="font-num mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#161E19]">
                  <span>Karbo: {seg.carbsG} g</span>
                  <span>
                    {discipline === "trail"
                      ? `Wajib bawa: ${seg.mandatoryCarryWaterMl} mL`
                      : `Minum WS: ${seg.fluidMl} mL`}
                  </span>
                  <span>Natrium: {seg.sodiumMg} mg</span>
                  {seg.caffeineMg > 0 && (
                    <span className="text-[#8A4B00]">Kafein: {seg.caffeineMg} mg</span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-[#525C56]">
                  {discipline === "trail" ? "Bawaan praktis: " : "Panduan WS: "}
                  <strong className="text-[#161E19]">{seg.packSummary}</strong>
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
