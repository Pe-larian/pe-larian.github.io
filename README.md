# Trail & Road Race Simulator (Map-First Stepper)

Aplikasi web statis gratis dan tanpa penyimpanan data untuk merencanakan pacing, strategi nutrisi (fueling), serta mengedit rute GPX bagi pelari trail dan road race. Berjalan 100% di browser dan dapat langsung dihosting di GitHub Pages (`https://byudhistraq.github.io/web/`).

## Alur Utama (3 Langkah)

1. **Data & GPX**: Input nama pelari, nama & kategori race (`Trail` / `Road`), tanggal, jam start, zona waktu (`WIB`/`WITA`/`WIT`), berat badan, serta upload file `.gpx` (atau gunakan Sample GPX bawaan).
2. **Konfirmasi Rute & Editable GPX**: Cek statistik jarak/gain/loss/segmen pada peta OpenStreetMap full-bleed, edit checkpoint (nama, durasi stop, cut-off time, karakter medan), tambah CP lewat klik peta, bersihkan spike elevasi/GPS, haluskan elevasi, kalibrasi Copernicus DEM 90m, dan export `.gpx`.
3. **Hasil Strategi (2 Tab)**:
   - **Tab 1: Overview Rute** (statistik utama, tombol cepat `Upload ulang GPX` & `Export .GPX`, grafik elevasi & gradient dengan garis Sunset, daftar segmen interaktif, serta prakiraan cuaca Open-Meteo dengan koreksi lapse rate ketinggian).
   - **Tab 2: Pacing & Fueling** (proyeksi finis & margin COT, total kebutuhan karbohidrat/cairan/natrium, cek keamanan fisiologis batas lambung `<= 1000 mL/jam`, editor profil langsung, kartu strategi gabungan per segmen, modal cetak `Wrist Pace Band` / `A6 Vest Pocket Card`, dan salin ringkasan WhatsApp).

## Stack & Layanan Publik Gratis

- **Framework**: Next.js 15 App Router (`output: "export"` static site), React 19, TypeScript, Tailwind CSS v4
- **Peta**: MapLibre GL JS dengan layer OpenStreetMap, OpenTopoMap, AWS Terrarium 3D Terrain, dan Esri World Imagery
- **Cuaca & Elevasi**: Akses langsung dari browser ke Open-Meteo Forecast API dan Open-Meteo Copernicus DEM 90m API (CORS aktif, tanpa database, tanpa autentikasi, tanpa penyimpanan file pengguna)

## Menjalankan Secara Lokal

```bash
pnpm install
pnpm dev
```

Buka `http://localhost:3000` di browser.

## Build Static Export (GitHub Pages) & Pengujian

```bash
pnpm test
pnpm typecheck
NEXT_PUBLIC_BASE_PATH=/web pnpm build
```
