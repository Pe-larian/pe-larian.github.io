import type { Metadata } from "next";
import { FigmaArtboardFlow } from "@/components/figma/FigmaArtboardFlow";

export const metadata: Metadata = {
  title: "Pe-Larian - Figma Artboard Flow",
  description: "Seluruh screen flow aplikasi untuk di-import ke Figma via html.to.design.",
};

export default function FigmaBoardPage() {
  return <FigmaArtboardFlow />;
}
