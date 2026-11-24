"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import {
  IconDownload,
  IconLocate,
  IconMinus,
  IconMountain,
  IconPin,
  IconPlus,
  IconUndo,
} from "@/components/Icons";
import type { Checkpoint, MapLayerId, TrackPoint } from "@/lib/race-engine/types";

interface RouteMapCanvasProps {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  step: 1 | 2 | 3;
  activeLayer: MapLayerId;
  onChangeLayer: (layer: MapLayerId) => void;
  hoveredPointIndex: number | null;
  focusedSegmentIndex: number | null;
  addCpMode: boolean;
  onToggleAddCpMode: () => void;
  onAddCheckpointAtLatLon: (lat: number, lon: number) => void;
  onCleanSpikes: () => void;
  spikesDetected: number;
  onCalibrateDem: () => void;
  demLoading: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onExportGpx: () => void;
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

function buildRasterStyle(layer: MapLayerId) {
  const tileConfig =
    layer === "topo"
      ? {
          tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
          attribution: "Map data: OpenStreetMap contributors, SRTM | Style: OpenTopoMap",
          maxzoom: 17,
        }
      : layer === "satellite"
        ? {
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            attribution: "Imagery: Esri World Imagery",
            maxzoom: 18,
          }
        : {
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            attribution: "OpenStreetMap contributors",
            maxzoom: 19,
          };

  const sources: Record<string, unknown> = {
    basemap: {
      type: "raster",
      tiles: tileConfig.tiles,
      tileSize: 256,
      attribution: tileConfig.attribution,
      maxzoom: tileConfig.maxzoom,
    },
  };

  if (layer === "terrain3d") {
    sources.terrarium = {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 15,
    };
  }

  return {
    version: 8 as const,
    sources,
    layers: [
      {
        id: "basemap-layer",
        type: "raster" as const,
        source: "basemap",
        minzoom: 0,
        maxzoom: 22,
      },
    ],
    ...(layer === "terrain3d"
      ? {
          terrain: {
            source: "terrarium",
            exaggeration: 1.35,
          },
        }
      : {}),
  };
}

export function RouteMapCanvas({
  points,
  checkpoints,
  step,
  activeLayer,
  onChangeLayer,
  hoveredPointIndex,
  focusedSegmentIndex,
  addCpMode,
  onToggleAddCpMode,
  onAddCheckpointAtLatLon,
  onCleanSpikes,
  spikesDetected,
  onCalibrateDem,
  demLoading,
  canUndo,
  onUndo,
  onExportGpx,
}: RouteMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreglRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const hoverMarkerRef = useRef<MapLibreMarker | null>(null);
  const addCpModeRef = useRef(addCpMode);
  const onAddCpRef = useRef(onAddCheckpointAtLatLon);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isTilted3D, setIsTilted3D] = useState(false);

  addCpModeRef.current = addCpMode;
  onAddCpRef.current = onAddCheckpointAtLatLon;

  const routeGeoJson = useMemo(() => buildRouteGeoJson(points), [points]);

  const syncRouteLayers = (map: MapLibreMap, data: ReturnType<typeof buildRouteGeoJson>) => {
    if (!map.isStyleLoaded()) return;

    const existing = map.getSource("race-route") as
      | { setData?: (d: unknown) => void }
      | undefined;

    if (existing && typeof existing.setData === "function") {
      existing.setData(data);
    } else {
      map.addSource("race-route", {
        type: "geojson",
        data,
      } as unknown as Parameters<MapLibreMap["addSource"]>[1]);

      map.addLayer({
        id: "race-route-casing",
        type: "line",
        source: "race-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#FFFFFF",
          "line-width": 7,
          "line-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "race-route-line",
        type: "line",
        source: "race-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4.2,
          "line-opacity": 0.96,
        },
      });
    }
  };

  const fitRouteBounds = (map: MapLibreMap, pts: TrackPoint[]) => {
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
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      {
        padding: isDesktop
          ? { top: 72, right: 80, bottom: 96, left: 460 }
          : { top: 48, right: 40, bottom: 48, left: 40 },
        duration: 600,
        maxZoom: 14.5,
      }
    );
  };

  // Initialize MapLibre once on mount
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
          style: buildRasterStyle(activeLayer) as unknown as import("maplibre-gl").StyleSpecification,
          center: [116.46, -8.38],
          zoom: 11,
          attributionControl: { compact: true },
        });

        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          setMapReady(true);
          syncRouteLayers(map, buildRouteGeoJson(points));
          if (points.length >= 2) {
            fitRouteBounds(map, points);
          }
        });

        map.on("click", (ev) => {
          if (!addCpModeRef.current) return;
          onAddCpRef.current(ev.lngLat.lat, ev.lngLat.lng);
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
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch basemap layer cleanly and re-attach route GeoJSON
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    map.setStyle(buildRasterStyle(activeLayer) as unknown as import("maplibre-gl").StyleSpecification);
    const onStyleLoad = () => {
      syncRouteLayers(map, routeGeoJson);
      if (activeLayer === "terrain3d") {
        map.easeTo({ pitch: 52, duration: 500 });
        setIsTilted3D(true);
      } else {
        map.easeTo({ pitch: 0, duration: 400 });
        setIsTilted3D(false);
      }
    };
    map.once("style.load", onStyleLoad);
  }, [activeLayer, mapReady, routeGeoJson]);

  // Update GeoJSON source whenever points change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.isStyleLoaded()) {
      syncRouteLayers(map, routeGeoJson);
    }
  }, [routeGeoJson, mapReady]);

  // Fit bounds when route changes length significantly (new upload/sample)
  const routeKey = `${points.length}-${points[0]?.lat.toFixed(4)}-${points[points.length - 1]?.lon.toFixed(4)}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || points.length < 2) return;
    fitRouteBounds(map, points);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, mapReady]);

  // Render checkpoint markers
  useEffect(() => {
    const map = mapRef.current;
    const mod = maplibreglRef.current;
    if (!map || !mod || !mapReady) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    checkpoints.forEach((cp, idx) => {
      const el = document.createElement("div");
      const isStart = cp.type === "start";
      const isFinish = cp.type === "finish";
      const isSummit = cp.type === "summit";

      el.className = "flex items-center gap-1 select-none";
      const badgeBg = isStart
        ? "#1E6B3A"
        : isFinish
          ? "#161E19"
          : isSummit
            ? "#B91C1C"
            : "#FFFFFF";
      const badgeFg = isStart || isFinish || isSummit ? "#FFFFFF" : "#161E19";
      const label = isStart
        ? "S"
        : isFinish
          ? "F"
          : isSummit
            ? "P"
            : `${idx}`;

      el.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:${badgeBg};color:${badgeFg};border:2px solid #FFFFFF;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(22,30,25,0.28);">${label}</span>`;
      el.title = `${cp.name} (${(cp.distM / 1000).toFixed(1)} km, ${cp.ele} m)`;

      const marker = new mod.Marker({ element: el, anchor: "center" })
        .setLngLat([cp.lon, cp.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [checkpoints, mapReady]);

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

  // Fly to focused segment when user clicks a segment card
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

    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      {
        padding: isDesktop
          ? { top: 90, right: 90, bottom: 110, left: 470 }
          : { top: 50, right: 40, bottom: 50, left: 40 },
        duration: 550,
        maxZoom: 14.5,
      }
    );
  }, [focusedSegmentIndex, checkpoints, mapReady]);

  const handleToggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    if (isTilted3D) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
      setIsTilted3D(false);
    } else {
      if (activeLayer !== "terrain3d") {
        onChangeLayer("terrain3d");
      } else {
        map.easeTo({ pitch: 52, duration: 450 });
        setIsTilted3D(true);
      }
    }
  };

  const layerOptions: Array<{ id: MapLayerId; label: string }> = [
    { id: "osm", label: "OSM" },
    { id: "topo", label: "Topo" },
    { id: "terrain3d", label: "3D" },
    { id: "satellite", label: "Satelit" },
  ];

  return (
    <div
      className={`relative h-full w-full bg-[#E8EFE9] ${addCpMode ? "cursor-crosshair" : ""}`}
      aria-label="Peta interaktif rute race"
    >
      <div ref={containerRef} className="h-full w-full" />

      {mapError && (
        <div className="absolute inset-x-4 top-20 z-20 mx-auto max-w-md rounded-xl border border-[#E2E5E2] bg-white p-4 text-sm text-[#161E19] shadow-md lg:left-[440px] lg:right-auto">
          <p className="font-semibold">Mode Ringan Tanpa WebGL</p>
          <p className="mt-1 text-xs text-[#525C56]">{mapError}</p>
        </div>
      )}

      {/* Top-right floating layer switcher (zero top navbar) */}
      <div
        className="no-print absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full border border-[#E2E5E2] bg-white/95 p-1 shadow-sm"
        role="group"
        aria-label="Pilih gaya peta"
      >
        {layerOptions.map((opt) => {
          const active = activeLayer === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChangeLayer(opt.id)}
              aria-pressed={active}
              className={`min-h-[36px] rounded-full px-3 text-xs font-semibold transition-colors ${
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

      {/* Right-edge circular map controls */}
      <div className="no-print absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        <button
          type="button"
          onClick={handleToggle3D}
          aria-label="Toggle tampilan 3D"
          aria-pressed={isTilted3D}
          className={`flex h-11 w-11 items-center justify-center rounded-full border text-xs font-bold shadow-sm transition-colors ${
            isTilted3D
              ? "border-[#1B2B22] bg-[#1B2B22] text-white"
              : "border-[#E2E5E2] bg-white text-[#161E19] hover:bg-[#F5F5F3]"
          }`}
        >
          3D
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
          aria-label="Perbesar peta"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E5E2] bg-white text-[#161E19] shadow-sm hover:bg-[#F5F5F3]"
        >
          <IconPlus size={18} />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
          aria-label="Perkecil peta"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E5E2] bg-white text-[#161E19] shadow-sm hover:bg-[#F5F5F3]"
        >
          <IconMinus size={18} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (mapRef.current && points.length >= 2) {
              fitRouteBounds(mapRef.current, points);
            }
          }}
          aria-label="Pusatkan ke seluruh rute"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E5E2] bg-white text-[#161E19] shadow-sm hover:bg-[#F5F5F3]"
        >
          <IconLocate size={18} />
        </button>
      </div>

      {/* Step 2 floating GPX editor toolbar over bottom map canvas */}
      {step === 2 && (
        <div className="no-print absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#E2E5E2] bg-white/95 px-2.5 py-1.5 shadow-md lg:left-[calc(50%+200px)] lg:flex">
          <button
            type="button"
            onClick={onToggleAddCpMode}
            aria-pressed={addCpMode}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
              addCpMode
                ? "bg-[#1E6B3A] text-white"
                : "text-[#161E19] hover:bg-[#F5F5F3]"
            }`}
          >
            <IconPin size={14} />
            {addCpMode ? "Klik rute di peta..." : "Tambah CP di Peta"}
          </button>

          <span className="h-5 w-px bg-[#E2E5E2]" aria-hidden="true" />

          <button
            type="button"
            onClick={onCleanSpikes}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#161E19] hover:bg-[#F5F5F3]"
          >
            Rapikan spike
            {spikesDetected > 0 && (
              <span className="font-num rounded-full bg-[#FDF3E3] px-1.5 py-0.5 text-[10px] font-bold text-[#8A4B00]">
                {spikesDetected}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onCalibrateDem}
            disabled={demLoading}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#161E19] hover:bg-[#F5F5F3] disabled:opacity-50"
          >
            <IconMountain size={14} />
            {demLoading ? "Kalibrasi..." : "Kalibrasi DEM"}
          </button>

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-[#161E19] hover:bg-[#F5F5F3] disabled:opacity-40"
          >
            <IconUndo size={14} />
            Undo
          </button>

          <span className="h-5 w-px bg-[#E2E5E2]" aria-hidden="true" />

          <button
            type="button"
            onClick={onExportGpx}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#1B2B22] px-3.5 text-xs font-semibold text-white hover:bg-[#161E19]"
          >
            <IconDownload size={14} />
            Export .gpx
          </button>
        </div>
      )}

      {/* Step 3 compact slope legend over bottom-right map */}
      {step === 3 && (
        <div className="no-print absolute bottom-9 right-3 z-20 hidden items-center gap-3 rounded-full border border-[#E2E5E2] bg-white/95 px-3 py-1.5 text-[11px] font-medium text-[#161E19] shadow-sm sm:flex">
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
