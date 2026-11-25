import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Progress,
  Textarea,
} from "@openreel/ui";
import { Clapperboard, Film, Loader2, Monitor, Smartphone, Sparkles } from "@/icons/lucide-compat";
import {
  buildChannelLevelVideo,
  type ChannelVideoFormat,
  type ChannelVisualStyle,
} from "../../services/channel-video-builder";
import { toast } from "../../stores/notification-store";

interface ChannelVideoBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFps?: 24 | 30 | 60;
  onBuilt?: () => void;
}

const EXAMPLE_TOPICS = [
  "Como o Império Romano dominou o mundo antigo",
  "5 segredos da psicologia que mudam seu foco",
  "O futuro dos foguetes reutilizáveis e Marte",
  "Por que o mercado financeiro reage em milissegundos",
];

const STYLE_CARDS: Array<{ id: ChannelVisualStyle; label: string; desc: string }> = [
  { id: "documentary", label: "Documentário", desc: "Kodak 2383 + Film Dissolve" },
  { id: "tech", label: "Tech & Ciência", desc: "Teal & Amber + Cross Zoom" },
  { id: "noir", label: "Noir Mistério", desc: "16mm P&B + Film Burn" },
  { id: "viral", label: "Ritmo Viral", desc: "Cores vibrantes + Corte rápido" },
];

export const ChannelVideoBuilderDialog: React.FC<ChannelVideoBuilderDialogProps> = ({
  open,
  onOpenChange,
  defaultFps = 30,
  onBuilt,
}) => {
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<ChannelVideoFormat>("16:9");
  const [style, setStyle] = useState<ChannelVisualStyle>("documentary");
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleBuild = async () => {
    const cleanTopic = topic.trim();
    if (!cleanTopic || building) return;
    setBuilding(true);
    setError(null);
    setProgress(5);
    setStage("Iniciando estúdio...");

    try {
      const result = await buildChannelLevelVideo({
        topic: cleanTopic,
        format,
        style,
        fps: defaultFps,
        onProgress: (pct, msg) => {
          setProgress(pct);
          setStage(msg);
        },
      });
      toast.success(
        "Vídeo montado na timeline!",
        `${result.sceneCount} cenas reais com movimento, cor, legenda e trilha sonora${result.usedAi ? " (roteirizado por IA)" : ""}.`,
      );
      onOpenChange(false);
      onBuilt?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao montar o vídeo.");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!building) onOpenChange(next); }}>
      <DialogContent className="max-w-xl border border-white/15 bg-[#121318] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-white">
            <Clapperboard size={18} className="text-amber-400" />
            Criador de Vídeo Nível Canal Grande
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Digite um tema ou roteiro. O estúdio busca B-rolls reais em HD, aplica movimento de câmera (Ken Burns), transições, color grading, legendas palavra por palavra e trilha sonora na timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-300">
              Tema ou Roteiro
            </label>
            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={building}
              rows={3}
              placeholder="Ex: A história oculta por trás dos arranha-céus de Nova York..."
              className="border-white/15 bg-black/40 text-sm text-white placeholder:text-zinc-500"
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_TOPICS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={building}
                  onClick={() => setTopic(ex)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-amber-400/50 hover:text-white disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={building}
              onClick={() => setFormat("16:9")}
              className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                format === "16:9"
                  ? "border-amber-400 bg-amber-500/15 text-white"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              <Monitor size={18} className="text-amber-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold">YouTube / Cinema (16:9)</div>
                <div className="text-[10px] text-zinc-400">1920 × 1080</div>
              </div>
            </button>
            <button
              type="button"
              disabled={building}
              onClick={() => setFormat("9:16")}
              className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                format === "9:16"
                  ? "border-amber-400 bg-amber-500/15 text-white"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              <Smartphone size={18} className="text-amber-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold">Shorts / Reels (9:16)</div>
                <div className="text-[10px] text-zinc-400">1080 × 1920</div>
              </div>
            </button>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-300">
              Direção Visual & Color Grading
            </span>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_CARDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={building}
                  onClick={() => setStyle(item.id)}
                  className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                    style === item.id
                      ? "border-amber-400 bg-amber-500/15 text-white"
                      : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  <Film size={14} className="mt-0.5 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div className="text-[10px] text-zinc-400">{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {building && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-center justify-between text-xs text-amber-200">
                <span className="flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin" />
                  {stage}
                </span>
                <span className="font-mono">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              disabled={building}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={building || !topic.trim()}
              onClick={() => void handleBuild()}
              className="gap-2 bg-amber-500 text-zinc-950 hover:bg-amber-400 font-semibold"
            >
              {building ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {building ? "Produzindo vídeo..." : "Montar Vídeo Completo"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
