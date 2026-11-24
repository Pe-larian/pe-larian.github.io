import { NextRequest, NextResponse } from "next/server";

/**
 * Stateless proxy to Open-Meteo Copernicus DEM 90m Elevation API.
 * Stores no route data; returns calibrated elevations for up to 100 sampled points.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const coords: Array<{ lat: number; lon: number }> = Array.isArray(body?.points)
      ? body.points
      : [];

    if (coords.length === 0 || coords.length > 100) {
      return NextResponse.json(
        { error: "Jumlah titik harus antara 1 sampai 100." },
        { status: 400 }
      );
    }

    const lats = coords.map((c) => Number(c.lat).toFixed(5)).join(",");
    const lons = coords.map((c) => Number(c.lon).toFixed(5)).join(",");
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Layanan DEM Open-Meteo mengembalikan HTTP ${res.status}.` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const elevation: number[] = Array.isArray(json?.elevation) ? json.elevation : [];
    return NextResponse.json({ elevation });
  } catch {
    return NextResponse.json(
      { error: "Gagal menghubungi Open-Meteo Elevation API. Coba lagi nanti." },
      { status: 502 }
    );
  }
}
