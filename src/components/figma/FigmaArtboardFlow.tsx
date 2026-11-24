"use client";

import { useMemo } from "react";
import {
  IconArrowLeft,
  IconDownload,
  IconLocate,
  IconMap,
  IconMinus,
  IconMountain,
  IconPin,
  IconPlus,
  IconUndo,
} from "@/components/Icons";
import { PrintCardModal } from "@/components/print/PrintCardModal";
import { Step1SetupDrawer } from "@/components/steps/Step1SetupDrawer";
import { Step2ConfirmDrawer } from "@/components/steps/Step2ConfirmDrawer";
import { Step3OverviewTab } from "@/components/steps/Step3OverviewTab";
import { Step3StrategyTab } from "@/components/steps/Step3StrategyTab";
import { computeElevationTotals } from "@/lib/race-engine/gpx";
import { simulateRace } from "@/lib/race-engine/pacing";
import { buildSampleRoute } from "@/lib/race-engine/sampleRoutes";
import type { RaceMetadata, RunnerProfile } from "@/lib/race-engine/types";
import { buildClimateFallbackForecast } from "@/lib/race-engine/weather";

const noop = () => {};

function StaticOsmMapBackdrop({
  showStep2Toolbar = false,
  showStep3Legend = false,
}: {
  showStep2Toolbar?: boolean;
  showStep3Legend?: boolean;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#E5ECE6]">
      {/* Real OpenStreetMap raster tile grid for crisp Figma / html.to.design capture */}
      <div className="grid h-full w-full grid-cols-6 grid-rows-4 opacity-95">
        {[
          [3372, 2142],
          [3373, 2142],
          [3374, 2142],
          [3375, 2142],
          [3376, 2142],
          [3377, 2142],
          [3372, 2143],
          [3373, 2143],
          [3374, 2143],
          [3375, 2143],
          [3376, 2143],
          [3377, 2143],
          [3372, 2144],
          [3373, 2144],
          [3374, 2144],
          [3375, 2144],
          [3376, 2144],
          [3377, 2144],
          [3372, 2145],
          [3373, 2145],
          [3374, 2145],
          [3375, 2145],
          [3376, 2145],
          [3377, 2145],
        ].map(([x, y]) => (
          <img
            key={`${x}-${y}`}
            src={`https://tile.openstreetmap.org/12/${x}/${y}.png`}
            alt=""
            className="h-full w-full object-cover"
          />
        ))}
      </div>

      {/* Vector GPX route overlay */}
      <svg
        viewBox="0 0 1440 900"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <path
          d="M 1180 280 C 1100 310, 1050 370, 990 380 C 930 390, 900 460, 860 480 C 810 510, 770 460, 720 490 C 660 525, 620 430, 560 410"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 1180 280 C 1100 310, 1050 370, 990 380"
          fill="none"
          stroke="#1E6B3A"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <path
          d="M 990 380 C 930 390, 900 460, 860 480"
          fill="none"
          stroke="#D97706"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <path
          d="M 860 480 C 810 510, 770 460, 720 490"
          fill="none"
          stroke="#B91C1C"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <path
          d="M 720 490 C 660 525, 620 430, 560 410"
          fill="none"
          stroke="#1E6B3A"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
      </svg>

      {/* Checkpoint Markers */}
      <div className="absolute left-[1168px] top-[268px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#1E6B3A] text-[11px] font-bold text-white shadow">
        S
      </div>
      <div className="absolute left-[978px] top-[368px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white text-[11px] font-bold text-[#161E19] shadow">
        1
      </div>
      <div className="absolute left-[848px] top-[468px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#B91C1C] text-[11px] font-bold text-white shadow">
        P
      </div>
      <div className="absolute left-[708px] top-[478px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white text-[11px] font-bold text-[#161E19] shadow">
        3
      </div>
      <div className="absolute left-[548px] top-[398px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#161E19] text-[11px] font-bold text-white shadow">
        F
      </div>

      {/* Top-right layer switcher */}
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-[#E2E5E2] bg-white/95 p-1 shadow-sm">
        <span className="rounded-full bg-[#1B2B22] px-3 py-1.5 text-xs font-semibold text-white">
          OSM
        </span>
        <span className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#161E19]">
          Topo
        </span>
        <span className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#161E19]">
          3D
        </span>
        <span className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#161E19]">
          Satelit
        </span>
      </div>

      {/* Right-edge circular controls */}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E5E2] bg-white text-xs font-bold text-[#161E19] shadow-sm">
          3D
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E5E2] bg-white text-[#161E19] shadow-sm">
          <IconPlus size={18} />
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E5E2] bg-white text-[#161E19] shadow-sm">
          <IconMinus size={18} />
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E5E2] bg-white text-[#161E19] shadow-sm">
          <IconLocate size={18} />
        </div>
      </div>

      {showStep2Toolbar && (
        <div className="absolute bottom-4 left-[476px] right-16 flex justify-center">
          <div className="flex w-max items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E2E5E2] bg-white/95 px-3 py-1.5 shadow-md">
            <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#161E19]">
              <IconPin size={14} />
              Tambah CP di Peta
            </span>
            <span className="h-5 w-px bg-[#E2E5E2]" />
            <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#161E19]">
              Hapus titik loncat
              <span className="font-num rounded-full bg-[#FDF3E3] px-1.5 py-0.5 text-[10px] font-bold text-[#8A4B00]">
                3
              </span>
            </span>
            <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#161E19]">
              <IconMountain size={14} />
              Perbaiki elevasi
            </span>
            <span className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-[#161E19]/40">
              <IconUndo size={14} />
              Undo
            </span>
            <span className="h-5 w-px bg-[#E2E5E2]" />
            <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#1B2B22] px-3.5 text-xs font-semibold text-white">
              <IconDownload size={14} />
              Export .gpx
            </span>
          </div>
        </div>
      )}

      {showStep3Legend && (
        <div className="absolute bottom-9 right-3 flex items-center gap-3 rounded-full border border-[#E2E5E2] bg-white/95 px-3 py-1.5 text-[11px] font-medium text-[#161E19] shadow-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#1E6B3A]" />
            &lt;8%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#D97706]" />
            8-15%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#B91C1C]" />
            &gt;15%
          </span>
        </div>
      )}
    </div>
  );
}

function DrawerShell({
  step,
  tab,
  widthClass,
  children,
}: {
  step: 1 | 2 | 3;
  tab?: "overview" | "strategy";
  widthClass: string;
  children: React.ReactNode;
}) {
  const stepLabels = [
    { num: 1 as const, label: "Data & GPX" },
    { num: 2 as const, label: "Cek Rute" },
    { num: 3 as const, label: "Strategi" },
  ];

  return (
    <aside
      className={`absolute bottom-4 left-4 top-4 flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_28px_rgba(22,30,25,0.14)] ring-1 ring-[#E2E5E2] ${widthClass}`}
    >
      <header className="shrink-0 border-b border-[#E2E5E2] px-5 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[#161E19]">
                <IconArrowLeft size={16} />
              </span>
            )}
            <span className="text-xs font-extrabold tracking-wider text-[#161E19]">
              [NAMA APP]
            </span>
          </div>
          <span className="font-num rounded-full bg-[#F5F5F3] px-2.5 py-0.5 text-[11px] font-semibold text-[#525C56]">
            Langkah {step}/3
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {stepLabels.map((s) => {
            const active = step === s.num;
            const completed = step > s.num;
            return (
              <div
                key={s.num}
                className={`flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold ${
                  active
                    ? "bg-[#1B2B22] text-white"
                    : completed
                      ? "bg-[#EAF6F0] text-[#146342]"
                      : "bg-[#F5F5F3] text-[#525C56]"
                }`}
              >
                <span className="font-num">{s.num}.</span>
                <span className="truncate">{s.label}</span>
              </div>
            );
          })}
        </div>

        {step === 3 && (
          <div className="mt-2.5 grid grid-cols-2 rounded-lg border border-[#E2E5E2] bg-[#F5F5F3] p-1">
            <div
              className={`flex min-h-[36px] items-center justify-center rounded-md px-2 text-xs font-semibold ${
                tab === "overview"
                  ? "bg-white text-[#161E19] shadow-xs"
                  : "text-[#525C56]"
              }`}
            >
              Overview Rute
            </div>
            <div
              className={`flex min-h-[36px] items-center justify-center rounded-md px-2 text-xs font-semibold ${
                tab === "strategy"
                  ? "bg-white text-[#161E19] shadow-xs"
                  : "text-[#525C56]"
              }`}
            >
              Pacing & Fueling
            </div>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </aside>
  );
}

export function FigmaArtboardFlow() {
  const trailSample = useMemo(() => buildSampleRoute("trail"), []);
  const roadSample = useMemo(() => buildSampleRoute("road"), []);
  const trailTotals = useMemo(
    () => computeElevationTotals(trailSample.points),
    [trailSample]
  );

  const trailMeta: RaceMetadata = {
    runnerName: "Bima Pratama",
    raceName: "Rinjani 100 60K (Sample GPX)",
    discipline: "trail",
    raceDate: "2026-11-29",
    startTime: "05:00",
    timezone: "WITA",
    isSample: true,
    sourceFileName: "rinjani-60k-sample.gpx",
  };

  const roadMeta: RaceMetadata = {
    runnerName: "Bima Pratama",
    raceName: "Jakarta Marathon 42K (Sample GPX)",
    discipline: "road",
    raceDate: "2026-11-29",
    startTime: "05:00",
    timezone: "WIB",
    isSample: true,
    sourceFileName: "jakarta-42k-sample.gpx",
  };

  const trailProfile: RunnerProfile = {
    weightKg: 65,
    flatThresholdPaceSecPerKm: 330,
    targetEffortPct: 82,
    powerHikeGradePct: 15,
    fatigueDriftEnabled: true,
    gutTolerance: "moderate",
    sweatRateLPerHr: 0.9,
    sweatSodiumCategory: "moderate",
    caffeineStrategy: true,
    roadSplitPct: 0,
  };

  const roadProfile: RunnerProfile = {
    ...trailProfile,
    flatThresholdPaceSecPerKm: 300,
    roadSplitPct: -4,
    targetFinishTimeSec: 3.5 * 3600,
  };

  const trailWeather = useMemo(
    () =>
      buildClimateFallbackForecast(
        trailSample.points[0].lat,
        trailSample.points[0].lon,
        trailSample.points[0].ele,
        trailTotals.maxEleM,
        trailMeta.raceDate,
        "WITA"
      ),
    [trailSample, trailTotals.maxEleM, trailMeta.raceDate]
  );

  const roadWeather = useMemo(
    () =>
      buildClimateFallbackForecast(
        roadSample.points[0].lat,
        roadSample.points[0].lon,
        roadSample.points[0].ele,
        18,
        roadMeta.raceDate,
        "WIB"
      ),
    [roadSample, roadMeta.raceDate]
  );

  const trailSim = useMemo(
    () =>
      simulateRace(
        trailSample.points,
        trailSample.checkpoints,
        trailMeta,
        trailProfile,
        trailWeather
      ),
    [trailSample, trailMeta, trailProfile, trailWeather]
  );

  const roadSim = useMemo(
    () =>
      simulateRace(
        roadSample.points,
        roadSample.checkpoints,
        roadMeta,
        roadProfile,
        roadWeather
      ),
    [roadSample, roadMeta, roadProfile, roadWeather]
  );

  const trailDistanceKm =
    trailSample.points[trailSample.points.length - 1].distFromStartM / 1000;

  return (
    <div className="min-h-screen w-max bg-[#E5E7EB] p-12 text-[#161E19]">
      <div className="mb-8 rounded-2xl border border-[#D4DAD6] bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-[#161E19]">
          [NAMA APP] · Figma Artboard Export (All Flows)
        </h1>
        <p className="mt-1 text-sm text-[#525C56]">
          Gunakan plugin Figma <strong>html.to.design</strong> pada URL halaman ini untuk
          meng-import ke-7 screen flow di bawah sekaligus sebagai frame Auto Layout yang dapat
          diedit.
        </p>
      </div>

      <div className="flex items-start gap-14">
        {/* Screen 01: Step 1 Setup */}
        <section>
          <p className="mb-3 text-sm font-bold text-[#161E19]">
            01 · Step 1: Data & GPX (1440 x 900)
          </p>
          <div className="relative h-[900px] w-[1440px] overflow-hidden rounded-2xl border border-[#CBD5E1] bg-white shadow-lg">
            <StaticOsmMapBackdrop />
            <DrawerShell step={1} widthClass="w-[440px]">
              <Step1SetupDrawer
                metadata={trailMeta}
                weightKg={65}
                pointCount={trailSample.points.length}
                totalDistanceKm={trailDistanceKm}
                totalGainM={trailTotals.gainM}
                uploadError={null}
                onUpdateMetadata={noop}
                onChangeWeightKg={noop}
                onUploadGpxFile={noop}
                onLoadSampleRoute={noop}
                onNextStep={noop}
              />
            </DrawerShell>
          </div>
        </section>

        {/* Screen 02: Step 2 Confirmation & Editable GPX */}
        <section>
          <p className="mb-3 text-sm font-bold text-[#161E19]">
            02 · Step 2: Konfirmasi Rute & Editable GPX (1440 x 900)
          </p>
          <div className="relative h-[900px] w-[1440px] overflow-hidden rounded-2xl border border-[#CBD5E1] bg-white shadow-lg">
            <StaticOsmMapBackdrop showStep2Toolbar />
            <DrawerShell step={2} widthClass="w-[440px]">
              <Step2ConfirmDrawer
                metadata={trailMeta}
                points={trailSample.points}
                checkpoints={trailSample.checkpoints}
                cleaningStats={trailSample.cleaningStats}
                totalDistanceKm={trailDistanceKm}
                totalGainM={trailTotals.gainM}
                totalLossM={trailTotals.lossM}
                hoveredPointIndex={null}
                onHoverPointIndex={noop}
                onFocusSegment={noop}
                onUpdateRaceName={noop}
                onUpdateCheckpoint={noop}
                onDeleteCheckpoint={noop}
                onAddCheckpointMidpoint={noop}
                addCpMode={false}
                onToggleAddCpMode={noop}
                onCleanSpikes={noop}
                onSmoothChange={noop}
                onCalibrateDem={noop}
                demLoading={false}
                demMessage={null}
                canUndo={false}
                onUndo={noop}
                onExportGpx={noop}
                onBackStep={noop}
                onGenerateStrategy={noop}
              />
            </DrawerShell>
          </div>
        </section>

        {/* Screen 03: Step 3 Tab 1 Overview Rute */}
        <section>
          <p className="mb-3 text-sm font-bold text-[#161E19]">
            03 · Step 3 Tab 1: Overview Rute (1440 x 900)
          </p>
          <div className="relative h-[900px] w-[1440px] overflow-hidden rounded-2xl border border-[#CBD5E1] bg-white shadow-lg">
            <StaticOsmMapBackdrop showStep3Legend />
            <DrawerShell step={3} tab="overview" widthClass="w-[460px]">
              <Step3OverviewTab
                metadata={trailMeta}
                points={trailSample.points}
                checkpoints={trailSample.checkpoints}
                simulation={trailSim}
                weather={trailWeather}
                weatherLoading={false}
                hoveredPointIndex={null}
                onHoverPointIndex={noop}
                onFocusSegment={noop}
                onUploadGpxFile={noop}
                onExportGpx={noop}
                onSwitchToStrategyTab={noop}
                onOpenPrintModal={noop}
              />
            </DrawerShell>
          </div>
        </section>

        {/* Screen 04: Step 3 Tab 2 Pacing & Fueling (Mode Road) */}
        <section>
          <p className="mb-3 text-sm font-bold text-[#161E19]">
            04 · Step 3 Tab 2: Pacing & Fueling Mode Road (1440 x 900)
          </p>
          <div className="relative h-[900px] w-[1440px] overflow-hidden rounded-2xl border border-[#CBD5E1] bg-white shadow-lg">
            <StaticOsmMapBackdrop showStep3Legend />
            <DrawerShell step={3} tab="strategy" widthClass="w-[460px]">
              <Step3StrategyTab
                discipline="road"
                profile={roadProfile}
                simulation={roadSim}
                onUpdateProfile={noop}
                onFocusSegment={noop}
                onOpenPrintModal={noop}
                onCopyWhatsApp={noop}
                copiedWa={false}
              />
            </DrawerShell>
          </div>
        </section>

        {/* Screen 05: Step 3 Tab 2 Pacing & Fueling (Mode Trail) */}
        <section>
          <p className="mb-3 text-sm font-bold text-[#161E19]">
            05 · Step 3 Tab 2: Pacing & Fueling Mode Trail (1440 x 900)
          </p>
          <div className="relative h-[900px] w-[1440px] overflow-hidden rounded-2xl border border-[#CBD5E1] bg-white shadow-lg">
            <StaticOsmMapBackdrop showStep3Legend />
            <DrawerShell step={3} tab="strategy" widthClass="w-[460px]">
              <Step3StrategyTab
                discipline="trail"
                profile={trailProfile}
                simulation={trailSim}
                onUpdateProfile={noop}
                onFocusSegment={noop}
                onOpenPrintModal={noop}
                onCopyWhatsApp={noop}
                copiedWa={false}
              />
            </DrawerShell>
          </div>
        </section>

        {/* Screen 06: Print CP Card / Wristband Modal */}
        <section>
          <p className="mb-3 text-sm font-bold text-[#161E19]">
            06 · Modal Print CP Card & Wrist Pace Band (1440 x 900)
          </p>
          <div className="relative h-[900px] w-[1440px] overflow-hidden rounded-2xl border border-[#CBD5E1] bg-white shadow-lg">
            <StaticOsmMapBackdrop showStep3Legend />
            <div className="absolute inset-0 flex items-center justify-center bg-[#161E19]/55 p-6">
              <div className="w-full max-w-2xl">
                <PrintCardModal
                  open
                  embedded
                  onClose={noop}
                  metadata={trailMeta}
                  simulation={trailSim}
                  onCopyWhatsApp={noop}
                  copiedWa={false}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Screen 07: Mobile Responsive Reflow (390 x 844) */}
        <section>
          <p className="mb-3 text-sm font-bold text-[#161E19]">
            07 · Mobile View Reflow (390 x 844)
          </p>
          <div className="relative flex h-[844px] w-[390px] flex-col overflow-hidden rounded-3xl border border-[#CBD5E1] bg-white shadow-lg">
            <div className="relative h-[300px] w-full shrink-0">
              <StaticOsmMapBackdrop />
              <div className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-[#1B2B22] px-3.5 py-2 text-xs font-semibold text-white shadow">
                <IconMap size={14} />
                Lihat Peta Penuh
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col rounded-t-2xl border-t border-[#E2E5E2] bg-white">
              <div className="border-b border-[#E2E5E2] px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#161E19]">[NAMA APP]</span>
                  <span className="font-num rounded-full bg-[#F5F5F3] px-2.5 py-0.5 text-[11px] font-semibold text-[#525C56]">
                    Langkah 3/3
                  </span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <Step3StrategyTab
                  discipline="road"
                  profile={roadProfile}
                  simulation={roadSim}
                  onUpdateProfile={noop}
                  onFocusSegment={noop}
                  onOpenPrintModal={noop}
                  onCopyWhatsApp={noop}
                  copiedWa={false}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
