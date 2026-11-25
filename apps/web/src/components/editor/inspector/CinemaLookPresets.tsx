import React, { useState } from "react";
import { Button } from "@openreel/ui";
import { Film, RotateCcw } from "@/icons/lucide-compat";
import { useProjectStore } from "../../../stores/project-store";
import { toast } from "../../../stores/notification-store";
import type { ColorGradingSettings } from "../../../bridges/effects-bridge";

interface CinemaGradePreset {
  id: string;
  name: string;
  subtitle: string;
  swatch: string;
  grading: Partial<ColorGradingSettings>;
}

const CINEMA_PRESETS: CinemaGradePreset[] = [
  {
    id: "kodak-2383",
    name: "Kodak 2383",
    subtitle: "Filme quente e denso",
    swatch: "linear-gradient(135deg, #1e293b 0%, #d97706 55%, #fef3c7 100%)",
    grading: {
      pipelineVersion: 2,
      temperature: 12,
      tint: 3,
      tone: {
        exposure: 0.08,
        contrast: 16,
        highlights: -14,
        shadows: -8,
        whites: 6,
        blacks: -10,
        saturation: 8,
        vibrance: 12,
      },
      vignette: { amount: 22, midpoint: 48, roundness: 45, feather: 65 },
    },
  },
  {
    id: "teal-amber",
    name: "Teal & Amber",
    subtitle: "Separacão cinema",
    swatch: "linear-gradient(135deg, #0f766e 0%, #164e63 45%, #f59e0b 100%)",
    grading: {
      pipelineVersion: 2,
      temperature: -6,
      tint: -4,
      tone: {
        exposure: 0,
        contrast: 18,
        highlights: -10,
        shadows: 6,
        whites: 8,
        blacks: -12,
        saturation: 6,
        vibrance: 16,
      },
      colorWheels: {
        shadows: { r: -0.06, g: 0.02, b: 0.08 },
        midtones: { r: 0.04, g: 0.01, b: -0.03 },
        highlights: { r: 0.09, g: 0.04, b: -0.06 },
      },
      vignette: { amount: 18, midpoint: 52, roundness: 50, feather: 60 },
    },
  },
  {
    id: "noir-16mm",
    name: "Noir 16mm",
    subtitle: "Monocromático dramático",
    swatch: "linear-gradient(135deg, #09090b 0%, #52525b 55%, #fafafa 100%)",
    grading: {
      pipelineVersion: 2,
      temperature: 0,
      tint: 0,
      tone: {
        exposure: 0.05,
        contrast: 32,
        highlights: 12,
        shadows: -20,
        whites: 14,
        blacks: -18,
        saturation: -100,
        vibrance: 0,
      },
      vignette: { amount: 35, midpoint: 42, roundness: 35, feather: 55 },
    },
  },
  {
    id: "golden-hour",
    name: "Golden Hour",
    subtitle: "Luz solar dourada",
    swatch: "linear-gradient(135deg, #78350f 0%, #f59e0b 55%, #fde68a 100%)",
    grading: {
      pipelineVersion: 2,
      temperature: 24,
      tint: 6,
      tone: {
        exposure: 0.14,
        contrast: 8,
        highlights: -16,
        shadows: 14,
        whites: 4,
        blacks: 0,
        saturation: 10,
        vibrance: 18,
      },
      vignette: { amount: 12, midpoint: 58, roundness: 55, feather: 70 },
    },
  },
  {
    id: "doc-crisp",
    name: "Doc Limpo",
    subtitle: "Contraste natural nítido",
    swatch: "linear-gradient(135deg, #1e293b 0%, #38bdf8 55%, #f8fafc 100%)",
    grading: {
      pipelineVersion: 2,
      temperature: -2,
      tint: 0,
      tone: {
        exposure: 0.04,
        contrast: 10,
        highlights: -8,
        shadows: 10,
        whites: 4,
        blacks: -4,
        saturation: 4,
        vibrance: 8,
      },
      vignette: { amount: 0, midpoint: 50, roundness: 50, feather: 50 },
    },
  },
];

interface CinemaLookPresetsProps {
  clipId: string;
}

/** One-click deterministic film grades written straight to the clip's ColorGrading state. */
export const CinemaLookPresets: React.FC<CinemaLookPresetsProps> = ({ clipId }) => {
  const updateColorGrading = useProjectStore((s) => s.updateColorGrading);
  const resetColorGrading = useProjectStore((s) => s.resetColorGrading);
  const [activeId, setActiveId] = useState<string | null>(null);

  const applyPreset = async (preset: CinemaGradePreset) => {
    setActiveId(preset.id);
    await updateColorGrading(clipId, preset.grading);
    toast.success("Look aplicado", `${preset.name} aplicado ao clipe.`);
  };

  const clearPreset = () => {
    setActiveId(null);
    resetColorGrading(clipId);
  };

  return (
    <div className="space-y-2 rounded-[7px] border border-border bg-bg-2 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Film size={12} className="text-amber-400" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-2">
            Perfis de Cinema
          </span>
        </div>
        {activeId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearPreset}
            className="h-5 gap-1 px-1.5 text-[10px] text-fg-3 hover:text-fg"
          >
            <RotateCcw size={10} />
            Limpar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {CINEMA_PRESETS.map((preset) => {
          const isActive = activeId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => void applyPreset(preset)}
              className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                isActive
                  ? "border-amber-500/80 bg-amber-500/10"
                  : "border-border bg-bg-1 hover:border-border-strong hover:bg-hover"
              }`}
            >
              <span
                className="h-6 w-6 shrink-0 rounded border border-white/15 shadow-inner"
                style={{ background: preset.swatch }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-fg">
                  {preset.name}
                </span>
                <span className="block truncate text-[9px] text-fg-3">
                  {preset.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
