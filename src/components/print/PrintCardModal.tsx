"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconClose, IconCopy, IconPrint } from "@/components/Icons";
import { formatDuration } from "@/lib/race-engine/pacing";
import type { RaceMetadata, RaceSimulationSummary } from "@/lib/race-engine/types";

interface PrintCardModalProps {
  open: boolean;
  onClose: () => void;
  metadata: RaceMetadata;
  simulation: RaceSimulationSummary;
  onCopyWhatsApp: () => void;
  copiedWa: boolean;
}

export function PrintCardModal({
  open,
  onClose,
  metadata,
  simulation,
  onCopyWhatsApp,
  copiedWa,
}: PrintCardModalProps) {
  const [format, setFormat] = useState<"wrist" | "pocket">("wrist");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#161E19]/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#E2E5E2] bg-white shadow-xl">
        {/* Modal Header */}
        <div className="no-print flex items-center justify-between border-b border-[#E2E5E2] px-5 py-3.5">
          <div>
            <h2 id="print-modal-title" className="text-base font-bold text-[#161E19]">
              Print CP Card / Wrist Pace Band
            </h2>
            <p className="text-xs text-[#525C56]">
              Kontras hitam-putih tinggi untuk dicetak atau dilaminasi di vest.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal cetak"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[#161E19] hover:bg-[#F5F5F3]"
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Format Toggle */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E5E2] bg-[#F5F5F3] px-5 py-2.5">
          <div className="inline-flex rounded-lg border border-[#E2E5E2] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setFormat("wrist")}
              aria-pressed={format === "wrist"}
              className={`min-h-[34px] rounded-md px-3 text-xs font-semibold ${
                format === "wrist"
                  ? "bg-[#1B2B22] text-white"
                  : "text-[#525C56] hover:text-[#161E19]"
              }`}
            >
              Wrist Pace Band (210x32 mm)
            </button>
            <button
              type="button"
              onClick={() => setFormat("pocket")}
              aria-pressed={format === "pocket"}
              className={`min-h-[34px] rounded-md px-3 text-xs font-semibold ${
                format === "pocket"
                  ? "bg-[#1B2B22] text-white"
                  : "text-[#525C56] hover:text-[#161E19]"
              }`}
            >
              Vest Pocket Card (A6)
            </button>
          </div>
          <span className="font-num text-xs font-medium text-[#525C56]">
            Start {metadata.startTime} {metadata.timezone} · {metadata.raceDate}
          </span>
        </div>

        {/* Printable Sheet Preview */}
        <div className="flex-1 overflow-y-auto bg-[#F5F5F3] p-5">
          <div
            className={`print-only-sheet mx-auto rounded-lg border-2 border-[#161E19] bg-white p-4 text-[#161E19] ${
              format === "wrist" ? "max-w-sm" : "max-w-xl"
            }`}
          >
            <div className="flex items-baseline justify-between border-b-2 border-[#161E19] pb-2">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-tight">
                  {metadata.raceName}
                </p>
                <p className="text-[11px]">
                  {metadata.runnerName || "Pelari"} · Start {metadata.startTime}{" "}
                  {metadata.timezone}
                </p>
              </div>
              <div className="font-num text-right text-xs font-bold">
                <p>{(simulation.totalDistanceM / 1000).toFixed(1)} km</p>
                <p>+{simulation.totalGainM} m</p>
              </div>
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-[#161E19] font-bold">
                    <th className="py-1 pr-2">CP</th>
                    <th className="font-num py-1 pr-2">KM</th>
                    <th className="font-num py-1 pr-2">Tiba</th>
                    {format === "pocket" && <th className="font-num py-1 pr-2">Keluar</th>}
                    <th className="font-num py-1 pr-2">COT</th>
                    <th className="py-1">Fueling</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.segments.map((seg) => (
                    <tr key={seg.index} className="border-b border-[#D4DAD6] align-top">
                      <td className="py-1.5 pr-2 font-semibold">{seg.toCp.name}</td>
                      <td className="font-num py-1.5 pr-2">
                        {(seg.toCp.distM / 1000).toFixed(1)}
                      </td>
                      <td className="font-num py-1.5 pr-2 font-bold">
                        {seg.arrivalClockTime.slice(0, 5)}
                      </td>
                      {format === "pocket" && (
                        <td className="font-num py-1.5 pr-2">
                          {seg.departureClockTime.slice(0, 5)}
                        </td>
                      )}
                      <td className="font-num py-1.5 pr-2">
                        {seg.cutoffClockTime ? seg.cutoffClockTime.slice(0, 5) : "-"}
                      </td>
                      <td className="font-num py-1.5">
                        {seg.carbsG}g C / {seg.fluidMl}mL / {seg.sodiumMg}mg Na
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="font-num mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#161E19] pt-2 text-[11px] font-semibold">
              <span>Est. Finis: {simulation.finishClockTime}</span>
              <span>Durasi: {formatDuration(simulation.totalElapsedSec)}</span>
              <span>
                Total: {simulation.totalCarbsG}g C · {(simulation.totalFluidMl / 1000).toFixed(1)}L
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="no-print flex flex-wrap items-center justify-end gap-2 border-t border-[#E2E5E2] bg-white px-5 py-3.5">
          <button
            type="button"
            onClick={onCopyWhatsApp}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 text-xs font-semibold ${
              copiedWa
                ? "border-[#146342] bg-[#EAF6F0] text-[#146342]"
                : "border-[#8C948E] bg-white text-[#161E19] hover:bg-[#F5F5F3]"
            }`}
          >
            {copiedWa ? <IconCheck size={15} /> : <IconCopy size={15} />}
            {copiedWa ? "Tersalin ke Clipboard" : "Copy Ringkasan WA"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#1B2B22] px-5 text-xs font-semibold text-white hover:bg-[#161E19]"
          >
            <IconPrint size={15} />
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
