import {
  useState,
  useCallback,
  useEffect,
  useId,
  useRef,
  lazy,
  Suspense,
} from "react";
import {
  Clock,
  Layers,
  ArrowRight,
  Smartphone,
  Monitor,
  Square,
  FolderOpen,
  Play,
} from "@/icons/lucide-compat";
import { Switch, Label, Button, cn } from "@openreel/ui";

import { useProjectStore } from "../../stores/project-store";
import { createEditorProject } from "../../services/project-creation";
import { ChannelVideoBuilderDialog } from "../editor/ChannelVideoBuilderDialog";
import { useUIStore } from "../../stores/ui-store";
import { SOCIAL_MEDIA_PRESETS, type SocialMediaCategory } from "@openreel/core";
import { useRouter } from "../../hooks/use-router";
import { useEditorPreload } from "../../hooks/useEditorPreload";
import { useAnalytics, AnalyticsEvents } from "../../hooks/useAnalytics";
import { usePhoneEditor } from "../../hooks/usePhoneEditor";
import { useOnboardingStore } from "../../stores/onboarding-store";
import { PathBand } from "../onboarding/shell/PathBand";
import { isDesktopRuntime, useOnboardingGate } from "../onboarding/shell/useOnboardingGate";
import { withUserProjectCreation } from "../onboarding/shell/project-intent";
import { CinemaBackdropCanvas } from "./CinemaBackdropCanvas";
import { StudioFrameDial, type StudioFpsPreset } from "./StudioFrameDial";
import "./welcome-studio.css";

const isDesktop =
  typeof window !== "undefined" && window.openreel?.platform === "desktop";

const MobileProjectHome = lazy(() =>
  import("./MobileProjectHome").then((module) => ({
    default: module.MobileProjectHome,
  })),
);

const TemplateGallery = lazy(() =>
  import("./TemplateGallery").then((module) => ({
    default: module.TemplateGallery,
  })),
);
const RecentProjects = lazy(() =>
  import("./RecentProjects").then((module) => ({
    default: module.RecentProjects,
  })),
);

const LoadingView = () => (
  <div role="status" className="p-6 text-center text-text-secondary">
    Carregando…
  </div>
);

interface FormatOption {
  id: string;
  preset: SocialMediaCategory;
  contractLabel: "Vertical" | "Horizontal" | "Square";
  label: string;
  description: string;
  dimensions: string;
  icon: React.ElementType;
  gradient: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: "vertical",
    preset: "tiktok",
    contractLabel: "Vertical",
    label: "Vertical",
    description: "Reels, TikTok, Shorts",
    dimensions: "1080 × 1920",
    icon: Smartphone,
    gradient: "from-amber-500/20 to-orange-500/10",
  },
  {
    id: "horizontal",
    preset: "youtube-video",
    contractLabel: "Horizontal",
    label: "Horizontal",
    description: "YouTube, Cinema, Web",
    dimensions: "1920 × 1080",
    icon: Monitor,
    gradient: "from-emerald-500/20 to-teal-500/10",
  },
  {
    id: "square",
    preset: "instagram-post",
    contractLabel: "Square",
    label: "Quadrado",
    description: "Feed & Social",
    dimensions: "1080 × 1080",
    icon: Square,
    gradient: "from-sky-500/20 to-indigo-500/10",
  },
];

const CutlineLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect
      x="4"
      y="4"
      width="40"
      height="40"
      rx="11"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path
      d="M14 15v18M34 15v18M14 24h20"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <circle cx="24" cy="24" r="4.5" fill="#f59e0b" />
  </svg>
);

type ViewMode = "home" | "templates" | "recent";

interface WelcomeScreenProps {
  initialTab?: "templates" | "recent";
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ initialTab }) => {
  const skipId = useId();
  const phone = usePhoneEditor();
  const setSkipWelcomeScreen = useUIStore(
    (state) => state.setSkipWelcomeScreen,
  );
  const skipWelcomeScreen = useUIStore((state) => state.skipWelcomeScreen);
  const { navigate } = useRouter();
  const { track } = useAnalytics();
  const gate = useOnboardingGate();
  const bandOpen = useOnboardingStore((state) => state.bandOpen === true);
  const dismissBand = useCallback(() => {
    if (isDesktopRuntime()) useOnboardingStore.getState().skip("user");
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>(initialTab ?? "home");
  const [fpsPreset, setFpsPreset] = useState<StudioFpsPreset>(30);
  const [creating, setCreating] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const creation = useRef<AbortController | null>(null);
  useEffect(() => () => creation.current?.abort(), []);

  useEditorPreload(true);

  const handleCreateProject = useCallback(
    async (option: FormatOption) => {
      if (creation.current || builderOpen) return;
      const controller = new AbortController();
      creation.current = controller;
      setCreating(true);
      setCreationError(null);
      const preset = SOCIAL_MEDIA_PRESETS[option.preset];
      try {
        const created = await withUserProjectCreation(() =>
          createEditorProject({
            name: `New ${option.contractLabel} Video`,
            settings: {
              width: preset.width,
              height: preset.height,
              frameRate: fpsPreset,
            },
            signal: controller.signal,
          }),
        );
        if (useProjectStore.getState().project.id !== created.id) return;
        if (isDesktopRuntime()) {
          const onboarding = useOnboardingStore.getState();
          onboarding.skip("format");
          onboarding.markFormatChosen(created.id);
        }
        track(AnalyticsEvents.PROJECT_CREATED, {
          preset: option.preset,
          width: preset.width,
          height: preset.height,
          frameRate: fpsPreset,
          source: "quick_start",
        });
        navigate("editor");
      } catch (reason) {
        if (!controller.signal.aborted)
          setCreationError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível criar o projeto. Tente novamente.",
          );
      } finally {
        if (creation.current === controller) creation.current = null;
        if (!controller.signal.aborted) setCreating(false);
      }
    },
    [navigate, track, fpsPreset, builderOpen],
  );

  const handleOpenBuilder = useCallback(() => {
    if (creating) return;
    setBuilderOpen(true);
  }, [creating]);

  const handleTemplateApplied = useCallback(() => {
    navigate("editor");
  }, [navigate]);

  const handleProjectSelected = useCallback(() => {
    navigate("editor");
  }, [navigate]);

  useEffect(() => {
    if (skipWelcomeScreen && !initialTab && !bandOpen) {
      navigate("editor");
    }
  }, [skipWelcomeScreen, initialTab, navigate, bandOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        phone ||
        e.defaultPrevented ||
        (e.target instanceof Element &&
          e.target.closest(
            "input, textarea, select, [contenteditable], [role=dialog], [role=menu], [role=listbox]",
          ))
      )
        return;
      if (e.key === "Escape") {
        if (viewMode !== "home") {
          setViewMode("home");
        } else {
          navigate("editor");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, viewMode, phone]);

  if (phone)
    return (
      <Suspense fallback={<LoadingView />}>
        <MobileProjectHome initialTab={initialTab} />
      </Suspense>
    );

  if (viewMode === "templates") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <Button
            onClick={() => setViewMode("home")}
            type="button"
            aria-label="Back"
            className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[7px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-7 px-2.5 text-[12px] bg-transparent text-fg-2 hover:bg-bg-2 hover:text-fg"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <ArrowRight className="rotate-180" size={16} aria-hidden />
            </span>
            <span className="truncate">Voltar</span>
          </Button>
          <span className="font-medium text-sm text-text-primary">
            Templates
          </span>
          <div className="w-16" />
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<LoadingView />}>
            <TemplateGallery onTemplateApplied={handleTemplateApplied} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (viewMode === "recent") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <Button
            onClick={() => setViewMode("home")}
            type="button"
            aria-label="Back"
            className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[7px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-7 px-2.5 text-[12px] bg-transparent text-fg-2 hover:bg-bg-2 hover:text-fg"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <ArrowRight className="rotate-180" size={16} aria-hidden />
            </span>
            <span className="truncate">Voltar</span>
          </Button>
          <span className="font-medium text-sm text-text-primary">
            Projetos Recentes
          </span>
          <div className="w-16" />
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<LoadingView />}>
            <RecentProjects onProjectSelected={handleProjectSelected} />
          </Suspense>
        </div>
      </div>
    );
  }

  const compact = gate.showBand;
  const busy = creating;

  return (
    <div className="fixed inset-0 z-50 bg-[#08090c] text-zinc-100 overflow-hidden">
      <CinemaBackdropCanvas />
      <ChannelVideoBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        defaultFps={fpsPreset}
        onBuilt={() => {
          dismissBand();
          navigate("editor");
        }}
      />

      <div data-testid="welcome-scroller" className="relative z-10 h-full overflow-y-auto">
        <div className="flex min-h-full flex-col items-center px-6 py-6">
          <div className="my-auto w-full max-w-4xl">
            <div
              className={cn(
                "flex flex-col items-center text-center",
                compact ? "mb-4" : "mb-9",
              )}
            >
              <div className={cn("flex items-center gap-3", compact ? "mb-3" : "mb-5")}>
                <div className={cn("text-zinc-100", compact ? "w-9 h-9" : "w-11 h-11")}>
                  <CutlineLogo className="w-full h-full" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="font-semibold text-lg tracking-tight text-white">
                    Cutline Studio
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-400/90">
                    Edição WebGPU & WebCodecs
                  </span>
                </div>
              </div>

              <h1
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                className={cn(
                  "font-semibold tracking-tight text-white",
                  compact ? "text-3xl mb-1" : "text-4xl sm:text-5xl mb-3",
                )}
              >
                Da captura ao corte final.
              </h1>
              <p
                className={cn(
                  "max-w-xl text-zinc-300/90 font-normal",
                  compact ? "text-sm mb-3" : "text-base mb-5",
                )}
              >
                {isDesktop
                  ? "Ilha de edição profissional local com processamento em GPU."
                  : "Edição multipista, color grading e mixagem de áudio direto no navegador — sem upload para servidores."}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <StudioFrameDial
                  value={fpsPreset}
                  onChange={setFpsPreset}
                  disabled={busy}
                />

                <div className="uiv_scoped_studio_cta">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleOpenBuilder}
                    className="studio-cta-btn"
                  >
                    <span className="studio-cta-icon" aria-hidden="true">
                      <Play size={13} fill="currentColor" />
                    </span>
                    <span className="studio-cta-label text-xs font-semibold tracking-wide">
                      Criar Vídeo Nível Canal
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <PathBand />

            {compact && (
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Ou escolha um formato em branco
              </p>
            )}

            <div className={cn("grid grid-cols-1 sm:grid-cols-3", compact ? "gap-3 mb-4" : "gap-4 mb-8")}>
              {FORMAT_OPTIONS.map((option) => {
                const Icon = option.icon;

                return (
                  <Button
                    variant="ghost"
                    key={option.id}
                    onClick={() => handleCreateProject(option)}
                    type="button"
                    aria-label={`Create ${option.contractLabel} project`}
                    disabled={busy}
                    className={cn(
                      "group relative flex h-auto min-w-0 flex-col items-center whitespace-normal rounded-2xl border border-white/10 bg-[#121318]/80 backdrop-blur-md text-left",
                      "transition-[background-color,border-color,transform,box-shadow] duration-200 motion-reduce:transition-none",
                      "hover:-translate-y-0.5 hover:border-amber-400/50 hover:bg-[#171920]/90 hover:shadow-[0_18px_40px_-15px_rgba(245,158,11,0.28)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      compact ? "p-4" : "p-6",
                    )}
                  >
                    <div
                      className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${option.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300 motion-reduce:transition-none`}
                    />

                    <div className="relative z-10 flex flex-col items-center">
                      <div
                        className={cn(
                          "flex items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors duration-200 group-hover:border-amber-400/40 group-hover:bg-amber-500/15 motion-reduce:transition-none",
                          compact ? "w-10 h-10 mb-2" : "w-14 h-14 mb-4",
                        )}
                      >
                        <Icon
                          size={compact ? 20 : 26}
                          className="text-zinc-300 transition-colors group-hover:text-amber-300"
                        />
                      </div>

                      <span
                        className={cn(
                          "font-semibold text-white",
                          compact ? "text-base mb-0.5" : "text-lg mb-1",
                        )}
                      >
                        {option.label}
                      </span>
                      <span
                        className={cn(
                          "font-normal text-zinc-400",
                          compact ? "text-xs mb-2" : "text-sm mb-3",
                        )}
                      >
                        {option.description}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-300 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-md">
                        {option.dimensions} · {fpsPreset}fps
                      </span>
                    </div>

                    {!compact && (
                      <div className="mt-4 flex items-center gap-1 text-xs font-medium text-amber-300 opacity-75 group-hover:opacity-100 transition-opacity duration-200">
                        Iniciar linha do tempo
                        <ArrowRight size={13} />
                      </div>
                    )}
                  </Button>
                );
              })}
            </div>

            {creating && (
              <p role="status" className="mb-4 text-center text-xs text-amber-300">
                Preparando projeto e estúdio…
              </p>
            )}
            {creationError && (
              <p role="alert" className="mb-4 text-center text-xs text-red-400">
                {creationError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={() => {
                  dismissBand();
                  setViewMode("templates");
                }}
                type="button"
                aria-label="Browse templates"
                disabled={busy}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 disabled:pointer-events-none disabled:opacity-50 h-8 px-3.5 text-[12px] border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white rounded-xl"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <Layers size={15} aria-hidden />
                </span>
                <span className="truncate">Modelos prontos</span>
              </Button>
              <Button
                onClick={() => {
                  dismissBand();
                  setViewMode("recent");
                }}
                type="button"
                aria-label="Recent projects"
                disabled={busy}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 disabled:pointer-events-none disabled:opacity-50 h-8 px-3.5 text-[12px] border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white rounded-xl"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <Clock size={15} aria-hidden />
                </span>
                <span className="truncate">Projetos recentes</span>
              </Button>
              <Button
                onClick={() => {
                  dismissBand();
                  navigate("editor");
                }}
                type="button"
                aria-label="Open editor"
                disabled={busy}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 disabled:pointer-events-none disabled:opacity-50 h-8 px-3.5 text-[12px] border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white rounded-xl"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <FolderOpen size={15} aria-hidden />
                </span>
                <span className="truncate">Abrir editor vazio</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 flex shrink-0 items-center gap-4 text-zinc-400">
            <div className="flex items-center gap-2">
              <Switch
                id={skipId}
                aria-label="Skip on startup"
                disabled={busy}
                checked={skipWelcomeScreen}
                onCheckedChange={setSkipWelcomeScreen}
              />
              <Label htmlFor={skipId} className="text-xs text-zinc-400">
                Pular tela inicial
              </Label>
            </div>

            {gate.enabled && !gate.showBand && (
              <>
                <span className="text-zinc-600">·</span>
                <button
                  type="button"
                  onClick={() => useOnboardingStore.getState().reopenBand()}
                  className="rounded text-xs text-zinc-400 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-amber-400 motion-reduce:transition-none"
                >
                  Configuração
                </button>
              </>
            )}

            {!compact && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="font-normal text-xs text-zinc-400">
                  Pressione{" "}
                  <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/15 rounded text-zinc-300 font-mono text-[10px]">
                    Esc
                  </kbd>{" "}
                  para ir ao editor
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
