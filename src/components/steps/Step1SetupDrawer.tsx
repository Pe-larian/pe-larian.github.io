"use client";

import { useEffect, useRef, useState } from "react";
import { IconAlert, IconArrowRight, IconCheck, IconMinus, IconPlus, IconUpload } from "@/components/Icons";
import type { RaceDiscipline, RaceMetadata } from "@/lib/race-engine/types";

interface Step1SetupDrawerProps {
  metadata: RaceMetadata;
  weightKg: number;
  pointCount: number;
  totalDistanceKm: number;
  totalGainM: number;
  uploadError: string | null;
  onUpdateMetadata: (patch: Partial<RaceMetadata>) => void;
  onChangeWeightKg: (kg: number) => void;
  onUploadGpxFile: (file: File) => void;
  onLoadSampleRoute: (discipline: RaceDiscipline) => void;
  onNextStep: () => void;
}

function timezoneNoticeLabel(tz: RaceMetadata["timezone"]): string {
  if (tz === "WIB") return "WIB (UTC+7)";
  if (tz === "WIT") return "WIT (UTC+9)";
  return "WITA (UTC+8)";
}

export function Step1SetupDrawer({
  metadata,
  weightKg,
  pointCount,
  totalDistanceKm,
  totalGainM,
  uploadError,
  onUpdateMetadata,
  onChangeWeightKg,
  onUploadGpxFile,
  onLoadSampleRoute,
  onNextStep,
}: Step1SetupDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [weightDraft, setWeightDraft] = useState(String(weightKg));

  useEffect(() => {
    setWeightDraft(String(weightKg));
  }, [weightKg]);

  const commitWeightDraft = (raw: string) => {
    const parsed = Number(raw);
    if (!raw.trim() || !Number.isFinite(parsed)) {
      setWeightDraft(String(weightKg));
      return;
    }
    const clamped = Math.max(35, Math.min(150, Math.round(parsed)));
    onChangeWeightKg(clamped);
    setWeightDraft(String(clamped));
  };

  const handleFileChange = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    onUploadGpxFile(file);
  };

  const handleDisciplineSwitch = (nextDiscipline: RaceDiscipline) => {
    onUpdateMetadata({ discipline: nextDiscipline });
    if (metadata.isSample) {
      onLoadSampleRoute(nextDiscipline);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-[#161E19]">
            Mulai Simulasi Race
          </h1>
          <p className="mt-0.5 text-xs text-[#525C56]">
            Data diproses langsung di browser. Tidak ada akun atau penyimpanan server.
          </p>
        </div>

        {/* Runner Name */}
        <div>
          <label
            htmlFor="runner-name"
            className="mb-1 block text-xs font-semibold text-[#161E19]"
          >
            Nama pelari
          </label>
          <input
            id="runner-name"
            type="text"
            value={metadata.runnerName}
            onChange={(e) => onUpdateMetadata({ runnerName: e.target.value })}
            placeholder="Contoh: Bima Pratama"
            className="min-h-[44px] w-full rounded-lg border border-[#8C948E] bg-white px-3 text-sm text-[#161E19] placeholder:text-[#525C56]/70 focus:border-[#1E6B3A]"
          />
        </div>

        {/* Race Name + Discipline Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="race-name"
              className="text-xs font-semibold text-[#161E19]"
            >
              Nama race & kategori
            </label>
            <div
              className="inline-flex shrink-0 rounded-lg border border-[#E2E5E2] bg-[#F5F5F3] p-0.5"
              role="group"
              aria-label="Kategori race"
            >
              {(["trail", "road"] as const).map((mode) => {
                const active = metadata.discipline === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleDisciplineSwitch(mode)}
                    aria-pressed={active}
                    className={`min-h-[30px] rounded-md px-2.5 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-[#1B2B22] text-white"
                        : "text-[#525C56] hover:text-[#161E19]"
                    }`}
                  >
                    {mode === "trail" ? "Trail" : "Road"}
                  </button>
                );
              })}
            </div>
          </div>
          <input
            id="race-name"
            type="text"
            value={metadata.raceName}
            onChange={(e) => onUpdateMetadata({ raceName: e.target.value })}
            placeholder="Contoh: Rinjani 100 60K"
            className="min-h-[44px] w-full rounded-lg border border-[#8C948E] bg-white px-3 text-sm text-[#161E19] placeholder:text-[#525C56]/70 focus:border-[#1E6B3A]"
          />
        </div>

        {/* Date, Start Time, Auto-Detected Timezone (disabled notification) */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label
                htmlFor="race-date"
                className="mb-1 block text-xs font-semibold text-[#161E19]"
              >
                Tanggal race
              </label>
              <input
                id="race-date"
                type="date"
                value={metadata.raceDate}
                onChange={(e) => onUpdateMetadata({ raceDate: e.target.value })}
                className="font-num min-h-[44px] w-full rounded-lg border border-[#8C948E] bg-white px-2.5 text-sm text-[#161E19]"
              />
            </div>
            <div className="sm:col-span-3">
              <label
                htmlFor="start-time"
                className="mb-1 block text-xs font-semibold text-[#161E19]"
              >
                Jam start
              </label>
              <input
                id="start-time"
                type="time"
                value={metadata.startTime}
                onChange={(e) => onUpdateMetadata({ startTime: e.target.value })}
                className="font-num min-h-[44px] w-full rounded-lg border border-[#8C948E] bg-white px-2 text-sm text-[#161E19]"
              />
            </div>
            <div className="sm:col-span-4">
              <label
                htmlFor="race-tz-auto"
                className="mb-1 block text-xs font-semibold text-[#161E19]"
              >
                Zona waktu
              </label>
              <input
                id="race-tz-auto"
                type="text"
                disabled
                readOnly
                value={timezoneNoticeLabel(metadata.timezone)}
                aria-label="Zona waktu otomatis berdasarkan lokasi rute"
                className="font-num min-h-[44px] w-full rounded-lg border border-[#E2E5E2] bg-[#F5F5F3] px-2.5 text-center text-xs font-semibold text-[#525C56]"
              />
            </div>
          </div>
          <p className="text-[11px] text-[#525C56]">
            Zona waktu terdeteksi otomatis dari lokasi GPX:{" "}
            <strong className="text-[#161E19]">{timezoneNoticeLabel(metadata.timezone)}</strong>
          </p>
        </div>

        {/* Weight Stepper (Keyboard-friendly) */}
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label
              htmlFor="runner-weight"
              className="text-xs font-semibold text-[#161E19]"
            >
              Berat badan (kg)
            </label>
            <span className="text-[11px] text-[#525C56]">
              Dasar hitung hidrasi & kalori
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = Math.max(35, weightKg - 1);
                onChangeWeightKg(next);
                setWeightDraft(String(next));
              }}
              aria-label="Kurangi berat badan 1 kg"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#8C948E] bg-white text-[#161E19] hover:bg-[#F5F5F3]"
            >
              <IconMinus size={16} />
            </button>
            <input
              id="runner-weight"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={weightDraft}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9]/g, "");
                setWeightDraft(cleaned);
                if (cleaned !== "") {
                  const num = Number(cleaned);
                  if (Number.isFinite(num) && num >= 35 && num <= 150) {
                    onChangeWeightKg(num);
                  }
                }
              }}
              onBlur={() => commitWeightDraft(weightDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitWeightDraft(weightDraft);
                }
              }}
              className="font-num min-h-[44px] w-full rounded-lg border border-[#8C948E] bg-white px-3 text-center text-base font-bold text-[#161E19]"
            />
            <button
              type="button"
              onClick={() => {
                const next = Math.min(150, weightKg + 1);
                onChangeWeightKg(next);
                setWeightDraft(String(next));
              }}
              aria-label="Tambah berat badan 1 kg"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#8C948E] bg-white text-[#161E19] hover:bg-[#F5F5F3]"
            >
              <IconPlus size={16} />
            </button>
          </div>
        </div>

        {/* Upload GPX Dropzone */}
        <div>
          <span className="mb-1 block text-xs font-semibold text-[#161E19]">
            Upload rute GPX
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            className="sr-only"
            onChange={(e) => {
              handleFileChange(e.target.files);
              e.target.value = "";
            }}
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFileChange(e.dataTransfer.files);
            }}
            className={`rounded-xl border border-dashed p-3.5 transition-colors ${
              isDragging
                ? "border-[#1E6B3A] bg-[#EAF6F0]"
                : "border-[#8C948E] bg-[#F5F5F3]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#161E19]">
                  Tarik file .gpx ke sini atau pilih file
                </p>
                <p className="mt-0.5 text-[11px] text-[#525C56]">
                  Format GPX 1.1 dari Garmin, Coros, Strava, atau Komoot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#8C948E] bg-white px-3 text-xs font-semibold text-[#161E19] hover:bg-[#ECEFED]"
              >
                <IconUpload size={15} />
                Pilih GPX
              </button>
            </div>

            {pointCount > 0 && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-[#E2E5E2] bg-white px-3 py-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EAF6F0] text-[#146342]">
                    <IconCheck size={12} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#161E19]">
                      {metadata.sourceFileName}
                    </p>
                    <p className="font-num text-[11px] text-[#525C56]">
                      {totalDistanceKm.toFixed(1)} km · +{totalGainM} m · {pointCount} titik
                      {metadata.isSample ? " (Sample GPX)" : ""}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#525C56]">Coba contoh:</span>
              <button
                type="button"
                onClick={() => onLoadSampleRoute("trail")}
                className="min-h-[32px] whitespace-nowrap rounded-md border border-[#E2E5E2] bg-white px-2.5 text-[11px] font-semibold text-[#1E6B3A] hover:bg-[#EAF6F0]"
              >
                Sample GPX Trail (Rinjani)
              </button>
              <button
                type="button"
                onClick={() => onLoadSampleRoute("road")}
                className="min-h-[32px] whitespace-nowrap rounded-md border border-[#E2E5E2] bg-white px-2.5 text-[11px] font-semibold text-[#1E6B3A] hover:bg-[#EAF6F0]"
              >
                Sample GPX Road (Jakarta)
              </button>
            </div>
          </div>

          {uploadError && (
            <div
              role="alert"
              className="mt-2 flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEE2E2] px-3 py-2 text-xs text-[#991B1B]"
            >
              <IconAlert size={15} className="mt-0.5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="border-t border-[#E2E5E2] bg-white px-5 py-3.5">
        <button
          type="button"
          onClick={onNextStep}
          disabled={pointCount < 2}
          className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B2B22] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#161E19] disabled:opacity-40"
        >
          Lanjut: Konfirmasi Rute
          <IconArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
