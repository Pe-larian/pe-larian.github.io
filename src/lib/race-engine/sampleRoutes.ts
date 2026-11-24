import { parseGpxXml, type ParsedGpxResult } from "./gpx";
import type { Checkpoint, RaceDiscipline } from "./types";

interface AnchorNode {
  lat: number;
  lon: number;
  ele: number;
  cpName?: string;
  cpType?: Checkpoint["type"];
  stopSec?: number;
  cutoffSec?: number;
  terrainAfter?: Checkpoint["terrainAfter"];
  services?: string[];
}

function interpolateAnchorsToGpx(
  routeName: string,
  anchors: AnchorNode[],
  pointsPerLeg: number,
  injectSpikes: boolean
): string {
  const trkpts: string[] = [];
  const wpts: string[] = [];

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (a.cpName && i > 0 && i < anchors.length - 1) {
      wpts.push(
        `  <wpt lat="${a.lat.toFixed(6)}" lon="${a.lon.toFixed(6)}"><ele>${a.ele.toFixed(1)}</ele><name>${a.cpName}</name></wpt>`
      );
    }
    if (i === anchors.length - 1) break;
    const b = anchors[i + 1];
    for (let step = 0; step < pointsPerLeg; step++) {
      const t = step / pointsPerLeg;
      const lat = a.lat + (b.lat - a.lat) * t + Math.sin(t * Math.PI * 3) * 0.0012;
      const lon = a.lon + (b.lon - a.lon) * t + Math.cos(t * Math.PI * 2) * 0.0012;
      const undulation = Math.sin(t * Math.PI * 5) * 16;
      let ele = a.ele + (b.ele - a.ele) * t + undulation;

      if (injectSpikes && i === 1 && step === 12) {
        ele += 145;
      }
      if (injectSpikes && i === 2 && step === 10) {
        ele -= 130;
      }
      if (injectSpikes && i === 3 && step === 15) {
        ele += 120;
      }

      trkpts.push(
        `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele></trkpt>`
      );
    }
  }
  const last = anchors[anchors.length - 1];
  trkpts.push(
    `      <trkpt lat="${last.lat.toFixed(6)}" lon="${last.lon.toFixed(6)}"><ele>${last.ele.toFixed(1)}</ele></trkpt>`
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SampleGPX" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${routeName}</name></metadata>
${wpts.join("\n")}
  <trk>
    <name>${routeName}</name>
    <trkseg>
${trkpts.join("\n")}
    </trkseg>
  </trk>
</gpx>`;
}

const RINJANI_ANCHORS: AnchorNode[] = [
  {
    lat: -8.3669,
    lon: 116.5335,
    ele: 1156,
    cpName: "Start Sembalun",
    cpType: "start",
    terrainAfter: "singletrack",
    services: ["Start Gate"],
  },
  {
    lat: -8.3812,
    lon: 116.4981,
    ele: 1500,
    cpName: "CP1 Pos 2",
    cpType: "aid",
    stopSec: 300,
    cutoffSec: 3.5 * 3600,
    terrainAfter: "climb",
    services: ["Air", "Isotonik", "Buah"],
  },
  {
    lat: -8.3958,
    lon: 116.4692,
    ele: 2639,
    cpName: "CP2 Plawangan Sembalun",
    cpType: "dropbag",
    stopSec: 600,
    cutoffSec: 7.0 * 3600,
    terrainAfter: "scree",
    services: ["Air", "Makanan hangat", "Drop bag", "Medis"],
  },
  {
    lat: -8.4113,
    lon: 116.4573,
    ele: 3726,
    cpName: "CP3 Puncak Rinjani",
    cpType: "summit",
    stopSec: 180,
    cutoffSec: 9.5 * 3600,
    terrainAfter: "technical",
    services: ["Marshal", "Cek wajib"],
  },
  {
    lat: -8.4095,
    lon: 116.4188,
    ele: 2008,
    cpName: "CP4 Danau Segara Anak",
    cpType: "aid",
    stopSec: 480,
    cutoffSec: 12.5 * 3600,
    terrainAfter: "descent",
    services: ["Air", "Isotonik", "Sup hangat", "Medis"],
  },
  {
    lat: -8.3168,
    lon: 116.4041,
    ele: 601,
    cpName: "Finish Senaru",
    cpType: "finish",
    stopSec: 0,
    cutoffSec: 16.0 * 3600,
    terrainAfter: "descent",
    services: ["Finish Line", "Medis"],
  },
];

const JAKARTA_ROAD_ANCHORS: AnchorNode[] = [
  {
    lat: -6.2185,
    lon: 106.8024,
    ele: 12,
    cpName: "Start GBK Senayan",
    cpType: "start",
    terrainAfter: "road",
    services: ["Start Gate"],
  },
  {
    lat: -6.1754,
    lon: 106.8272,
    ele: 14,
    cpName: "WS1 Monas (10.5 km)",
    cpType: "water",
    stopSec: 30,
    cutoffSec: 1.75 * 3600,
    terrainAfter: "road",
    services: ["Air", "Isotonik"],
  },
  {
    lat: -6.1352,
    lon: 106.8133,
    ele: 8,
    cpName: "WS2 Kota Tua (21.1 km)",
    cpType: "aid",
    stopSec: 45,
    cutoffSec: 3.5 * 3600,
    terrainAfter: "road",
    services: ["Air", "Isotonik", "Buah", "Spons"],
  },
  {
    lat: -6.2088,
    lon: 106.8456,
    ele: 18,
    cpName: "WS3 Kuningan (32.0 km)",
    cpType: "aid",
    stopSec: 45,
    cutoffSec: 5.25 * 3600,
    terrainAfter: "road",
    services: ["Air", "Isotonik", "Gel"],
  },
  {
    lat: -6.2185,
    lon: 106.8024,
    ele: 12,
    cpName: "Finish GBK Senayan",
    cpType: "finish",
    stopSec: 0,
    cutoffSec: 7.0 * 3600,
    terrainAfter: "road",
    services: ["Finish Line", "Medis"],
  },
];

export function buildSampleRoute(discipline: RaceDiscipline): ParsedGpxResult {
  const isTrail = discipline === "trail";
  const anchors = isTrail ? RINJANI_ANCHORS : JAKARTA_ROAD_ANCHORS;
  const routeName = isTrail ? "Rinjani 100 - Sample GPX" : "Jakarta City Marathon - Sample GPX";
  const xml = interpolateAnchorsToGpx(routeName, anchors, 24, isTrail);
  const parsed = parseGpxXml(xml, discipline);

  // Enrich checkpoints with realistic race cutoffs, services, and terrain tags
  const enrichedCheckpoints = parsed.checkpoints.map((cp, idx) => {
    const anchor = anchors[Math.min(idx, anchors.length - 1)];
    return {
      ...cp,
      name: anchor.cpName ?? cp.name,
      type: anchor.cpType ?? cp.type,
      plannedStopSec: anchor.stopSec ?? cp.plannedStopSec,
      cutoffElapsedSec: anchor.cutoffSec,
      terrainAfter: anchor.terrainAfter ?? cp.terrainAfter,
      services: anchor.services ?? cp.services,
    };
  });

  return {
    ...parsed,
    name: isTrail ? "Rinjani 100 60K (Sample GPX)" : "Jakarta Marathon 42K (Sample GPX)",
    checkpoints: enrichedCheckpoints,
  };
}
