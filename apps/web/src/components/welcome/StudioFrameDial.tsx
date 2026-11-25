import React from "react";

export type StudioFpsPreset = 24 | 30 | 60;

interface StudioFrameDialProps {
  value: StudioFpsPreset;
  onChange: (fps: StudioFpsPreset) => void;
  disabled?: boolean;
}

const FPS_OPTIONS: Array<{
  fps: StudioFpsPreset;
  label: string;
  tag: string;
  angle: number;
}> = [
  { fps: 24, label: "24 fps", tag: "Cinema", angle: 120 },
  { fps: 30, label: "30 fps", tag: "Web & Social", angle: 240 },
  { fps: 60, label: "60 fps", tag: "Fluido", angle: 360 },
];

/** Radial precision dial adapted from the studio instrument dial architecture. */
export const StudioFrameDial: React.FC<StudioFrameDialProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const activeOption = FPS_OPTIONS.find((item) => item.fps === value) ?? FPS_OPTIONS[1];

  return (
    <div
      className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-[#121318]/80 px-3.5 py-2 backdrop-blur-md"
      role="group"
      aria-label="Taxa de quadros do projeto"
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
        <svg viewBox="0 0 44 44" className="h-10 w-10 -rotate-90" aria-hidden="true">
          <circle
            cx="22"
            cy="22"
            r="17"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="2.5"
            strokeDasharray="3 3"
          />
          <circle
            cx="22"
            cy="22"
            r="17"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${(activeOption.angle / 360) * 106.8} 106.8`}
            style={{ transition: "stroke-dasharray 260ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        </svg>
        <span className="absolute font-mono text-[10px] font-semibold tracking-tight text-amber-300">
          {value}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Cadência
          </span>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-300">
            {activeOption.tag}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {FPS_OPTIONS.map((option) => {
            const selected = option.fps === value;
            return (
              <button
                key={option.fps}
                type="button"
                disabled={disabled}
                onClick={() => onChange(option.fps)}
                aria-pressed={selected}
                className={`rounded-lg px-2 py-0.5 font-mono text-[11px] transition-colors ${
                  selected
                    ? "bg-amber-500 text-zinc-950 font-semibold"
                    : "bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                } disabled:opacity-50`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
