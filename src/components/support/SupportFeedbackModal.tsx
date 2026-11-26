"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconCopy,
  IconHeart,
  IconMail,
} from "@/components/Icons";
import {
  buildFeedbackEmailPayload,
  FEEDBACK_TARGET_EMAIL,
  FORMSUBMIT_AJAX_ENDPOINT,
  TRAKTEER_SUPPORT_URL,
  type FeedbackCategory,
} from "@/lib/feedback";
import type { RaceDiscipline } from "@/lib/race-engine/types";

interface SupportFeedbackModalProps {
  open: boolean;
  onClose: () => void;
  raceName?: string;
  discipline?: RaceDiscipline;
}

export function SupportFeedbackModal({
  open,
  onClose,
  raceName,
  discipline,
}: SupportFeedbackModalProps) {
  const [category, setCategory] = useState<FeedbackCategory>("kritik");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [submitFeedbackMsg, setSubmitFeedbackMsg] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const emailPayload = useMemo(
    () =>
      buildFeedbackEmailPayload({
        category,
        senderName,
        message: message || "(Belum ada isi pesan)",
        raceName,
        discipline,
      }),
    [category, senderName, message, raceName, discipline]
  );

  if (!open) return null;

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(FEEDBACK_TARGET_EMAIL);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2200);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = FEEDBACK_TARGET_EMAIL;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2200);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSubmitFeedbackMsg(null);

    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setValidationError(
        "Tuliskan kritik atau saran minimal 5 karakter terlebih dahulu."
      );
      return;
    }

    setSubmitState("submitting");
    try {
      const res = await fetch(FORMSUBMIT_AJAX_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(emailPayload.formSubmitPayload),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setSubmitState("success");
      setSubmitFeedbackMsg(
        `Masukan (${emailPayload.categoryLabel}) berhasil terkirim. Terima kasih sudah membantu mengembangkan Pe-Larian.`
      );
      setMessage("");
    } catch {
      setSubmitState("error");
      setSubmitFeedbackMsg(
        `Pengiriman langsung sedang terkendala. Silakan klik "Buka Aplikasi Email" di bawah atau salin alamat email tujuan.`
      );
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#161E19]/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#E2E5E2] bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#E2E5E2] px-5 py-3.5">
          <div>
            <h2
              id="support-modal-title"
              className="text-base font-bold text-[#161E19]"
            >
              Dukung &amp; Kirim Masukan
            </h2>
            <p className="mt-0.5 text-xs text-[#525C56]">
              Pe-Larian gratis tanpa iklan dan berjalan lokal di browsermu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal dukungan dan masukan"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#161E19] hover:bg-[#F5F5F3]"
          >
            <IconClose size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3.5">
          {/* 1. Blok Dukungan Trakteer */}
          <section
            aria-labelledby="heading-trakteer"
            className="rounded-xl border border-[#F3D7BA] bg-[#FFF8F1] p-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#9A3412] text-white">
                <IconHeart size={13} />
              </span>
              <h3
                id="heading-trakteer"
                className="text-xs font-bold uppercase tracking-wide text-[#161E19]"
              >
                Dukung Pengembangan Pe-Larian
              </h3>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#161E19]">
              Merasa rencana race ini membantu persiapan larimu? Traktir kopi lewat
              Trakteer agar fitur baru dan pemeliharaan rute terus jalan.
            </p>
            <a
              href={TRAKTEER_SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#9A3412] px-4 text-xs font-bold text-white transition-colors hover:bg-[#7C2D12]"
            >
              <IconHeart size={15} />
              Traktir via Trakteer
            </a>
          </section>

          {/* 2. Blok Kritik & Saran Fitur ke Email */}
          <section aria-labelledby="heading-feedback-form">
            <h3
              id="heading-feedback-form"
              className="text-xs font-bold uppercase tracking-wide text-[#161E19]"
            >
              Kritik &amp; Saran Fitur
            </h3>

            <form onSubmit={handleSubmit} className="mt-2 space-y-2.5" noValidate>
              {/* 2-Category Selector */}
              <div>
                <span className="mb-1 block text-xs font-semibold text-[#161E19]">
                  Pilih Kategori Email
                </span>
                <div
                  className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#E2E5E2] bg-[#F5F5F3] p-1"
                  role="group"
                  aria-label="Pilih kategori email masukan"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCategory("kritik");
                      setValidationError(null);
                    }}
                    aria-pressed={category === "kritik"}
                    className={`min-h-[44px] rounded-lg px-3 text-xs font-bold ${
                      category === "kritik"
                        ? "bg-[#1B2B22] text-white"
                        : "text-[#161E19] hover:bg-white"
                    }`}
                  >
                    Kritik
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCategory("saran_fitur");
                      setValidationError(null);
                    }}
                    aria-pressed={category === "saran_fitur"}
                    className={`min-h-[44px] rounded-lg px-3 text-xs font-bold ${
                      category === "saran_fitur"
                        ? "bg-[#1B2B22] text-white"
                        : "text-[#161E19] hover:bg-white"
                    }`}
                  >
                    Saran Fitur
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-[#525C56]">
                  {category === "kritik"
                    ? "Laporkan hitungan yang terasa kurang pas, bug, atau tampilan membingungkan."
                    : "Usulkan fitur baru untuk rute trail, road, pacing, atau kebutuhan nutrisi."}
                </p>
              </div>

              <div>
                <label
                  htmlFor="feedback-sender-name"
                  className="mb-1 block text-xs font-semibold text-[#161E19]"
                >
                  Nama / Panggilan (opsional)
                </label>
                <input
                  id="feedback-sender-name"
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Contoh: Budi atau @username"
                  maxLength={80}
                  className="min-h-[44px] w-full rounded-lg border border-[#8C948E] bg-white px-3 text-sm text-[#161E19] placeholder:text-[#525C56]/70"
                />
              </div>

              <div>
                <label
                  htmlFor="feedback-message"
                  className="mb-1 block text-xs font-semibold text-[#161E19]"
                >
                  {category === "kritik" ? "Isi Kritik" : "Isi Saran Fitur"}
                </label>
                <textarea
                  id="feedback-message"
                  rows={3}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (validationError) setValidationError(null);
                    if (submitState !== "idle") {
                      setSubmitState("idle");
                      setSubmitFeedbackMsg(null);
                    }
                  }}
                  placeholder={
                    category === "kritik"
                      ? "Ceritakan kendala atau bagian yang perlu diperbaiki..."
                      : "Ceritakan fitur yang kamu harapkan ada di Pe-Larian..."
                  }
                  className="w-full rounded-lg border border-[#8C948E] bg-white p-3 text-sm text-[#161E19] placeholder:text-[#525C56]/70"
                />
              </div>

              {validationError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEE2E2] p-2.5 text-xs font-medium text-[#991B1B]"
                >
                  <IconAlert size={15} className="mt-0.5 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              {submitFeedbackMsg && (
                <div
                  role="status"
                  className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs font-medium ${
                    submitState === "success"
                      ? "border-[#CBEAD9] bg-[#EAF6F0] text-[#146342]"
                      : "border-[#FECACA] bg-[#FEE2E2] text-[#991B1B]"
                  }`}
                >
                  {submitState === "success" ? (
                    <IconCheck size={15} className="mt-0.5 shrink-0" />
                  ) : (
                    <IconAlert size={15} className="mt-0.5 shrink-0" />
                  )}
                  <span>{submitFeedbackMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitState === "submitting"}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#1B2B22] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#161E19] disabled:opacity-60"
              >
                <IconMail size={16} />
                {submitState === "submitting"
                  ? "Mengirim masukan..."
                  : `Kirim ${emailPayload.categoryLabel}`}
              </button>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <a
                  href={emailPayload.mailtoUrl}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#E2E5E2] bg-[#F5F5F3] px-3 text-xs font-semibold text-[#161E19] hover:bg-[#ECEFED]"
                >
                  <IconMail size={14} />
                  Buka Aplikasi Email
                </a>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#E2E5E2] bg-white px-3 text-xs font-semibold text-[#161E19] hover:bg-[#F5F5F3]"
                >
                  {copiedEmail ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  {copiedEmail ? "Email Tersalin" : "Salin Email"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
