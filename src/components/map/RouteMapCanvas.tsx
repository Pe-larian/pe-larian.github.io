"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { IconMap, IconMinus, IconPin, IconPlus } from "@/components/Icons";
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
  step,
  activeLayer,
  onChangeLayer,
  hoveredPointIndex,
  focusedSegmentIndex,
  addCpMode,
  onToggleAddCpMode,
  onAddCheckpointAtLatLon,
  mobileFullMap,
  onToggleMobileFullMap,
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
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  addCpModeRef.current = addCpMode;
  onAddCpRef.current = onAddCheckpointAtLatLon;

  const routeGeoJson = useMemo(() => buildRouteGeoJson(points), [points]);
  const latestGeoJsonRef = useRef(routeGeoJson);
  latestGeoJsonRef.current = routeGeoJson;

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
          ? { top: 72, right: 84, bottom: 80, left: 490 }
          : { top: 44, right: 56, bottom: 52, left: 32 },
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

  // Resize map smoothly whenever mobile view switches or Step 1 -> Step 2 reveals the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const timer = setTimeout(() => {
      map.resize();
      if (points.length >= 2) fitRouteBounds(map, points);
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mobileFullMap, mapReady]);

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
    fitRouteBounds(map, points);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, mapReady]);

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

    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      {
        padding: isDesktop
          ? { top: 90, right: 90, bottom: 90, left: 490 }
          : { top: 44, right: 56, bottom: 52, left: 32 },
        duration: 550,
        maxZoom: 15,
      }
    );
  }, [focusedSegmentIndex, checkpoints, mapReady]);

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
        <div className="absolute inset-x-4 top-20 z-20 mx-auto max-w-md rounded-xl border border-[#E2E5E2] bg-white p-4 text-sm text-[#161E19] shadow-md lg:left-[480px] lg:right-auto">
          <p className="font-semibold">Mode Ringan Tanpa WebGL</p>
          <p className="mt-1 text-xs text-[#525C56]">{mapError}</p>
        </div>
      )}

      {/* Top-right control cluster matching Section 1.pdf */}
      <div className="no-print absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
        {/* Mobile Full-Map Toggle Pill */}
        <button
          type="button"
          onClick={onToggleMobileFullMap}
          className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E2E5E2] bg-white/95 px-3.5 text-xs font-semibold text-[#161E19] shadow-sm hover:bg-[#F5F5F3] lg:hidden"
        >
          <IconMap size={14} />
          {mobileFullMap ? "Kembali ke Panel" : "Lihat Peta Penuh"}
        </button>

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

        {/* Zoom + / - Circular Controls */}
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

      {/* Bottom-right dark pill: Tambah CP di Peta (Step 2 & Step 3) */}
      {step >= 2 && (
        <div className="no-print absolute bottom-3 right-3 z-20">
          <button
            type="button"
            onClick={onToggleAddCpMode}
            aria-pressed={addCpMode}
            className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-xs font-semibold shadow-md transition-colors ${
              addCpMode
                ? "bg-[#1E6B3A] text-white"
                : "bg-[#1B2B22] text-white hover:bg-[#161E19]"
            }`}
          >
            <IconPin size={14} />
            {addCpMode ? "Klik rute di peta..." : "Tambah CP di Peta"}
          </button>
        </div>
      )}
    </div>
  );
}
