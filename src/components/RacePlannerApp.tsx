"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconArrowLeft } from "@/components/Icons";
import { RouteMapCanvas } from "@/components/map/RouteMapCanvas";
import { PrintCardModal } from "@/components/print/PrintCardModal";
import { Step1SetupDrawer } from "@/components/steps/Step1SetupDrawer";
import { Step2ConfirmDrawer } from "@/components/steps/Step2ConfirmDrawer";
import { Step3OverviewTab } from "@/components/steps/Step3OverviewTab";
import { Step3StrategyTab } from "@/components/steps/Step3StrategyTab";
import {
  buildSystemSegmentsCheckpoints,
  computeElevationTotals,
  exportGpxXml,
  findNearestTrackPointIndex,
  parseGpxXml,
} from "@/lib/race-engine/gpx";
import { fetchRaceWeatherForecast } from "@/lib/race-engine/openMeteoClient";
import { formatDuration, simulateRace } from "@/lib/race-engine/pacing";
import { buildSampleRoute } from "@/lib/race-engine/sampleRoutes";
import type {
  Checkpoint,
  MapLayerId,
  RaceDiscipline,
  RaceMetadata,
  RunnerProfile,
  StrategyGroupingMode,
  TrackPoint,
  WeatherForecastResult,
} from "@/lib/race-engine/types";
import {
  buildClimateFallbackForecast,
  detectIndonesianTimezone,
} from "@/lib/race-engine/weather";

function defaultUpcomingDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toISOString().slice(0, 10);
}

function buildWhatsAppSummary(
  metadata: RaceMetadata,
  sim: ReturnType<typeof simulateRace>,
  grouping: StrategyGroupingMode
): string {
  const lines = [
    `*RENCANA RACE: ${metadata.raceName}*`,
    `Tanggal: ${metadata.raceDate} | Start: ${metadata.startTime} ${metadata.timezone}${
      metadata.globalCutoffHours ? ` | COT: ${metadata.globalCutoffHours} Jam` : ""
    }`,
    `Total: ${(sim.totalDistanceM / 1000).toFixed(1)} km | Gain: +${sim.totalGainM} m | Est. Finis: ${sim.finishClockTime} (${formatDuration(sim.totalElapsedSec)})`,
    `Total Nutrisi: ${sim.totalCarbsG}g Karbo | ${(sim.totalFluidMl / 1000).toFixed(1)}L Cairan | ${(sim.totalSodiumMg / 1000).toFixed(1)}g Natrium`,
    "",
    grouping === "segments" ? "*SPLIT PER SEGMEN:*" : "*SPLIT PER CHECKPOINT:*",
  ];

  for (const seg of sim.segments) {
    const cotPart = seg.cutoffClockTime ? ` | COT ${seg.cutoffClockTime.slice(0, 5)}` : "";
    lines.push(
      `${seg.index + 1}. ${seg.toCp.name} (${(seg.toCp.distM / 1000).toFixed(1)} km) -> Tiba ${seg.arrivalClockTime.slice(0, 5)}${cotPart} | Fuel: ${seg.carbsG}g C, ${seg.fluidMl}mL, ${seg.sodiumMg}mg Na`
    );
  }

  return lines.join("\n");
}

export function RacePlannerApp() {
  const initialSample = useMemo(() => buildSampleRoute("trail"), []);
  const initialSystemCps = useMemo(
    () => buildSystemSegmentsCheckpoints(initialSample.points, "trail"),
    [initialSample.points]
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState<1 | 2 | 3>(1);
  const [step3Tab, setStep3Tab] = useState<"overview" | "strategy">("overview");
  const [mobileFullMap, setMobileFullMap] = useState(false);
  const [strategyGrouping, setStrategyGrouping] =
    useState<StrategyGroupingMode>("segments");

  const [metadata, setMetadata] = useState<RaceMetadata>({
    raceName: "Rinjani 100 60K (Sample GPX)",
    discipline: "trail",
    raceDate: defaultUpcomingDate(),
    startTime: "05:00",
    timezone: "WITA",
    globalCutoffHours: 16,
    isSample: true,
    sourceFileName: "rinjani-60k-sample.gpx",
  });

  const [profile, setProfile] = useState<RunnerProfile>({
    weightKg: 65,
    flatThresholdPaceSecPerKm: 330, // 5:30 /km
    targetEffortPct: 82,
    powerHikeGradePct: 15,
    fatigueDriftEnabled: true,
    gutTolerance: "moderate",
    sweatRateLPerHr: 0.9,
    sweatSodiumCategory: "moderate",
    caffeineStrategy: true,
    roadSplitPct: 0,
  });

  const [points, setPoints] = useState<TrackPoint[]>(initialSample.points);
  const [systemCheckpoints, setSystemCheckpoints] =
    useState<Checkpoint[]>(initialSystemCps);
  const [customCheckpoints, setCustomCheckpoints] = useState<Checkpoint[]>(
    initialSample.checkpoints
  );

  const [activeLayer, setActiveLayer] = useState<MapLayerId>("osm");
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [focusedSegmentIndex, setFocusedSegmentIndex] = useState<number | null>(null);
  const [addCpMode, setAddCpMode] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weather, setWeather] = useState<WeatherForecastResult>(() => {
    const totals = computeElevationTotals(initialSample.points);
    const startPt = initialSample.points[0];
    return buildClimateFallbackForecast(
      startPt?.lat ?? -8.3669,
      startPt?.lon ?? 116.5335,
      startPt?.ele ?? 1156,
      totals.maxEleM,
      defaultUpcomingDate(),
      "WITA"
    );
  });

  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);

  const totals = useMemo(() => computeElevationTotals(points), [points]);
  const totalDistanceKm = useMemo(
    () => (points.length > 0 ? points[points.length - 1].distFromStartM / 1000 : 0),
    [points]
  );

  const activeCheckpoints =
    strategyGrouping === "segments" ? systemCheckpoints : customCheckpoints;

  const simulation = useMemo(
    () => simulateRace(points, activeCheckpoints, metadata, profile, weather),
    [points, activeCheckpoints, metadata, profile, weather]
  );

  const startLat = points[0]?.lat ?? -8.3669;
  const startLon = points[0]?.lon ?? 116.5335;
  const startEle = points[0]?.ele ?? 0;

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      setWeatherLoading(true);
      try {
        const data = await fetchRaceWeatherForecast({
          lat: startLat,
          lon: startLon,
          baseEleM: Math.round(startEle),
          maxEleM: Math.round(totals.maxEleM),
          raceDate: metadata.raceDate,
          timezone: metadata.timezone,
        });
        if (!cancelled && data?.hourly?.length > 0) {
          setWeather(data);
        }
      } catch {
        if (!cancelled) {
          setWeather(
            buildClimateFallbackForecast(
              startLat,
              startLon,
              startEle,
              totals.maxEleM,
              metadata.raceDate,
              metadata.timezone
            )
          );
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    }

    loadWeather();
    return () => {
      cancelled = true;
    };
  }, [startLat, startLon, startEle, totals.maxEleM, metadata.raceDate, metadata.timezone]);

  const handleLoadSampleRoute = useCallback((discipline: RaceDiscipline) => {
    const sample = buildSampleRoute(discipline);
    const detectedTz = detectIndonesianTimezone(sample.points[0]?.lon ?? 116.5);
    setPoints(sample.points);
    setSystemCheckpoints(buildSystemSegmentsCheckpoints(sample.points, discipline));
    setCustomCheckpoints(sample.checkpoints);
    setUploadError(null);
    setProfile((prev) => ({
      ...prev,
      targetFinishTimeSec: undefined,
    }));
    setMetadata((prev) => ({
      ...prev,
      discipline,
      raceName: sample.name,
      timezone: detectedTz,
      globalCutoffHours: discipline === "road" ? 7 : 16,
      isSample: true,
      sourceFileName:
        discipline === "road" ? "jakarta-42k-sample.gpx" : "rinjani-60k-sample.gpx",
    }));
  }, []);

  const handleUploadGpxFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      if (file.size > 15 * 1024 * 1024) {
        setUploadError("Ukuran file terlalu besar (maksimal 15 MB).");
        return;
      }
      try {
        const xmlText = await file.text();
        const parsed = parseGpxXml(xmlText, metadata.discipline);
        const detectedTz = detectIndonesianTimezone(parsed.points[0]?.lon ?? 106.8);
        setPoints(parsed.points);
        setSystemCheckpoints(
          buildSystemSegmentsCheckpoints(parsed.points, metadata.discipline)
        );
        setCustomCheckpoints(parsed.checkpoints);
        setProfile((prev) => ({
          ...prev,
          targetFinishTimeSec: undefined,
        }));
        setMetadata((prev) => ({
          ...prev,
          raceName:
            prev.isSample || !prev.raceName.trim() ? parsed.name : prev.raceName,
          timezone: detectedTz,
          isSample: false,
          sourceFileName: file.name,
        }));
      } catch (err) {
        setUploadError(
          err instanceof Error
            ? err.message
            : "File GPX tidak dapat dibaca. Pastikan format XML GPX 1.1 valid."
        );
      }
    },
    [metadata.discipline]
  );

  const handleUpdateSystemCheckpoint = useCallback(
    (id: string, patch: Partial<Checkpoint>) => {
      setSystemCheckpoints((prev) =>
        prev.map((cp) => (cp.id === id ? { ...cp, ...patch } : cp))
      );
    },
    []
  );

  const handleUpdateCustomCheckpoint = useCallback(
    (id: string, patch: Partial<Checkpoint>) => {
      setCustomCheckpoints((prev) =>
        prev.map((cp) => (cp.id === id ? { ...cp, ...patch } : cp))
      );
    },
    []
  );

  const handleDeleteCustomCheckpoint = useCallback((id: string) => {
    setCustomCheckpoints((prev) => prev.filter((cp) => cp.id !== id));
  }, []);

  const handleAddCheckpointAtIndex = useCallback(
    (ptIdx: number) => {
      const pt = points[ptIdx];
      if (!pt) return;
      const newCp: Checkpoint = {
        id: `cp-custom-${Date.now()}`,
        name: `CP Baru (${(pt.distFromStartM / 1000).toFixed(1)} km)`,
        type: "aid",
        distM: pt.distFromStartM,
        pointIndex: ptIdx,
        lat: pt.lat,
        lon: pt.lon,
        ele: Math.round(pt.ele),
        plannedStopSec: metadata.discipline === "road" ? 45 : 300,
        terrainAfter: metadata.discipline === "road" ? "road" : "singletrack",
        services: ["Air", "Isotonik"],
      };
      setCustomCheckpoints((prev) => [...prev, newCp].sort((a, b) => a.distM - b.distM));
      setStrategyGrouping("checkpoints");
      setAddCpMode(false);
    },
    [points, metadata.discipline]
  );

  const handleAddCheckpointAtLatLon = useCallback(
    (lat: number, lon: number) => {
      const idx = findNearestTrackPointIndex(points, lat, lon);
      handleAddCheckpointAtIndex(idx);
    },
    [points, handleAddCheckpointAtIndex]
  );

  const handleAddCheckpointMidpoint = useCallback(() => {
    if (customCheckpoints.length < 2 || points.length < 4) return;
    let longestIdx = 0;
    let longestSpan = -1;
    for (let i = 0; i < customCheckpoints.length - 1; i++) {
      const span = customCheckpoints[i + 1].pointIndex - customCheckpoints[i].pointIndex;
      if (span > longestSpan) {
        longestSpan = span;
        longestIdx = i;
      }
    }
    const midPtIdx = Math.floor(
      (customCheckpoints[longestIdx].pointIndex +
        customCheckpoints[longestIdx + 1].pointIndex) /
        2
    );
    handleAddCheckpointAtIndex(midPtIdx);
  }, [customCheckpoints, points.length, handleAddCheckpointAtIndex]);

  const handleExportGpx = useCallback(() => {
    const xml = exportGpxXml(metadata.raceName, points, activeCheckpoints);
    const blob = new Blob([xml], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const slug = (metadata.raceName || "rute-race")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug || "rute-race"}.gpx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [metadata.raceName, points, activeCheckpoints]);

  const handleCopyWhatsApp = useCallback(async () => {
    const text = buildWhatsAppSummary(metadata, simulation, strategyGrouping);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2400);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2400);
    }
  }, [metadata, simulation, strategyGrouping]);

  const stepLabels = [
    { num: 1 as const, label: "Data & GPX" },
    { num: 2 as const, label: "Cek Rute" },
    { num: 3 as const, label: "Strategi" },
  ];

  const hideMapOnMobile = step === 1;

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#F5F5F3]">
      {/* Map Canvas: Hidden on Mobile Step 1; always full-bleed on Desktop */}
      <div
        className={`no-print absolute inset-x-0 top-0 z-0 lg:inset-0 lg:block lg:h-full ${
          hideMapOnMobile
            ? "hidden"
            : mobileFullMap
              ? "h-full"
              : "h-[36dvh]"
        }`}
      >
        <RouteMapCanvas
          points={points}
          checkpoints={activeCheckpoints}
          step={step}
          activeLayer={activeLayer}
          onChangeLayer={setActiveLayer}
          hoveredPointIndex={hoveredPointIndex}
          focusedSegmentIndex={focusedSegmentIndex}
          addCpMode={addCpMode}
          onToggleAddCpMode={() => setAddCpMode((v) => !v)}
          onAddCheckpointAtLatLon={handleAddCheckpointAtLatLon}
          mobileFullMap={mobileFullMap}
          onToggleMobileFullMap={() => setMobileFullMap((v) => !v)}
        />
      </div>

      {/* Drawer Panel: Full-screen on Mobile Step 1, Bottom Sheet on Mobile Step 2-3, Floating Left on Desktop */}
      <aside
        aria-label="Panel simulasi race"
        className={`no-print fixed z-20 flex flex-col overflow-hidden bg-white shadow-[0_8px_28px_rgba(22,30,25,0.14)] ring-1 ring-[#E2E5E2] transition-transform lg:bottom-4 lg:left-4 lg:top-4 lg:rounded-2xl ${
          step === 3 ? "lg:w-[460px]" : "lg:w-[440px]"
        } ${
          hideMapOnMobile
            ? "inset-0 rounded-none lg:inset-x-auto lg:top-4"
            : mobileFullMap
              ? "pointer-events-none translate-y-[110%] lg:pointer-events-auto lg:translate-y-0"
              : "inset-x-0 bottom-0 top-[34dvh] rounded-t-2xl lg:inset-x-auto lg:top-4"
        }`}
      >
        <header className="shrink-0 border-b border-[#E2E5E2] px-5 pb-3 pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileFullMap(false);
                    setStep((s) => (s === 3 ? 2 : 1));
                  }}
                  aria-label="Langkah sebelumnya"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#161E19] hover:bg-[#F5F5F3]"
                >
                  <IconArrowLeft size={16} />
                </button>
              )}
              <span className="text-xs font-extrabold tracking-wider text-[#161E19]">
                [NAMA APP]
              </span>
            </div>
            <span className="font-num rounded-full bg-[#F5F5F3] px-2.5 py-0.5 text-[11px] font-semibold text-[#525C56]">
              Langkah {step}/3
            </span>
          </div>

          {/* 3-Step Indicator Bar (Strict Stepper Lock: cannot jump ahead) */}
          <nav aria-label="Tahapan simulasi" className="mt-2.5 grid grid-cols-3 gap-1.5">
            {stepLabels.map((s) => {
              const active = step === s.num;
              const completed = step > s.num;
              const locked = s.num > maxUnlockedStep;
              return (
                <button
                  key={s.num}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    if (locked) return;
                    setMobileFullMap(false);
                    setStep(s.num);
                  }}
                  aria-current={active ? "step" : undefined}
                  aria-disabled={locked}
                  className={`flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold transition-colors ${
                    active
                      ? "bg-[#1B2B22] text-white"
                      : completed
                        ? "bg-[#EAF6F0] text-[#146342] hover:bg-[#DCF0E5]"
                        : locked
                          ? "bg-[#F5F5F3] text-[#525C56]/55"
                          : "bg-[#F5F5F3] text-[#525C56] hover:text-[#161E19]"
                  }`}
                >
                  <span className="font-num">{s.num}.</span>
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Step 3 Dual-Tab Switcher */}
          {step === 3 && (
            <div
              className="mt-2.5 grid grid-cols-2 rounded-lg border border-[#E2E5E2] bg-[#F5F5F3] p-1"
              role="tablist"
              aria-label="Tab hasil strategi race"
            >
              <button
                type="button"
                role="tab"
                aria-selected={step3Tab === "overview"}
                onClick={() => setStep3Tab("overview")}
                className={`min-h-[36px] rounded-md px-2 text-xs font-semibold transition-colors ${
                  step3Tab === "overview"
                    ? "bg-white text-[#161E19] shadow-xs"
                    : "text-[#525C56] hover:text-[#161E19]"
                }`}
              >
                Overview Rute
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={step3Tab === "strategy"}
                onClick={() => setStep3Tab("strategy")}
                className={`min-h-[36px] rounded-md px-2 text-xs font-semibold transition-colors ${
                  step3Tab === "strategy"
                    ? "bg-white text-[#161E19] shadow-xs"
                    : "text-[#525C56] hover:text-[#161E19]"
                }`}
              >
                Pacing & Fueling
              </button>
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1">
          {step === 1 && (
            <Step1SetupDrawer
              metadata={metadata}
              weightKg={profile.weightKg}
              pointCount={points.length}
              totalDistanceKm={totalDistanceKm}
              totalGainM={totals.gainM}
              uploadError={uploadError}
              onUpdateMetadata={(patch) => setMetadata((prev) => ({ ...prev, ...patch }))}
              onChangeWeightKg={(kg) => setProfile((prev) => ({ ...prev, weightKg: kg }))}
              onUploadGpxFile={handleUploadGpxFile}
              onLoadSampleRoute={handleLoadSampleRoute}
              onNextStep={() => {
                setMaxUnlockedStep((prev) => (prev < 2 ? 2 : prev));
                setMobileFullMap(false);
                setStep(2);
              }}
            />
          )}

          {step === 2 && (
            <Step2ConfirmDrawer
              metadata={metadata}
              points={points}
              systemCheckpoints={systemCheckpoints}
              customCheckpoints={customCheckpoints}
              strategyGrouping={strategyGrouping}
              onChangeStrategyGrouping={setStrategyGrouping}
              totalDistanceKm={totalDistanceKm}
              totalGainM={totals.gainM}
              totalLossM={totals.lossM}
              hoveredPointIndex={hoveredPointIndex}
              onHoverPointIndex={setHoveredPointIndex}
              onFocusSegment={setFocusedSegmentIndex}
              onUpdateRaceName={(raceName) =>
                setMetadata((prev) => ({ ...prev, raceName }))
              }
              onUpdateSystemCheckpoint={handleUpdateSystemCheckpoint}
              onUpdateCustomCheckpoint={handleUpdateCustomCheckpoint}
              onDeleteCustomCheckpoint={handleDeleteCustomCheckpoint}
              onAddCheckpointMidpoint={handleAddCheckpointMidpoint}
              addCpMode={addCpMode}
              onToggleAddCpMode={() => setAddCpMode((v) => !v)}
              onBackStep={() => {
                setMobileFullMap(false);
                setStep(1);
              }}
              onGenerateStrategy={() => {
                setMaxUnlockedStep(3);
                setMobileFullMap(false);
                setStep(3);
                setStep3Tab("overview");
              }}
            />
          )}

          {step === 3 && step3Tab === "overview" && (
            <Step3OverviewTab
              metadata={metadata}
              points={points}
              checkpoints={activeCheckpoints}
              simulation={simulation}
              strategyGrouping={strategyGrouping}
              onChangeStrategyGrouping={setStrategyGrouping}
              systemSegmentCount={Math.max(0, systemCheckpoints.length - 1)}
              customCheckpointCount={customCheckpoints.length}
              weather={weather}
              weatherLoading={weatherLoading}
              hoveredPointIndex={hoveredPointIndex}
              onHoverPointIndex={setHoveredPointIndex}
              onFocusSegment={setFocusedSegmentIndex}
              onUploadGpxFile={handleUploadGpxFile}
              onExportGpx={handleExportGpx}
              onSwitchToStrategyTab={() => setStep3Tab("strategy")}
              onOpenPrintModal={() => setPrintModalOpen(true)}
            />
          )}

          {step === 3 && step3Tab === "strategy" && (
            <Step3StrategyTab
              discipline={metadata.discipline}
              profile={profile}
              simulation={simulation}
              strategyGrouping={strategyGrouping}
              onChangeStrategyGrouping={setStrategyGrouping}
              systemSegmentCount={Math.max(0, systemCheckpoints.length - 1)}
              customCheckpointCount={customCheckpoints.length}
              onUpdateProfile={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
              onFocusSegment={setFocusedSegmentIndex}
              onOpenPrintModal={() => setPrintModalOpen(true)}
              onCopyWhatsApp={handleCopyWhatsApp}
              copiedWa={copiedWa}
            />
          )}
        </div>
      </aside>

      <PrintCardModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        metadata={metadata}
        simulation={simulation}
        onCopyWhatsApp={handleCopyWhatsApp}
        copiedWa={copiedWa}
      />
    </main>
  );
}
