import type { RaceDiscipline } from "@/lib/race-engine/types";

export const TRAKTEER_SUPPORT_URL = "https://trakteer.id/wmqa0yiq86fn1cfaulzf";
export const FEEDBACK_TARGET_EMAIL = "pelarian9q7@gmail.com";
export const FORMSUBMIT_AJAX_ENDPOINT = `https://formsubmit.co/ajax/${FEEDBACK_TARGET_EMAIL}`;

export type FeedbackCategory = "kritik" | "saran_fitur";

export function getFeedbackCategoryLabel(category: FeedbackCategory): string {
  return category === "kritik" ? "Kritik" : "Saran Fitur";
}

export interface FeedbackEmailParams {
  category: FeedbackCategory;
  senderName?: string;
  message: string;
  raceName?: string;
  discipline?: RaceDiscipline;
}

export function buildFeedbackEmailPayload(params: FeedbackEmailParams): {
  categoryLabel: string;
  subject: string;
  body: string;
  mailtoUrl: string;
  formSubmitPayload: Record<string, string>;
} {
  const categoryLabel = getFeedbackCategoryLabel(params.category);
  const cleanSender = params.senderName?.trim() || "Pelari (Anonim)";
  const cleanMessage = params.message.trim();
  const raceContext = params.raceName?.trim()
    ? `${params.raceName.trim()} (${params.discipline === "road" ? "Road" : "Trail"})`
    : params.discipline === "road"
      ? "Road"
      : "Trail";

  const subject = `[Pe-Larian] ${categoryLabel} dari ${cleanSender}`;
  const body = [
    `Kategori: ${categoryLabel}`,
    `Pengirim: ${cleanSender}`,
    `Konteks Rute: ${raceContext}`,
    "",
    "Pesan:",
    cleanMessage,
  ].join("\n");

  const mailtoUrl = `mailto:${FEEDBACK_TARGET_EMAIL}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  const formSubmitPayload: Record<string, string> = {
    _subject: subject,
    _template: "table",
    _captcha: "false",
    Kategori: categoryLabel,
    Pengirim: cleanSender,
    Konteks_Rute: raceContext,
    Pesan: cleanMessage,
  };

  return {
    categoryLabel,
    subject,
    body,
    mailtoUrl,
    formSubmitPayload,
  };
}
