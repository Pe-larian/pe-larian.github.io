"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { IconCheck, IconMap, IconMinus, IconPin, IconPlus } from "@/components/Icons";
import type { AddCheckpointPayload } from "@/components/steps/Step2ConfirmDrawer";
import {
  findNearestTrackPointIndex,
  findTrackPointIndexAtDistance,
} from "@/lib/race-engine/gpx";
import type {
  Checkpoint,
  MapLayerId,
  RaceDiscipline,
  TrackPoint,
} from "@/lib/race-engine/types";

interface RouteMapCanvasProps {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  discipline: RaceDiscipline;
  hideIntermediateMarkers: boolean;
  step: 1 | 2 | 3;
  activeLayer: MapLayerId;
  onChangeLayer: (layer: MapLayerId) => void;
  hoveredPointIndex: number | null;
  focusedSegmentIndex: number | null;
  addCpMode: boolean;
  onExitAddCpMode: () => void;
  onSaveCheckpointFromMap: (payload: AddCheckpointPayload) => void;
  mobileFullMap: boolean;
  onToggleMobileFullMap: () => void;
}

function slopeBucketColor(gradePct: number): string {
  const abs = Math.abs(gradePct);
  if (abs >= 15) return "#B91C1C";
  if (abs >= 8) return "#D97706";
  return "#1E6B3A";
}

function buildRouteGeoJson(points: TrackPoint[]) {
  const features = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    features.push({
      type: "Feature" as const,
      properties: {
        color: slopeBucketColor(b.gradePct),
      },
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [a.lon, a.lat],
          [b.lon, b.lat],
        ],
      },
    });
  }
  return {
    type: "FeatureCollection" as const,
    features,
  };
}

function buildPersistentMapStyle(
  initialLayer: MapLayerId,
  initialRouteData: ReturnType<typeof buildRouteGeoJson>
) {
  const vis = (id: MapLayerId) => {
    if (id === "osm") {
      return initialLayer === "osm" || initialLayer === "terrain3d" ? "visible" : "none";
    }
    return initialLayer === id ? "visible" : "none";
  };

  return {
    version: 8 as const,
    sources: {
      osm: {
        type: "raster" as const,
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "OpenStreetMap contributors",
        maxzoom: 19,
      },
      topo: {
        type: "raster" as const,
        tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "OpenStreetMap contributors | OpenTopoMap",
        maxzoom: 17,
      },
      satellite: {
        type: "raster" as const,
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Esri World Imagery",
        maxzoom: 18,
      },
      terrarium: {
        type: "raster-dem" as const,
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium" as const,
        tileSize: 256,
        maxzoom: 15,
      },
      "race-route": {
        type: "geojson" as const,
        data: initialRouteData,
      },
    },
    layers: [
      {
        id: "basemap-osm",
        type: "raster" as const,
        source: "osm",
        layout: { visibility: vis("osm") },
        minzoom: 0,
        maxzoom: 22,
      },
      {
        id: "basemap-topo",
        type: "raster" as const,
        source: "topo",
        layout: { visibility: vis("topo") },
        minzoom: 0,
        maxzoom: 22,
      },
      {
        id: "basemap-satellite",
        type: "raster" as const,
        source: "satellite",
        layout: { visibility: vis("satellite") },
        minzoom: 0,
        maxzoom: 22,
      },
      {
        id: "race-route-casing",
        type: "line" as const,
        source: "race-route",
        layout: {
          "line-join": "round" as const,
          "line-cap": "round" as const,
        },
        paint: {
          "line-color": "#FFFFFF",
          "line-width": 7,
          "line-opacity": 0.92,
        },
      },
      {
        id: "race-route-line",
        type: "line" as const,
        source: "race-route",
        layout: {
          "line-join": "round" as const,
          "line-cap": "round" as const,
        },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4.4,
          "line-opacity": 0.98,
        },
      },
    ],
  };
}

function shortLayerLabel(layer: MapLayerId): string {
  if (layer === "topo") return "Topo";
  if (layer === "terrain3d") return "3D";
  if (layer === "satellite") return "Sat";
  return "OSM";
}

export function RouteMapCanvas({
  points,
  checkpoints,
  discipline,
  hideIntermediateMarkers,
  step,
  activeLayer,
  onChangeLayer,
  hoveredPointIndex,
  focusedSegmentIndex,
  addCpMode,
  onExitAddCpMode,
  onSaveCheckpointFromMap,
  mobileFullMap,
  onToggleMobileFullMap,
}: RouteMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreglRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const hoverMarkerRef = useRef<MapLibreMarker | null>(null);
  const draftMarkerRef = useRef<MapLibreMarker | null>(null);
  const addCpModeRef = useRef(addCpMode);
  const mobileFullMapRef = useRef(mobileFullMap);
  const pointsRef = useRef(points);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  // Fullscreen CP Picker draft state
  const totalDistanceKm =
    points.length > 0 ? points[points.length - 1].distFromStartM / 1000 : 1;
  const minKm = 0.1;
  const maxKm = Math.max(0.2, Number((totalDistanceKm - 0.1).toFixed(1)));
  const defaultMidKm = Number(Math.max(minKm, Math.min(maxKm, totalDistanceKm / 2)).toFixed(1));

  const [draftDistStr, setDraftDistStr] = useState(String(defaultMidKm));
  const [draftName, setDraftName] = useState("");
  const [draftStopStr, setDraftStopStr] = useState(discipline === "road" ? "1" : "5");
  const [draftCotStr, setDraftCotStr] = useState("");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  addCpModeRef.current = addCpMode;
  mobileFullMapRef.current = mobileFullMap;
  pointsRef.current = points;

  const draftKm = useMemo(() => {
    const n = Number(draftDistStr.replace(",", "."));
    if (!Number.isFinite(n)) return defaultMidKm;
    return Math.max(minKm, Math.min(maxKm, n));
  }, [draftDistStr, defaultMidKm, minKm, maxKm]);

  const draftTrackPoint = useMemo(() => {
    if (points.length === 0) return null;
    const idx = findTrackPointIndexAtDistance(points, draftKm * 1000);
    return points[idx] ?? null;
  }, [points, draftKm]);

  // Reset draft whenever entering addCpMode
  useEffect(() => {
    if (addCpMode) {
      setDraftDistStr(String(defaultMidKm));
      setDraftName("");
      setDraftStopStr(discipline === "road" ? "1" : "5");
      setDraftCotStr("");
      setSavedNotice(null);
    }
  }, [addCpMode, defaultMidKm, discipline]);

  const routeGeoJson = useMemo(() => buildRouteGeoJson(points), [points]);
  const latestGeoJsonRef = useRef(routeGeoJson);
  latestGeoJsonRef.current = routeGeoJson;

  const computeBoundsPadding = (isAddCp: boolean, isMobileFull: boolean) => {
    if (isAddCp) {
      return { top: 76, right: 68, bottom: 260, left: 48 };
    }
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
    if (isDesktop) {
      return { top: 72, right: 84, bottom: 80, left: 490 };
    }
    if (isMobileFull) {
      return { top: 72, right: 64, bottom: 64, left: 36 };
    }
    // Slim 84px mobile peek strip above Step 3 focus-data drawer
    return { top: 10, right: 148, bottom: 24, left: 16 };
  };

  const fitRouteBounds = (
    map: MapLibreMap,
    pts: TrackPoint[],
    isAddCp = false,
    isMobileFull = false
  ) => {
    if (pts.length < 2) return;
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const p of pts) {
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
    }

    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      {
        padding: computeBoundsPadding(isAddCp, isMobileFull),
        duration: 600,
        maxZoom: 15,
      }
    );
  };

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current) return;
      try {
        const mod = await import("maplibre-gl");
        if (cancelled) return;
        maplibreglRef.current = mod;

        const map = new mod.Map({
          container: containerRef.current,
          style: buildPersistentMapStyle(
            activeLayer,
            latestGeoJsonRef.current
          ) as unknown as import("maplibre-gl").StyleSpecification,
          center: [116.46, -8.38],
          zoom: 11,
          attributionControl: { compact: true },
        });

        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          setMapReady(true);
          const source = map.getSource("race-route") as
            | { setData?: (d: unknown) => void }
            | undefined;
          source?.setData?.(latestGeoJsonRef.current);
          if (pointsRef.current.length >= 2) {
            fitRouteBounds(
              map,
              pointsRef.current,
              addCpModeRef.current,
              mobileFullMapRef.current
            );
          }
        });

        map.on("click", (ev) => {
          if (!addCpModeRef.current || pointsRef.current.length < 2) return;
          const idx = findNearestTrackPointIndex(
            pointsRef.current,
            ev.lngLat.lat,
            ev.lngLat.lng
          );
          const pt = pointsRef.current[idx];
          if (pt) {
            setDraftDistStr((pt.distFromStartM / 1000).toFixed(1));
          }
        });
      } catch {
        if (!cancelled) {
          setMapError(
            "Peta WebGL tidak tersedia di browser ini. Anda tetap dapat mengedit segmen dan menghasilkan strategi pacing di panel."
          );
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize map smoothly whenever visibility / fullscreen mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const timer = setTimeout(() => {
      map.resize();
      if (points.length >= 2) fitRouteBounds(map, points, addCpMode, mobileFullMap);
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mobileFullMap, addCpMode, mapReady]);

  // Switch basemap visibility cleanly without wiping the GPX route source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const osmVis = activeLayer === "osm" || activeLayer === "terrain3d" ? "visible" : "none";
    const topoVis = activeLayer === "topo" ? "visible" : "none";
    const satVis = activeLayer === "satellite" ? "visible" : "none";

    if (map.getLayer("basemap-osm")) map.setLayoutProperty("basemap-osm", "visibility", osmVis);
    if (map.getLayer("basemap-topo")) map.setLayoutProperty("basemap-topo", "visibility", topoVis);
    if (map.getLayer("basemap-satellite")) {
      map.setLayoutProperty("basemap-satellite", "visibility", satVis);
    }

    if (activeLayer === "terrain3d") {
      map.setTerrain({ source: "terrarium", exaggeration: 1.35 });
      map.easeTo({ pitch: 52, duration: 500 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, duration: 400 });
    }
  }, [activeLayer, mapReady]);

  // Always update GeoJSON route line whenever points change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("race-route") as
      | { setData?: (d: unknown) => void }
      | undefined;
    source?.setData?.(routeGeoJson);
  }, [routeGeoJson, mapReady]);

  const routeKey = `${points.length}-${points[0]?.lat.toFixed(5)}-${points[points.length - 1]?.lon.toFixed(5)}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || points.length < 2) return;
    fitRouteBounds(map, points, addCpMode, mobileFullMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, mapReady]);

  // Render saved checkpoint markers (keep 1-KM Road map clean when hideIntermediateMarkers is true)
  useEffect(() => {
    const map = mapRef.current;
    const mod = maplibreglRef.current;
    if (!map || !mod || !mapReady) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    checkpoints.forEach((cp, idx) => {
      const isStart = cp.type === "start";
      const isFinish = cp.type === "finish";
      if (hideIntermediateMarkers && !isStart && !isFinish) {
        return;
      }

      const isSummit = cp.type === "summit";
      const el = document.createElement("div");
      el.className = "flex items-center gap-1 select-none";
      const badgeBg = isStart
        ? "#1E6B3A"
        : isFinish
          ? "#161E19"
          : isSummit
            ? "#B91C1C"
            : "#FFFFFF";
      const badgeFg = isStart || isFinish || isSummit ? "#FFFFFF" : "#161E19";
      const label = isStart ? "S" : isFinish ? "F" : isSummit ? "P" : `${idx}`;

      el.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:${badgeBg};color:${badgeFg};border:2px solid #FFFFFF;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(22,30,25,0.28);">${label}</span>`;
      el.title = `${cp.name} (${(cp.distM / 1000).toFixed(1)} km, ${cp.ele} m)`;

      const marker = new mod.Marker({ element: el, anchor: "center" })
        .setLngLat([cp.lon, cp.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [checkpoints, hideIntermediateMarkers, mapReady]);

  // Live preview pin for Fullscreen Add CP mode
  useEffect(() => {
    const map = mapRef.current;
    const mod = maplibreglRef.current;
    if (!map || !mod || !mapReady) return;

    if (!addCpMode || !draftTrackPoint) {
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      return;
    }

    if (!draftMarkerRef.current) {
      const el = document.createElement("div");
      el.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:#1E6B3A;color:#FFFFFF;border:3px solid #FFFFFF;font-size:16px;font-weight:800;box-shadow:0 4px 12px rgba(22,30,25,0.45);">+</span>`;
      draftMarkerRef.current = new mod.Marker({ element: el, anchor: "center" })
        .setLngLat([draftTrackPoint.lon, draftTrackPoint.lat])
        .addTo(map);
    } else {
      draftMarkerRef.current.setLngLat([draftTrackPoint.lon, draftTrackPoint.lat]);
    }
  }, [addCpMode, draftTrackPoint, mapReady]);

  // Sync hover point marker with ElevationProfileChart
  useEffect(() => {
    const map = mapRef.current;
    const mod = maplibreglRef.current;
    if (!map || !mod || !mapReady) return;

    if (hoveredPointIndex === null || !points[hoveredPointIndex]) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }

    const pt = points[hoveredPointIndex];
    if (!hoverMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "999px";
      el.style.background = "#1E6B3A";
      el.style.border = "3px solid #FFFFFF";
      el.style.boxShadow = "0 2px 6px rgba(22,30,25,0.4)";
      hoverMarkerRef.current = new mod.Marker({ element: el, anchor: "center" })
        .setLngLat([pt.lon, pt.lat])
        .addTo(map);
    } else {
      hoverMarkerRef.current.setLngLat([pt.lon, pt.lat]);
    }
  }, [hoveredPointIndex, points, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || focusedSegmentIndex === null) return;
    const fromCp = checkpoints[focusedSegmentIndex];
    const toCp = checkpoints[focusedSegmentIndex + 1];
    if (!fromCp || !toCp) return;

    const minLon = Math.min(fromCp.lon, toCp.lon);
    const maxLon = Math.max(fromCp.lon, toCp.lon);
    const minLat = Math.min(fromCp.lat, toCp.lat);
    const maxLat = Math.max(fromCp.lat, toCp.lat);

    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      {
        padding: computeBoundsPadding(addCpMode, mobileFullMap),
        duration: 550,
        maxZoom: 15,
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedSegmentIndex, checkpoints, mapReady]);

  const handleSaveMapDraft = () => {
    const stopMinutes = Math.max(0, Math.min(120, Math.round(Number(draftStopStr) || 0)));
    const cotVal = Number(draftCotStr.replace(",", "."));
    const cutoffHours =
      draftCotStr.trim() !== "" && Number.isFinite(cotVal) && cotVal > 0
        ? cotVal
        : undefined;
    const finalName =
      draftName.trim() ||
      (discipline === "road"
        ? `WS (${draftKm.toFixed(1)} km)`
        : `CP (${draftKm.toFixed(1)} km)`);

    onSaveCheckpointFromMap({
      distanceKm: draftKm,
      name: finalName,
      stopMinutes,
      cutoffHours,
    });

    setSavedNotice(`Tersimpan: ${finalName} (KM ${draftKm.toFixed(1)})`);
    setDraftName("");
    setDraftCotStr("");
  };

  const layerOptions: Array<{ id: MapLayerId; label: string }> = [
    { id: "osm", label: "OSM" },
    { id: "topo", label: "Topo" },
    { id: "terrain3d", label: "3D" },
    { id: "satellite", label: "Satelit" },
  ];

  return (
    <div
      className={`relative h-full w-full bg-[#E8EFE9] ${addCpMode ? "cursor-crosshair" : ""} ${
        !mobileFullMap && !addCpMode
          ? "[&_.maplibregl-ctrl-bottom-right]:hidden lg:[&_.maplibregl-ctrl-bottom-right]:block"
          : ""
      }`}
      aria-label="Peta interaktif rute race"
    >
      <div ref={containerRef} className="h-full w-full" />

      {mapError && (
        <div className="absolute inset-x-4 top-20 z-20 mx-auto max-w-md rounded-xl border border-[#E2E5E2] bg-white p-4 text-sm text-[#161E19] shadow-md lg:left-[480px] lg:right-auto">
          <p className="font-semibold">Mode Ringan Tanpa WebGL</p>
          <p className="mt-1 text-xs text-[#525C56]">{mapError}</p>
        </div>
      )}

      {/* Fullscreen Add-CP Instruction Header Bar */}
      {addCpMode && (
        <div className="no-print absolute left-3 top-3 z-30 flex max-w-[calc(100vw-88px)] items-center gap-2 rounded-full border border-[#E2E5E2] bg-white/95 px-3.5 py-2 shadow-md">
          <IconPin size={15} className="shrink-0 text-[#1E6B3A]" />
          <span className="truncate text-xs font-semibold text-[#161E19]">
            Ketuk rute di peta atau geser jarak KM
          </span>
        </div>
      )}

      {/* Top-right control cluster */}
      <div className="no-print absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
        {/* Mobile Full-Map Toggle Pill (hidden during addCpMode because Selesai is inside mini-drawer) */}
        {!addCpMode && (
          <button
            type="button"
            onClick={onToggleMobileFullMap}
            className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E2E5E2] bg-white/95 px-3.5 text-xs font-semibold text-[#161E19] shadow-sm hover:bg-[#F5F5F3] lg:hidden"
          >
            <IconMap size={14} />
            {mobileFullMap ? "Kembali ke Data" : "Lihat Peta Penuh"}
          </button>
        )}

        {/* Layer Switcher & Zoom Controls: hidden in slim 64px mobile peek strip, visible on desktop and fullscreen */}
        <div
          className={`${
            mobileFullMap || addCpMode ? "flex" : "hidden lg:flex"
          } flex-col items-end gap-2`}
        >
          {/* Expandable Layer Switcher + Circular Toggle */}
          <div className="flex items-center gap-1.5">
            {layerMenuOpen && (
              <div
                className="flex items-center gap-1 rounded-full border border-[#E2E5E2] bg-white/95 p-1 shadow-md"
                role="group"
                aria-label="Pilih tipe peta"
              >
                {layerOptions.map((opt) => {
                  const active = activeLayer === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChangeLayer(opt.id);
                        setLayerMenuOpen(false);
                      }}
                      aria-pressed={active}
                      className={`min-h-[34px] whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors ${
                        active
                          ? "bg-[#1B2B22] text-white"
                          : "text-[#161E19] hover:bg-[#F5F5F3]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setLayerMenuOpen((v) => !v)}
              aria-expanded={layerMenuOpen}
              aria-label="Pilih tipe peta (OSM, Topo, 3D, Satelit)"
              className={`flex h-11 w-11 items-center justify-center rounded-full border text-[11px] font-bold shadow-sm transition-colors ${
                layerMenuOpen
                  ? "border-[#1B2B22] bg-[#1B2B22] text-white"
                  : "border-[#E2E5E2] bg-white/95 text-[#161E19] hover:bg-[#F5F5F3]"
              }`}
            >
              {shortLayerLabel(activeLayer)}
            </button>
          </div>

          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
            aria-label="Perbesar peta"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E5E2] bg-white/95 text-[#161E19] shadow-sm hover:bg-[#F5F5F3]"
          >
            <IconPlus size={18} />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
            aria-label="Perkecil peta"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E5E2] bg-white/95 text-[#161E19] shadow-sm hover:bg-[#F5F5F3]"
          >
            <IconMinus size={18} />
          </button>
        </div>
      </div>

      {/* Fullscreen Map CP Picker Overlay Mini-Drawer (stays open across Simpan CP until Selesai) */}
      {addCpMode && (
        <div className="no-print absolute inset-x-3 bottom-3 z-30 mx-auto max-w-lg rounded-2xl border border-[#E2E5E2] bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-[#E2E5E2] pb-2.5">
            <div>
              <p className="text-xs font-bold text-[#161E19]">
                Tambah CP di Peta · {checkpoints.length} CP di rute
              </p>
              <p className="font-num text-[11px] text-[#525C56]">
                Titik pin: KM {draftKm.toFixed(1)} ·{" "}
                {draftTrackPoint ? `${Math.round(draftTrackPoint.ele)} mdpl` : "-"}
              </p>
            </div>
            <button
              type="button"
              onClick={onExitAddCpMode}
              className="min-h-[36px] rounded-lg bg-[#1B2B22] px-3.5 text-xs font-semibold text-white hover:bg-[#161E19]"
            >
              Selesai
            </button>
          </div>

          {savedNotice && (
            <div
              role="status"
              className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#EAF6F0] px-2.5 py-1.5 text-[11px] font-semibold text-[#146342]"
            >
              <IconCheck size={13} />
              <span>{savedNotice} · Silakan pilih titik lagi atau tekan Selesai.</span>
            </div>
          )}

          <div className="mt-3 space-y-2.5">
            {/* Exact Distance KM Input + Slider snapping preview pin live */}
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="map-cp-km" className="font-semibold text-[#161E19]">
                  Jarak Tepat (KM)
                </label>
                <span className="font-num text-[#525C56]">
                  0.1 - {maxKm.toFixed(1)} km
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="map-cp-km"
                  type="text"
                  inputMode="decimal"
                  value={draftDistStr}
                  onChange={(e) =>
                    setDraftDistStr(e.target.value.replace(/[^0-9.,]/g, ""))
                  }
                  onBlur={() => setDraftDistStr(draftKm.toFixed(1))}
                  className="font-num min-h-[38px] w-24 shrink-0 rounded-lg border border-[#8C948E] bg-white px-2 text-center text-xs font-bold text-[#161E19]"
                />
                <input
                  aria-label="Geser posisi tepat CP di rute (KM)"
                  type="range"
                  min={minKm}
                  max={maxKm}
                  step={0.1}
                  value={draftKm}
                  onChange={(e) => setDraftDistStr(Number(e.target.value).toFixed(1))}
                  className="h-2.5 w-full accent-[#1E6B3A]"
                />
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <label
                  htmlFor="map-cp-name"
                  className="block text-[10px] font-semibold text-[#161E19]"
                >
                  Nama CP
                </label>
                <input
                  id="map-cp-name"
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={`WS (${draftKm.toFixed(1)} km)`}
                  className="mt-0.5 min-h-[38px] w-full rounded-lg border border-[#8C948E] bg-white px-2.5 text-xs text-[#161E19]"
                />
              </div>
              <div className="col-span-3">
                <label
                  htmlFor="map-cp-stop"
                  className="block text-[10px] font-semibold text-[#161E19]"
                >
                  Stop (mnt)
                </label>
                <input
                  id="map-cp-stop"
                  type="text"
                  inputMode="numeric"
                  value={draftStopStr}
                  onChange={(e) =>
                    setDraftStopStr(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  className="font-num mt-0.5 min-h-[38px] w-full rounded-lg border border-[#8C948E] bg-white px-2 text-center text-xs text-[#161E19]"
                />
              </div>
              <div className="col-span-3">
                <label
                  htmlFor="map-cp-cot"
                  className="block text-[10px] font-semibold text-[#161E19]"
                >
                  COT (jam)
                </label>
                <input
                  id="map-cp-cot"
                  type="text"
                  inputMode="decimal"
                  placeholder="-"
                  value={draftCotStr}
                  onChange={(e) =>
                    setDraftCotStr(e.target.value.replace(/[^0-9.,]/g, ""))
                  }
                  className="font-num mt-0.5 min-h-[38px] w-full rounded-lg border border-[#8C948E] bg-white px-2 text-center text-xs text-[#161E19]"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveMapDraft}
              className="min-h-[42px] w-full rounded-xl bg-[#1E6B3A] px-4 text-xs font-semibold text-white hover:bg-[#146342]"
            >
              Simpan CP ke Daftar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
