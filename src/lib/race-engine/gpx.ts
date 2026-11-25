import type {
  Checkpoint,
  CheckpointType,
  GpxCleaningStats,
  RaceDiscipline,
  TerrainCategory,
  TrackPoint,
} from "./types";

const EARTH_RADIUS_M = 6371000;

export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function recomputeTrackMetrics(
  points: Array<{ lat: number; lon: number; ele: number; rawEle?: number }>
): TrackPoint[] {
  if (points.length === 0) return [];
  const result: TrackPoint[] = [];
  let cumulativeDist = 0;

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      const horiz = haversineDistanceM(prev.lat, prev.lon, curr.lat, curr.lon);
      const dEle = curr.ele - prev.ele;
      const dist3d = Math.sqrt(horiz * horiz + dEle * dEle);
      cumulativeDist += dist3d;
    }
    result.push({
      lat: curr.lat,
      lon: curr.lon,
      ele: curr.ele,
      rawEle: curr.rawEle ?? curr.ele,
      distFromStartM: cumulativeDist,
      gradePct: 0,
    });
  }

  for (let i = 0; i < result.length; i++) {
    const prevIdx = Math.max(0, i - 1);
    const nextIdx = Math.min(result.length - 1, i + 1);
    const dDist = result[nextIdx].distFromStartM - result[prevIdx].distFromStartM;
    const dEle = result[nextIdx].ele - result[prevIdx].ele;
    const rawGrade = dDist > 2 ? (dEle / dDist) * 100 : 0;
    result[i].gradePct = Math.max(-45, Math.min(45, rawGrade));
  }

  return result;
}

export function computeElevationTotals(
  points: TrackPoint[],
  useRaw = false
): { gainM: number; lossM: number; minEleM: number; maxEleM: number } {
  if (points.length === 0) {
    return { gainM: 0, lossM: 0, minEleM: 0, maxEleM: 0 };
  }
  let gainM = 0;
  let lossM = 0;
  let minEleM = Infinity;
  let maxEleM = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const ele = useRaw ? points[i].rawEle : points[i].ele;
    if (ele < minEleM) minEleM = ele;
    if (ele > maxEleM) maxEleM = ele;
    if (i > 0) {
      const prevEle = useRaw ? points[i - 1].rawEle : points[i - 1].ele;
      const delta = ele - prevEle;
      if (delta > 0) gainM += delta;
      else lossM += Math.abs(delta);
    }
  }

  return {
    gainM: Math.round(gainM),
    lossM: Math.round(lossM),
    minEleM: Math.round(minEleM),
    maxEleM: Math.round(maxEleM),
  };
}

/**
 * Detect GPS teleport spikes and abrupt barometric altitude glitches.
 */
export function detectSpikes(points: TrackPoint[]): number[] {
  if (points.length < 3) return [];
  const spikeIndices: number[] = [];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dPrevCurr = haversineDistanceM(prev.lat, prev.lon, curr.lat, curr.lon);
    const dCurrNext = haversineDistanceM(curr.lat, curr.lon, next.lat, next.lon);
    const dPrevNext = haversineDistanceM(prev.lat, prev.lon, next.lat, next.lon);

    const isGeoTeleport =
      dPrevCurr > 250 && dCurrNext > 250 && dPrevNext < Math.min(dPrevCurr, dCurrNext) * 0.5;

    const avgNeighborEle = (prev.ele + next.ele) / 2;
    const eleJump = Math.abs(curr.ele - avgNeighborEle);
    const isEleSpike = eleJump > 65;

    if (isGeoTeleport || isEleSpike) {
      spikeIndices.push(i);
    }
  }

  return spikeIndices;
}

export function cleanSpikes(points: TrackPoint[]): {
  points: TrackPoint[];
  removedCount: number;
} {
  const spikes = new Set(detectSpikes(points));
  if (spikes.size === 0) {
    return { points, removedCount: 0 };
  }
  const filtered = points.filter((_, idx) => !spikes.has(idx));
  return {
    points: recomputeTrackMetrics(filtered),
    removedCount: spikes.size,
  };
}

/**
 * Weighted moving-window elevation smoother (triangular Savitzky-style kernel)
 * to strip barometric micro-jitter while preserving real summits and saddles.
 */
export function smoothElevation(points: TrackPoint[], windowSize: number): TrackPoint[] {
  const safeWindow = Math.max(1, Math.min(15, Math.floor(windowSize)));
  if (safeWindow <= 1 || points.length < 3) {
    return recomputeTrackMetrics(
      points.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.rawEle, rawEle: p.rawEle }))
    );
  }
  const half = Math.floor(safeWindow / 2);
  const smoothed = points.map((pt, i) => {
    if (i === 0 || i === points.length - 1) {
      return { lat: pt.lat, lon: pt.lon, ele: pt.rawEle, rawEle: pt.rawEle };
    }
    let weightedSum = 0;
    let totalWeight = 0;
    for (let offset = -half; offset <= half; offset++) {
      const idx = Math.max(0, Math.min(points.length - 1, i + offset));
      const weight = half + 1 - Math.abs(offset);
      weightedSum += points[idx].rawEle * weight;
      totalWeight += weight;
    }
    return {
      lat: pt.lat,
      lon: pt.lon,
      ele: weightedSum / totalWeight,
      rawEle: pt.rawEle,
    };
  });

  return recomputeTrackMetrics(smoothed);
}

export function trimRoutePoints(
  points: TrackPoint[],
  startIdx: number,
  endIdx: number
): TrackPoint[] {
  const safeStart = Math.max(0, Math.min(points.length - 2, startIdx));
  const safeEnd = Math.max(safeStart + 1, Math.min(points.length - 1, endIdx));
  return recomputeTrackMetrics(points.slice(safeStart, safeEnd + 1));
}

export function findNearestTrackPointIndex(
  points: TrackPoint[],
  lat: number,
  lon: number
): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversineDistanceM(points[i].lat, points[i].lon, lat, lon);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function findTrackPointIndexAtDistance(
  points: TrackPoint[],
  distM: number
): number {
  if (points.length === 0) return 0;
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < points.length; i++) {
    const diff = Math.abs(points[i].distFromStartM - distM);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function inferTerrainFromGrade(
  avgGradePct: number,
  discipline: RaceDiscipline
): TerrainCategory {
  if (discipline === "road") return "road";
  if (avgGradePct >= 14) return "scree";
  if (avgGradePct >= 8) return "climb";
  if (avgGradePct <= -10) return "descent";
  return "singletrack";
}

export function buildAutoCheckpoints(
  points: TrackPoint[],
  discipline: RaceDiscipline,
  existingWaypoints: Array<{ name: string; lat: number; lon: number; desc?: string }> = []
): Checkpoint[] {
  if (points.length < 2) return [];
  const totalDistM = points[points.length - 1].distFromStartM;

  const startPt = points[0];
  const finishPt = points[points.length - 1];

  const middleCps: Checkpoint[] = [];

  if (existingWaypoints.length > 0) {
    for (let i = 0; i < existingWaypoints.length; i++) {
      const wp = existingWaypoints[i];
      const ptIdx = findNearestTrackPointIndex(points, wp.lat, wp.lon);
      const pt = points[ptIdx];
      if (pt.distFromStartM < 400 || pt.distFromStartM > totalDistM - 400) continue;

      const lower = wp.name.toLowerCase();
      let type: CheckpointType = "aid";
      if (lower.includes("summit") || lower.includes("puncak")) type = "summit";
      else if (lower.includes("drop") || lower.includes("pelawangan") || lower.includes("plawangan"))
        type = "dropbag";
      else if (lower.includes("water") || lower.includes("ws")) type = "water";

      middleCps.push({
        id: `cp-wpt-${i + 1}`,
        name: wp.name,
        type,
        distM: pt.distFromStartM,
        pointIndex: ptIdx,
        lat: pt.lat,
        lon: pt.lon,
        ele: Math.round(pt.ele),
        plannedStopSec: type === "dropbag" ? 600 : type === "summit" ? 180 : 300,
        terrainAfter: discipline === "road" ? "road" : "singletrack",
        services:
          type === "dropbag"
            ? ["Air", "Isotonik", "Makanan hangat", "Drop bag"]
            : type === "water"
              ? ["Air", "Isotonik"]
              : ["Air", "Buah", "Medis"],
        notes: wp.desc,
      });
    }
  } else {
    const count = totalDistM >= 45000 ? 3 : totalDistM >= 18000 ? 2 : 1;
    for (let k = 1; k <= count; k++) {
      const targetDist = (totalDistM / (count + 1)) * k;
      const ptIdx = findTrackPointIndexAtDistance(points, targetDist);
      const pt = points[ptIdx];
      middleCps.push({
        id: `cp-auto-${k}`,
        name: `CP${k} (${(pt.distFromStartM / 1000).toFixed(1)} km)`,
        type: k === Math.ceil(count / 2) && discipline === "trail" ? "dropbag" : "aid",
        distM: pt.distFromStartM,
        pointIndex: ptIdx,
        lat: pt.lat,
        lon: pt.lon,
        ele: Math.round(pt.ele),
        plannedStopSec: discipline === "road" ? 45 : 300,
        terrainAfter: discipline === "road" ? "road" : "singletrack",
        services: discipline === "road" ? ["Air", "Isotonik"] : ["Air", "Isotonik", "Makanan"],
      });
    }
  }

  middleCps.sort((a, b) => a.distM - b.distM);

  const all: Checkpoint[] = [
    {
      id: "cp-start",
      name: "Start",
      type: "start",
      distM: 0,
      pointIndex: 0,
      lat: startPt.lat,
      lon: startPt.lon,
      ele: Math.round(startPt.ele),
      plannedStopSec: 0,
      terrainAfter: discipline === "road" ? "road" : "singletrack",
      services: ["Start Gate"],
    },
    ...middleCps,
    {
      id: "cp-finish",
      name: "Finish",
      type: "finish",
      distM: totalDistM,
      pointIndex: points.length - 1,
      lat: finishPt.lat,
      lon: finishPt.lon,
      ele: Math.round(finishPt.ele),
      plannedStopSec: 0,
      terrainAfter: discipline === "road" ? "road" : "singletrack",
      services: ["Finish Line", "Medis"],
    },
  ];

  // Infer terrain per segment based on actual elevation profile
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i];
    const b = all[i + 1];
    const dM = Math.max(1, b.distM - a.distM);
    const avgGrade = ((b.ele - a.ele) / dM) * 100;
    all[i].terrainAfter = inferTerrainFromGrade(avgGrade, discipline);
  }

  return all;
}

/**
 * Generates system-divided route segments purely from distance and elevation profile,
 * kept independent from user-edited custom checkpoints so users can switch freely.
 */
export function buildSystemSegmentsCheckpoints(
  points: TrackPoint[],
  discipline: RaceDiscipline
): Checkpoint[] {
  if (points.length < 2) return [];
  const totalDistM = points[points.length - 1].distFromStartM;

  const startPt = points[0];
  const finishPt = points[points.length - 1];
  const nodes: Checkpoint[] = [
    {
      id: "sys-start",
      name: "Start",
      type: "start",
      distM: 0,
      pointIndex: 0,
      lat: startPt.lat,
      lon: startPt.lon,
      ele: Math.round(startPt.ele),
      plannedStopSec: 0,
      terrainAfter: discipline === "road" ? "road" : "singletrack",
      services: ["Start Gate"],
    },
  ];

  if (discipline === "road") {
    const stepKmCount = Math.floor(totalDistM / 1000);
    for (let km = 1; km <= stepKmCount; km++) {
      const targetM = km * 1000;
      if (totalDistM - targetM < 150) break;
      const ptIdx = findTrackPointIndexAtDistance(points, targetM);
      const pt = points[ptIdx];
      nodes.push({
        id: `sys-seg-${km}`,
        name: `KM ${km}`,
        type: "aid",
        distM: pt.distFromStartM,
        pointIndex: ptIdx,
        lat: pt.lat,
        lon: pt.lon,
        ele: Math.round(pt.ele),
        plannedStopSec: 0,
        terrainAfter: "road",
        services: ["Split 1 KM"],
      });
    }
  } else {
    const segmentCount =
      totalDistM >= 40000 ? 5 : totalDistM >= 15000 ? 4 : totalDistM >= 4500 ? 3 : 2;
    for (let k = 1; k < segmentCount; k++) {
      const targetDist = (totalDistM / segmentCount) * k;
      const ptIdx = findTrackPointIndexAtDistance(points, targetDist);
      const pt = points[ptIdx];
      nodes.push({
        id: `sys-seg-${k}`,
        name: `KM ${(pt.distFromStartM / 1000).toFixed(1)}`,
        type: "aid",
        distM: pt.distFromStartM,
        pointIndex: ptIdx,
        lat: pt.lat,
        lon: pt.lon,
        ele: Math.round(pt.ele),
        plannedStopSec: 240,
        terrainAfter: "singletrack",
        services: ["Air", "Isotonik", "Makanan"],
      });
    }
  }

  nodes.push({
    id: "sys-finish",
    name: "Finish",
    type: "finish",
    distM: totalDistM,
    pointIndex: points.length - 1,
    lat: finishPt.lat,
    lon: finishPt.lon,
    ele: Math.round(finishPt.ele),
    plannedStopSec: 0,
    terrainAfter: discipline === "road" ? "road" : "singletrack",
    services: ["Finish Line", "Medis"],
  });

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const dM = Math.max(1, b.distM - a.distM);
    const avgGrade = ((b.ele - a.ele) / dM) * 100;
    nodes[i].terrainAfter = inferTerrainFromGrade(avgGrade, discipline);
  }

  return nodes;
}

export interface ParsedGpxResult {
  name: string;
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  cleaningStats: GpxCleaningStats;
}

function getTagValue(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(re);
  if (!match) return undefined;
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function getAttr(tagStr: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i");
  const match = tagStr.match(re);
  return match ? match[1] : undefined;
}

/**
 * Pure XML GPX 1.1 parser that works identically in Node (Vitest) and browser.
 */
export function parseGpxXml(
  xmlText: string,
  discipline: RaceDiscipline = "trail"
): ParsedGpxResult {
  if (!xmlText || !xmlText.includes("<gpx")) {
    throw new Error("File tidak valid: tag root <gpx> tidak ditemukan.");
  }

  const nameMatch = xmlText.match(/<trk>[\s\S]*?<name>([\s\S]*?)<\/name>/i) ??
    xmlText.match(/<metadata>[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  const routeName = nameMatch
    ? nameMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim()
    : "Rute GPX";

  const rawPoints: Array<{ lat: number; lon: number; ele: number }> = [];
  const ptRegex = /<(?:trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:trkpt|rtept)>)/gi;
  let m: RegExpExecArray | null;

  while ((m = ptRegex.exec(xmlText)) !== null) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const lat = Number(getAttr(attrs, "lat"));
    const lon = Number(getAttr(attrs, "lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleStr = getTagValue(body, "ele");
    const ele = eleStr !== undefined && Number.isFinite(Number(eleStr)) ? Number(eleStr) : 0;
    rawPoints.push({ lat, lon, ele });
  }

  if (rawPoints.length < 2) {
    throw new Error("GPX harus memiliki minimal 2 titik rute (<trkpt> atau <rtept>).");
  }

  const waypoints: Array<{ name: string; lat: number; lon: number; desc?: string }> = [];
  const wptRegex = /<wpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/wpt>)/gi;
  while ((m = wptRegex.exec(xmlText)) !== null) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const lat = Number(getAttr(attrs, "lat"));
    const lon = Number(getAttr(attrs, "lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const wpName = getTagValue(body, "name") || `CP ${waypoints.length + 1}`;
    const desc = getTagValue(body, "desc");
    waypoints.push({ name: wpName, lat, lon, desc });
  }

  const points = recomputeTrackMetrics(rawPoints);
  const rawTotals = computeElevationTotals(points, true);
  const spikes = detectSpikes(points);
  const checkpoints = buildAutoCheckpoints(points, discipline, waypoints);

  return {
    name: routeName,
    points,
    checkpoints,
    cleaningStats: {
      originalPointCount: points.length,
      cleanedPointCount: points.length,
      spikesDetected: spikes.length,
      spikesRemoved: 0,
      rawGainM: rawTotals.gainM,
      currentGainM: rawTotals.gainM,
      smoothingWindow: 1,
      demCalibrated: false,
    },
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Serializes edited trackpoints and checkpoints into valid GPX 1.1 XML
 * compatible with Garmin, Coros, Suunto, and Strava.
 */
export function exportGpxXml(
  routeName: string,
  points: TrackPoint[],
  checkpoints: Checkpoint[]
): string {
  const safeName = escapeXml(routeName || "Rute Race");
  const wptLines = checkpoints
    .map((cp) => {
      const descParts = [
        `Type: ${cp.type}`,
        `Stop: ${Math.round(cp.plannedStopSec / 60)}m`,
      ];
      if (cp.services.length > 0) {
        descParts.push(`Services: ${cp.services.join(", ")}`);
      }
      if (cp.notes) {
        descParts.push(cp.notes);
      }
      return `  <wpt lat="${cp.lat.toFixed(6)}" lon="${cp.lon.toFixed(6)}">
    <ele>${cp.ele.toFixed(1)}</ele>
    <name>${escapeXml(cp.name)}</name>
    <desc>${escapeXml(descParts.join(" | "))}</desc>
  </wpt>`;
    })
    .join("\n");

  const trkptLines = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${p.ele.toFixed(1)}</ele></trkpt>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Pe-Larian" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
  </metadata>
${wptLines}
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkptLines}
    </trkseg>
  </trk>
</gpx>
`;
}
