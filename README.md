<p align="center">
  <img src="public/icons/logo-wordmark.svg" alt="Pe-Larian - Trail & Road Race Planner" width="320" />
</p>

# Pe-Larian

Aplikasi web statis gratis untuk komunitas pelari Indonesia (**Trail / Ultra** dan **Road** 5K, 10K, Half Marathon, Marathon) dalam merencanakan rute GPX, segmen checkpoint, pacing berbasis elevasi, prakiraan cuaca ketinggian, serta strategi nutrisi dan hidrasi.

Seluruh pemrosesan file `.gpx` dan simulasi berjalan **100% lokal di browser** tanpa akun, tanpa login, dan tanpa mengirim rute ke server mana pun.

## Fitur Utama

1. **Langkah 1 (Data & GPX):**
   - Upload file `.gpx` lokal (atau coba sample GPX Rinjani 60K / Jakarta Marathon 42K).
   - Pilih kategori `Trail` atau `Road`, atur tanggal, jam start, deteksi zona waktu otomatis (`WIB`/`WITA`/`WIT`), batas waktu COT global, dan berat badan pelari.
   - Tampilan mobile fokus penuh pada form input tanpa tertutup peta.
2. **Langkah 2 (Cek Rute & Basis Strategi):**
   - **Mode Road:** Segmen otomatis dibagi per **1 KM** (`KM 1`, `KM 2`, ...), terpisah dari daftar **Checkpoints** kustom untuk Water Station / dropbag.
   - **Mode Trail:** Segmen otomatis berdasar elevasi atau Checkpoint kustom, lengkap dengan pembersihan spike GPS, smoothing elevasi, dan ekspor `.gpx`.
   - **Tambah CP / Water Station (2 cara):** Form presisi berbasis jarak KM (`+ Tambah CP (Jarak KM)`) atau mode **`Klik di Peta`** fullscreen dengan mini-drawer interaktif (`Jarak Tepat KM`, `Nama CP`, `Stop`, `COT`).
3. **Langkah 3 (Strategi: Overview Rute & Pacing & Fueling):**
   - **Mobile Fokus Data:** Strip peta tipis `64px` di atas dengan pil **`Lihat Peta Penuh`** agar data elevasi, segmen, cuaca, pacing, dan nutrisi mendapat ~92% ruang layar (Desktop tetap split view drawer + peta interaktif).
   - **Overview Rute:** Ringkasan jarak/gain/durasi/estimasi finis, grafik elevasi & gradien dengan penanda jam Sunset, daftar segmen/CP, serta prakiraan cuaca Open-Meteo (dengan koreksi suhu ketinggian *lapse rate* dan status jujur jika tanggal race di luar jendela 16 hari).
   - **Pacing & Fueling:** Proyeksi finis & banner status COT (aman/melewati COT), kebutuhan karbohidrat/cairan/natrium dengan batas serap lambung `<= 1000 mL/jam` dan stepper berat badan langsung, grafik strategi split Road (**Positive Split**, **Even Pace**, **Negative Split**), cetak **Wrist Pace Band (210x32 mm)** / **Vest Pocket Card (A6)**, serta salin ringkasan WhatsApp.
4. **Siap PWA & Multi-Domain:**
   - Dilengkapi `manifest.webmanifest` ber-path relatif (`./`, `icons/...`) dan Service Worker `sw.js` dengan deteksi `BASE_PATH` otomatis sehingga langsung jalan baik di root domain (`https://pe-larian.github.io/`, Cloudflare Pages, atau custom domain) maupun subpath.

## Pengembangan Lokal

```bash
pnpm install
pnpm dev
```

Buka `http://localhost:3000` (atau `/figma-board` untuk meninjau artboard seluruh screen flow).

### Pengujian & Build Produksi

```bash
pnpm test
pnpm build
pnpm typecheck
```

## Panduan Deploy (Root Domain maupun Subpath)

Aplikasi diekspor sebagai situs statis Next.js (`output: "export"`, direktori `./out`).

- **GitHub Organization + GitHub Pages (`https://pe-larian.github.io/`):**
  1. Buat GitHub Organization (misal `pe-larian`) dan beri nama repository `pe-larian.github.io`.
  2. Aktifkan **Settings > Pages > Source: GitHub Actions**.
  3. Workflow `.github/workflows/deploy-pages.yml` otomatis menyetel `NEXT_PUBLIC_BASE_PATH` via `actions/configure-pages@v5` (kosong untuk root domain, otomatis terisi untuk subpath).
- **Cloudflare Pages / Vercel / Netlify:**
  - Build command: `pnpm build` (tanpa perlu set `NEXT_PUBLIC_BASE_PATH`)
  - Output directory: `out`
  - Node.js version: `22`
- **Custom Domain:**
  - Pasang custom domain di GitHub Pages atau Cloudflare Pages dan aktifkan HTTPS; tidak perlu mengubah konfigurasi aplikasi.
