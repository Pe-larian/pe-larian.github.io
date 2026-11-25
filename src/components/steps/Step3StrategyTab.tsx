"use client";

import { useEffect, useState } from "react";
import { RoadPaceStrategyChart } from "@/components/chart/RoadPaceStrategyChart";
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconMinus,
  IconPlus,
  IconPrint,
} from "@/components/Icons";
import { formatDuration, formatPace } from "@/lib/race-engine/pacing";
import type {
  RaceDiscipline,
  RaceSimulationSummary,
  RunnerProfile,
  SegmentSimulation,
  StrategyGroupingMode,
} from "@/lib/race-engine/types";

interface Step3StrategyTabProps {
  discipline: RaceDiscipline;
  profile: RunnerProfile;
  simulation: RaceSimulationSummary;
  strategyGrouping: StrategyGroupingMode;
  onChangeStrategyGrouping: (mode: StrategyGroupingMode) => void;
  systemSegmentCount: number;
  customCheckpointCount: number;
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
  discipline,
  profile,
  simulation,
  strategyGrouping,
  onChangeStrategyGrouping,
  systemSegmentCount,
  customCheckpointCount,
  onUpdateProfile,
  onFocusSegment,
  onOpenPrintModal,
  onCopyWhatsApp,
  copiedWa,
}: Step3StrategyTabProps) {
  const [weightDraft, setWeightDraft] = useState(String(profile.weightKg));

  useEffect(() => {
    setWeightDraft(String(profile.weightKg));
  }, [profile.weightKg]);

  const commitWeightDraft = (raw: string) => {
    const parsed = Number(raw);
    if (!raw.trim() || !Number.isFinite(parsed)) {
      setWeightDraft(String(profile.weightKg));
      return;
    }
    const clamped = Math.max(35, Math.min(150, Math.round(parsed)));
    onUpdateProfile({ weightKg: clamped });
    setWeightDraft(String(clamped));
  };

  const distKm = Math.max(0.5, simulation.totalDistanceM / 1000);
  const stopSec = simulation.totalStopSec;
  const currentTimeSec = Math.round(simulation.totalElapsedSec);

  const trailMinTimeSec = Math.max(
    1800,
    Math.round(simulation.equivalentDistanceKm * 240 + stopSec)
  );
  const trailMaxTimeSec = Math.max(
    trailMinTimeSec + 3600,
    Math.round(simulation.equivalentDistanceKm * 720 + stopSec)
  );

  // Single dynamic IF-ELSE COT banner: red if missed, green if safe/within COT
  const isMissedCot = simulation.finalCutoffStatus === "missed";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
        {/* 1. TOP CARD: KEBUTUHAN NUTRISI STANDAR + Inline Weight Stepper */}
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
          </div>

          {/* Inline Weight Stepper */}
          <div className="mt-2.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label
                htmlFor="strategy-weight-input"
                className="text-[11px] font-semibold text-[#161E19]"
              >
                Berat badan (kg)
              </label>
              <span className="text-[10px] text-[#525C56]">
                Dasar hitung hidrasi & kalori
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(35, profile.weightKg - 1);
                  onUpdateProfile({ weightKg: next });
                  setWeightDraft(String(next));
                }}
                aria-label="Kurangi berat badan 1 kg"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#8C948E] bg-white text-[#161E19] hover:bg-[#ECEFED]"
              >
                <IconMinus size={15} />
              </button>
              <input
                id="strategy-weight-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={weightDraft}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, "");
                  setWeightDraft(cleaned);
                  if (cleaned !== "") {
                    const num = Number(cleaned);
                    if (Number.isFinite(num) && num >= 35 && num <= 150) {
                      onUpdateProfile({ weightKg: num });
                    }
                  }
                }}
                onBlur={() => commitWeightDraft(weightDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitWeightDraft(weightDraft);
                }}
                className="font-num min-h-[40px] w-full rounded-lg border border-[#8C948E] bg-white px-2 text-center text-sm font-bold text-[#161E19]"
              />
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(150, profile.weightKg + 1);
                  onUpdateProfile({ weightKg: next });
                  setWeightDraft(String(next));
                }}
                aria-label="Tambah berat badan 1 kg"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#8C948E] bg-white text-[#161E19] hover:bg-[#ECEFED]"
              >
                <IconPlus size={15} />
              </button>
            </div>
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
        </section>

        {/* 2. MIDDLE CARD: PACING STRATEGY + SINGLE DYNAMIC IF-ELSE COT BANNER */}
        <section
          aria-labelledby="heading-pacing-sliders"
          className="space-y-3 rounded-xl border border-[#E2E5E2] bg-white p-3.5"
        >
          {discipline === "road" ? (
            <>
              <h2 id="heading-pacing-sliders" className="sr-only">
                Atur Strategi Pace Road
              </h2>
              <RoadPaceStrategyChart
                distanceKm={distKm}
                stopSec={stopSec}
                avgPaceSecPerKm={simulation.avgPaceSecPerKm}
                totalElapsedSec={simulation.totalElapsedSec}
                roadSplitPct={profile.roadSplitPct}
                onChangePaceSec={(nextPace) => {
                  const nextTotalSec = Math.round(distKm * nextPace + stopSec);
                  onUpdateProfile({
                    flatThresholdPaceSecPerKm: nextPace,
                    targetFinishTimeSec: nextTotalSec,
                  });
                }}
                onChangeSplitPct={(nextSplit) =>
                  onUpdateProfile({ roadSplitPct: nextSplit })
                }
                onReset={() =>
                  onUpdateProfile({
                    targetFinishTimeSec: undefined,
                    flatThresholdPaceSecPerKm: 330,
                    roadSplitPct: 0,
                  })
                }
              />
            </>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2
                  id="heading-pacing-sliders"
                  className="text-xs font-bold uppercase tracking-wide text-[#161E19]"
                >
                  Atur Target Waktu Finis Trail
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

          {/* Single Dynamic IF-ELSE COT Status Banner (Green when safe, Red when past COT) */}
          <div
            role="status"
            className={`rounded-xl border p-3 transition-colors ${
              isMissedCot
                ? "border-[#FECACA] bg-[#FEE2E2] text-[#991B1B]"
                : "border-[#CBEAD9] bg-[#EAF6F0] text-[#146342]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide">
                  Proyeksi Finis
                </p>
                <p className="font-num mt-0.5 text-base font-extrabold">
                  {simulation.finishClockTime} ({formatDuration(simulation.totalElapsedSec)})
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium">
                  {discipline === "road" ? "Target Pace" : "Pace / GAP"}
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
              <p className="font-num mt-1.5 text-xs font-bold">
                {isMissedCot
                  ? `MELEWATI BATAS COT: +${formatDuration(
                      Math.abs(simulation.finalCutoffBufferSec)
                    )} lebih lambat dari batas waktu.`
                  : `Margin COT akhir: +${formatDuration(
                      simulation.finalCutoffBufferSec
                    )} lebih cepat dari batas waktu.`}
              </p>
            )}
          </div>
        </section>

        {/* 3. BOTTOM SECTION: PER-SEGMENT / PER-CHECKPOINT CARDS WITH SYNCED SWITCHER */}
        <section aria-labelledby="heading-strategy-segments" className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="heading-strategy-segments"
              className="text-xs font-bold uppercase tracking-wide text-[#161E19]"
            >
              {strategyGrouping === "segments"
                ? `Rencana Per Segmen (${simulation.segments.length})`
                : `Rencana Per Checkpoint (${simulation.segments.length})`}
            </h2>

            <div
              className="inline-flex rounded-lg border border-[#E2E5E2] bg-[#F5F5F3] p-0.5"
              role="group"
              aria-label="Pilih tampilan strategi per segmen atau checkpoint"
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
                  {strategyGrouping === "segments" ? `S${seg.index + 1}` : `CP${seg.index + 1}`}:{" "}
                  {seg.fromCp.name} -&gt; {seg.toCp.name}
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
