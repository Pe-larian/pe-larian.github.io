"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconArrowLeft, IconMap } from "@/components/Icons";
import { RouteMapCanvas } from "@/components/map/RouteMapCanvas";
import { PrintCardModal } from "@/components/print/PrintCardModal";
import { Step1SetupDrawer } from "@/components/steps/Step1SetupDrawer";
import { Step2ConfirmDrawer } from "@/components/steps/Step2ConfirmDrawer";
import { Step3OverviewTab } from "@/components/steps/Step3OverviewTab";
import { Step3StrategyTab } from "@/components/steps/Step3StrategyTab";
import {
  cleanSpikes,
  computeElevationTotals,
  detectSpikes,
  exportGpxXml,
  findNearestTrackPointIndex,
  parseGpxXml,
  recomputeTrackMetrics,
  smoothElevation,
} from "@/lib/race-engine/gpx";
import { formatDuration, simulateRace } from "@/lib/race-engine/pacing";
import { buildSampleRoute } from "@/lib/race-engine/sampleRoutes";
import type {
  Checkpoint,
  GpxCleaningStats,
  MapLayerId,
  RaceDiscipline,
  RaceMetadata,
  RunnerProfile,
  TrackPoint,
  WeatherForecastResult,
} from "@/lib/race-engine/types";
import {
  fetchDemElevations,
  fetchRaceWeatherForecast,
} from "@/lib/race-engine/openMeteoClient";
import { buildClimateFallbackForecast } from "@/lib/race-engine/weather";

interface UndoSnapshot {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  cleaningStats: GpxCleaningStats;
}

function defaultUpcomingDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toISOString().slice(0, 10);
}

function buildWhatsAppSummary(
  metadata: RaceMetadata,
  sim: ReturnType<typeof simulateRace>
): string {
  const lines = [
    `*RENCANA RACE: ${metadata.raceName}*`,
    `Pelari: ${metadata.runnerName || "-"} | Tanggal: ${metadata.raceDate} | Start: ${metadata.startTime} ${metadata.timezone}`,
    `Total: ${(sim.totalDistanceM / 1000).toFixed(1)} km | Gain: +${sim.totalGainM} m | Est. Finis: ${sim.finishClockTime} (${formatDuration(sim.totalElapsedSec)})`,
    `Total Nutrisi: ${sim.totalCarbsG}g Karbo | ${(sim.totalFluidMl / 1000).toFixed(1)}L Cairan | ${(sim.totalSodiumMg / 1000).toFixed(1)}g Natrium`,
    "",
    "*SPLIT PER SEGMEN:*",
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

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [step3Tab, setStep3Tab] = useState<"overview" | "strategy">("overview");
  const [mobileView, setMobileView] = useState<"panel" | "map">("panel");

  const [metadata, setMetadata] = useState<RaceMetadata>({
    runnerName: "",
    raceName: "Rinjani 100 60K (Sample GPX)",
    discipline: "trail",
    raceDate: defaultUpcomingDate(),
    startTime: "05:00",
    timezone: "WITA",
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
  });

  const [points, setPoints] = useState<TrackPoint[]>(initialSample.points);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(initialSample.checkpoints);
  const [cleaningStats, setCleaningStats] = useState<GpxCleaningStats>(
    initialSample.cleaningStats
  );
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);

  const [activeLayer, setActiveLayer] = useState<MapLayerId>("osm");
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [focusedSegmentIndex, setFocusedSegmentIndex] = useState<number | null>(null);
  const [addCpMode, setAddCpMode] = useState(false);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [demLoading, setDemLoading] = useState(false);
  const [demMessage, setDemMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );

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

  const simulation = useMemo(
    () => simulateRace(points, checkpoints, metadata, profile, weather),
    [points, checkpoints, metadata, profile, weather]
  );

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [
      ...prev.slice(-14),
      {
        points,
        checkpoints,
        cleaningStats,
      },
    ]);
  }, [points, checkpoints, cleaningStats]);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setPoints(last.points);
      setCheckpoints(last.checkpoints);
      setCleaningStats(last.cleaningStats);
      return prev.slice(0, -1);
    });
  }, []);

  // Fetch Open-Meteo forecast directly in browser (CORS-enabled, zero user data proxied)
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
    setPoints(sample.points);
    setCheckpoints(sample.checkpoints);
    setCleaningStats(sample.cleaningStats);
    setUndoStack([]);
    setUploadError(null);
    setDemMessage(null);
    setMetadata((prev) => ({
      ...prev,
      discipline,
      raceName: sample.name,
      timezone: discipline === "road" ? "WIB" : "WITA",
      isSample: true,
      sourceFileName:
        discipline === "road" ? "jakarta-42k-sample.gpx" : "rinjani-60k-sample.gpx",
    }));
  }, []);

  const handleUploadGpxFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setDemMessage(null);
      if (file.size > 15 * 1024 * 1024) {
        setUploadError("Ukuran file terlalu besar (maksimal 15 MB).");
        return;
      }
      try {
        const xmlText = await file.text();
        const parsed = parseGpxXml(xmlText, metadata.discipline);
        setPoints(parsed.points);
        setCheckpoints(parsed.checkpoints);
        setCleaningStats(parsed.cleaningStats);
        setUndoStack([]);
        setMetadata((prev) => ({
          ...prev,
          raceName:
            prev.isSample || !prev.raceName.trim() ? parsed.name : prev.raceName,
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

  const syncCheckpointsToPoints = (
    nextPoints: TrackPoint[],
    currentCps: Checkpoint[]
  ): Checkpoint[] => {
    return currentCps
      .map((cp) => {
        if (cp.type === "start") {
          const p = nextPoints[0];
          return { ...cp, pointIndex: 0, distM: 0, lat: p.lat, lon: p.lon, ele: Math.round(p.ele) };
        }
        if (cp.type === "finish") {
          const lastIdx = nextPoints.length - 1;
          const p = nextPoints[lastIdx];
          return {
            ...cp,
            pointIndex: lastIdx,
            distM: p.distFromStartM,
            lat: p.lat,
            lon: p.lon,
            ele: Math.round(p.ele),
          };
        }
        const idx = findNearestTrackPointIndex(nextPoints, cp.lat, cp.lon);
        const p = nextPoints[idx];
        return {
          ...cp,
          pointIndex: idx,
          distM: p.distFromStartM,
          lat: p.lat,
          lon: p.lon,
          ele: Math.round(p.ele),
        };
      })
      .sort((a, b) => a.distM - b.distM);
  };

  const handleCleanSpikes = useCallback(() => {
    pushUndo();
    const cleaned = cleanSpikes(points);
    const nextTotals = computeElevationTotals(cleaned.points);
    setPoints(cleaned.points);
    setCheckpoints((prev) => syncCheckpointsToPoints(cleaned.points, prev));
    setCleaningStats((prev) => ({
      ...prev,
      cleanedPointCount: cleaned.points.length,
      spikesDetected: detectSpikes(cleaned.points).length,
      spikesRemoved: prev.spikesRemoved + cleaned.removedCount,
      currentGainM: nextTotals.gainM,
    }));
    setDemMessage({
      type: "ok",
      text:
        cleaned.removedCount > 0
          ? `${cleaned.removedCount} spike elevasi/GPS dibersihkan.`
          : "Tidak ada spike ekstrem yang tersisa pada track.",
    });
  }, [points, pushUndo]);

  const handleSmoothChange = useCallback(
    (windowSize: number) => {
      pushUndo();
      const smoothed = smoothElevation(points, windowSize);
      const nextTotals = computeElevationTotals(smoothed);
      setPoints(smoothed);
      setCheckpoints((prev) => syncCheckpointsToPoints(smoothed, prev));
      setCleaningStats((prev) => ({
        ...prev,
        smoothingWindow: windowSize,
        currentGainM: nextTotals.gainM,
      }));
    },
    [points, pushUndo]
  );

  const handleCalibrateDem = useCallback(async () => {
    if (points.length < 2) return;
    setDemLoading(true);
    setDemMessage(null);

    try {
      // Sample up to 90 evenly spaced points for Open-Meteo Copernicus DEM 90m API
      const sampleCount = Math.min(90, points.length);
      const sampledIndices: number[] = [];
      for (let i = 0; i < sampleCount; i++) {
        const idx = Math.round((i / (sampleCount - 1)) * (points.length - 1));
        if (sampledIndices[sampledIndices.length - 1] !== idx) {
          sampledIndices.push(idx);
        }
      }

      const demValues = await fetchDemElevations(
        sampledIndices.map((idx) => ({
          lat: points[idx].lat,
          lon: points[idx].lon,
        }))
      );

      pushUndo();
      const calibrated = points.map((pt, i) => {
        // Linearly interpolate calibrated DEM values between sampled anchors
        let anchorPos = 0;
        while (
          anchorPos < sampledIndices.length - 1 &&
          sampledIndices[anchorPos + 1] < i
        ) {
          anchorPos++;
        }
        const leftIdx = sampledIndices[anchorPos];
        const rightIdx = sampledIndices[Math.min(sampledIndices.length - 1, anchorPos + 1)];
        const frac = rightIdx === leftIdx ? 0 : (i - leftIdx) / (rightIdx - leftIdx);
        const leftEle = demValues[anchorPos];
        const rightEle = demValues[Math.min(demValues.length - 1, anchorPos + 1)];
        const nextEle = leftEle + (rightEle - leftEle) * frac;
        return { lat: pt.lat, lon: pt.lon, ele: nextEle, rawEle: nextEle };
      });

      const recomputed = recomputeTrackMetrics(calibrated);
      const nextTotals = computeElevationTotals(recomputed);
      setPoints(recomputed);
      setCheckpoints((prev) => syncCheckpointsToPoints(recomputed, prev));
      setCleaningStats((prev) => ({
        ...prev,
        demCalibrated: true,
        currentGainM: nextTotals.gainM,
        spikesDetected: detectSpikes(recomputed).length,
      }));
      setDemMessage({
        type: "ok",
        text: `Elevasi dikalibrasi dengan Copernicus DEM 90m (+${nextTotals.gainM} m).`,
      });
    } catch (err) {
      setDemMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Kalibrasi DEM gagal. Gunakan elevasi GPX atau coba lagi.",
      });
    } finally {
      setDemLoading(false);
    }
  }, [points, pushUndo]);

  const handleUpdateCheckpoint = useCallback(
    (id: string, patch: Partial<Checkpoint>) => {
      pushUndo();
      setCheckpoints((prev) =>
        prev.map((cp) => (cp.id === id ? { ...cp, ...patch } : cp))
      );
    },
    [pushUndo]
  );

  const handleDeleteCheckpoint = useCallback(
    (id: string) => {
      pushUndo();
      setCheckpoints((prev) => prev.filter((cp) => cp.id !== id));
    },
    [pushUndo]
  );

  const handleAddCheckpointAtIndex = useCallback(
    (ptIdx: number) => {
      const pt = points[ptIdx];
      if (!pt) return;
      pushUndo();
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
      setCheckpoints((prev) => [...prev, newCp].sort((a, b) => a.distM - b.distM));
      setAddCpMode(false);
    },
    [points, metadata.discipline, pushUndo]
  );

  const handleAddCheckpointAtLatLon = useCallback(
    (lat: number, lon: number) => {
      const idx = findNearestTrackPointIndex(points, lat, lon);
      handleAddCheckpointAtIndex(idx);
    },
    [points, handleAddCheckpointAtIndex]
  );

  const handleAddCheckpointMidpoint = useCallback(() => {
    if (checkpoints.length < 2 || points.length < 4) return;
    // Split the longest current segment in half
    let longestIdx = 0;
    let longestSpan = -1;
    for (let i = 0; i < checkpoints.length - 1; i++) {
      const span = checkpoints[i + 1].pointIndex - checkpoints[i].pointIndex;
      if (span > longestSpan) {
        longestSpan = span;
        longestIdx = i;
      }
    }
    const midPtIdx = Math.floor(
      (checkpoints[longestIdx].pointIndex + checkpoints[longestIdx + 1].pointIndex) / 2
    );
    handleAddCheckpointAtIndex(midPtIdx);
  }, [checkpoints, points.length, handleAddCheckpointAtIndex]);

  const handleExportGpx = useCallback(() => {
    const xml = exportGpxXml(metadata.raceName, points, checkpoints);
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
  }, [metadata.raceName, points, checkpoints]);

  const handleCopyWhatsApp = useCallback(async () => {
    const text = buildWhatsAppSummary(metadata, simulation);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2400);
    } catch {
      // Fallback for restricted clipboard contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2400);
    }
  }, [metadata, simulation]);

  const stepLabels = [
    { num: 1 as const, label: "Data & GPX" },
    { num: 2 as const, label: "Cek Rute" },
    { num: 3 as const, label: "Strategi" },
  ];

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#F5F5F3]">
      {/* 100% Full-Bleed Map Canvas (always visible on desktop; full-screen toggleable on mobile) */}
      <div
        className={`no-print absolute inset-0 z-0 ${
          mobileView === "panel" ? "h-[38dvh] lg:h-full" : "h-full"
        }`}
      >
        <RouteMapCanvas
          points={points}
          checkpoints={checkpoints}
          step={step}
          activeLayer={activeLayer}
          onChangeLayer={setActiveLayer}
          hoveredPointIndex={hoveredPointIndex}
          focusedSegmentIndex={focusedSegmentIndex}
          addCpMode={addCpMode}
          onToggleAddCpMode={() => setAddCpMode((v) => !v)}
          onAddCheckpointAtLatLon={handleAddCheckpointAtLatLon}
          onCleanSpikes={handleCleanSpikes}
          spikesDetected={cleaningStats.spikesDetected}
          onCalibrateDem={handleCalibrateDem}
          demLoading={demLoading}
          canUndo={undoStack.length > 0}
          onUndo={handleUndo}
          onExportGpx={handleExportGpx}
        />
      </div>

      {/* Mobile Map/Panel Toggle Pill */}
      <div className="no-print fixed bottom-4 right-4 z-30 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileView((v) => (v === "panel" ? "map" : "panel"))}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#1B2B22] px-4 text-xs font-semibold text-white shadow-lg"
        >
          <IconMap size={15} />
          {mobileView === "panel" ? "Lihat Peta Penuh" : "Kembali ke Panel"}
        </button>
      </div>

      {/* Floating Left Drawer (Desktop: 390px-430px floating over map; Mobile: bottom sheet 64dvh) */}
      <aside
        aria-label="Panel simulasi race"
        className={`no-print fixed z-20 flex flex-col overflow-hidden bg-white shadow-[0_8px_28px_rgba(22,30,25,0.14)] ring-1 ring-[#E2E5E2] transition-transform lg:bottom-4 lg:left-4 lg:top-4 lg:rounded-2xl ${
          step === 3 ? "lg:w-[430px]" : "lg:w-[396px]"
        } ${
          mobileView === "map"
            ? "pointer-events-none translate-y-[110%] lg:pointer-events-auto lg:translate-y-0"
            : "inset-x-0 bottom-0 top-[36dvh] rounded-t-2xl lg:inset-x-auto lg:top-4"
        }`}
      >
        {/* Minimal Drawer Header (zero sidebar, zero global top navbar) */}
        <header className="shrink-0 border-b border-[#E2E5E2] px-5 pb-3 pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
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

          {/* 3-Step Indicator Bar */}
          <nav aria-label="Tahapan simulasi" className="mt-2.5 grid grid-cols-3 gap-1.5">
            {stepLabels.map((s) => {
              const active = step === s.num;
              const completed = step > s.num;
              return (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => setStep(s.num)}
                  aria-current={active ? "step" : undefined}
                  className={`flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold transition-colors ${
                    active
                      ? "bg-[#1B2B22] text-white"
                      : completed
                        ? "bg-[#EAF6F0] text-[#146342] hover:bg-[#DCF0E5]"
                        : "bg-[#F5F5F3] text-[#525C56] hover:text-[#161E19]"
                  }`}
                >
                  <span className="font-num">{s.num}.</span>
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Step 3 Dual-Tab Switcher (Overview Rute | Strategi Pacing & Fueling) */}
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

        {/* Active Step Content */}
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
              onNextStep={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <Step2ConfirmDrawer
              metadata={metadata}
              points={points}
              checkpoints={checkpoints}
              cleaningStats={cleaningStats}
              totalDistanceKm={totalDistanceKm}
              totalGainM={totals.gainM}
              totalLossM={totals.lossM}
              hoveredPointIndex={hoveredPointIndex}
              onHoverPointIndex={setHoveredPointIndex}
              onFocusSegment={setFocusedSegmentIndex}
              onUpdateRaceName={(raceName) =>
                setMetadata((prev) => ({ ...prev, raceName }))
              }
              onUpdateCheckpoint={handleUpdateCheckpoint}
              onDeleteCheckpoint={handleDeleteCheckpoint}
              onAddCheckpointMidpoint={handleAddCheckpointMidpoint}
              addCpMode={addCpMode}
              onToggleAddCpMode={() => setAddCpMode((v) => !v)}
              onCleanSpikes={handleCleanSpikes}
              onSmoothChange={handleSmoothChange}
              onCalibrateDem={handleCalibrateDem}
              demLoading={demLoading}
              demMessage={demMessage}
              canUndo={undoStack.length > 0}
              onUndo={handleUndo}
              onExportGpx={handleExportGpx}
              onBackStep={() => setStep(1)}
              onGenerateStrategy={() => {
                setStep(3);
                setStep3Tab("overview");
              }}
            />
          )}

          {step === 3 && step3Tab === "overview" && (
            <Step3OverviewTab
              metadata={metadata}
              points={points}
              checkpoints={checkpoints}
              simulation={simulation}
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
              profile={profile}
              simulation={simulation}
              onUpdateProfile={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
              onFocusSegment={setFocusedSegmentIndex}
              onOpenPrintModal={() => setPrintModalOpen(true)}
              onCopyWhatsApp={handleCopyWhatsApp}
              copiedWa={copiedWa}
            />
          )}
        </div>
      </aside>

      {/* Print CP Card / Wristband Modal */}
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
