import type { Keyframe, TransitionType } from "@openreel/core";
import { v4 as uuidv4 } from "uuid";
import type { ColorGradingSettings } from "../bridges/effects-bridge";
import { useAIConnectionStore, isAIConnectionReady } from "../stores/ai-connection-store";
import { useProjectStore } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";
import { createEditorProject } from "./project-creation";
import { searchStockFootage, preferredFootageSource } from "./stock-footage";

export type ChannelVideoFormat = "16:9" | "9:16";
export type ChannelVisualStyle = "documentary" | "tech" | "noir" | "viral";

export interface ChannelVideoRequest {
  topic: string;
  format: ChannelVideoFormat;
  style: ChannelVisualStyle;
  fps?: 24 | 30 | 60;
  onProgress?: (percent: number, stage: string) => void;
}

interface PlannedScene {
  title: string;
  caption: string;
  searchQuery: string;
  duration: number;
}

interface StyleProfile {
  label: string;
  transition: TransitionType;
  bpm: number;
  rootHz: number;
  grading: Partial<ColorGradingSettings>;
}

const STYLE_PROFILES: Record<ChannelVisualStyle, StyleProfile> = {
  documentary: {
    label: "Documentário Cinema",
    transition: "filmDissolve",
    bpm: 92,
    rootHz: 110,
    grading: {
      pipelineVersion: 2,
      temperature: 10,
      tint: 2,
      tone: {
        exposure: 0.05,
        contrast: 0.16,
        highlights: -0.14,
        shadows: -0.05,
        whites: 0.05,
        blacks: -0.08,
      },
      vignette: { amount: -0.22, midpoint: 0.5, roundness: 0.3, feather: 0.65 },
    },
  },
  tech: {
    label: "Tech & Ciência",
    transition: "crossZoom",
    bpm: 114,
    rootHz: 130.81,
    grading: {
      pipelineVersion: 2,
      temperature: -6,
      tint: -3,
      tone: {
        exposure: 0.02,
        contrast: 0.2,
        highlights: -0.1,
        shadows: 0.06,
        whites: 0.08,
        blacks: -0.12,
      },
      colorWheels: {
        shadows: { r: -0.05, g: 0.02, b: 0.08 },
        midtones: { r: 0.02, g: 0.01, b: -0.02 },
        highlights: { r: 0.08, g: 0.03, b: -0.05 },
        shadowsLift: 0,
        midtonesGamma: 1,
        highlightsGain: 1,
      },
      vignette: { amount: -0.18, midpoint: 0.52, roundness: 0.4, feather: 0.6 },
    },
  },
  noir: {
    label: "Noir & Mistério",
    transition: "filmBurn",
    bpm: 84,
    rootHz: 98,
    grading: {
      pipelineVersion: 2,
      temperature: 0,
      tint: 0,
      tone: {
        exposure: 0.04,
        contrast: 0.32,
        highlights: 0.1,
        shadows: -0.18,
        whites: 0.12,
        blacks: -0.16,
      },
      hsl: {
        hue: [0, 0, 0, 0, 0, 0, 0, 0],
        saturation: [-100, -100, -100, -100, -100, -100, -100, -100],
        luminance: [0, 0, 0, 0, 0, 0, 0, 0],
      },
      vignette: { amount: -0.34, midpoint: 0.42, roundness: 0.25, feather: 0.55 },
    },
  },
  viral: {
    label: "Ritmo Viral & Dinâmico",
    transition: "crossZoom",
    bpm: 124,
    rootHz: 146.83,
    grading: {
      pipelineVersion: 2,
      temperature: 14,
      tint: 4,
      tone: {
        exposure: 0.1,
        contrast: 0.14,
        highlights: -0.12,
        shadows: 0.12,
        whites: 0.06,
        blacks: -0.04,
      },
      hsl: {
        hue: [0, 0, 0, 0, 0, 0, 0, 0],
        saturation: [12, 16, 10, 0, 0, 0, 0, 0],
        luminance: [0, 4, 0, 0, 0, 0, 0, 0],
      },
      vignette: { amount: -0.12, midpoint: 0.56, roundness: 0.4, feather: 0.68 },
    },
  },
};

function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function buildCinemaSoundtrackFile(durationSeconds: number, profile: StyleProfile): File {
  const sampleRate = 44100;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const samples = new Float32Array(totalSamples);
  const beatInterval = 60 / profile.bpm;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatPhase = (t % beatInterval) / beatInterval;
    const subPulse = Math.exp(-beatPhase * 9) * Math.sin(2 * Math.PI * (profile.rootHz * 0.5 + 45 * Math.exp(-beatPhase * 16)) * t) * 0.35;
    const pad =
      (Math.sin(2 * Math.PI * profile.rootHz * t) +
        0.65 * Math.sin(2 * Math.PI * profile.rootHz * 1.498 * t) +
        0.35 * Math.sin(2 * Math.PI * profile.rootHz * 2 * t + Math.sin(t * 1.2) * 0.25)) *
      0.11;
    const shimmer = Math.sin(2 * Math.PI * profile.rootHz * 3 * t) * (0.025 + 0.02 * Math.sin(t * 0.8));
    const fadeIn = Math.min(1, t / 0.6);
    const fadeOut = Math.min(1, (durationSeconds - t) / 1.0);
    samples[i] = (subPulse + pad + shimmer) * fadeIn * fadeOut;
  }

  return new File([encodeWavPcm16(samples, sampleRate)], "Cutline_Cinema_Score.wav", {
    type: "audio/wav",
  });
}

function fallbackScenesFromTopic(topic: string): PlannedScene[] {
  const cleanTopic = topic.trim() || "A Engenharia do Futuro";
  const lower = cleanTopic.toLowerCase();

  let visualHints = ["city skyline night", "galaxy stars space", "ocean waves aerial", "architecture sunlight", "technology laboratory"];
  if (/roma|império|imperio|história|historia|guerra|antigo/.test(lower)) {
    visualHints = ["Roman Forum ruins", "Colosseum Rome", "ancient marble statue", "Mediterranean sea sunset", "Rome skyline"];
  } else if (/espaço|espaco|foguete|universo|lua|marte|nasa|estrela/.test(lower)) {
    visualHints = ["rocket launch", "Earth from space", "nebula Hubble telescope", "astronaut spacewalk", "Milky Way night sky"];
  } else if (/mente|psicologia|hábito|habito|cérebro|cerebro|foco|sucesso/.test(lower)) {
    visualHints = ["human brain neuron", "sunrise mountain peak", "person running sunrise", "city traffic timelapse", "lighthouse ocean"];
  } else if (/dinheiro|economia|bitcoin|mercado|negócio|negocio|empresa/.test(lower)) {
    visualHints = ["Manhattan financial district", "server room datacenter", "stock exchange trading", "gold bullion", "modern glass skyscraper"];
  }

  return [
    {
      title: cleanTopic.slice(0, 34).toUpperCase(),
      caption: `Quase ninguém percebe o que realmente move ${cleanTopic.slice(0, 48)}.`,
      searchQuery: visualHints[0],
      duration: 4.5,
    },
    {
      title: "O INÍCIO DA VIRADA",
      caption: "Tudo começa nos detalhes que passam despercebidos no dia a dia.",
      searchQuery: visualHints[1],
      duration: 4.5,
    },
    {
      title: "A ESCALA REAL",
      caption: "Quando os padrões se conectam, o impacto muda completamente de nível.",
      searchQuery: visualHints[2],
      duration: 4.5,
    },
    {
      title: "O PONTO CRÍTICO",
      caption: "Quem domina esse processo sai anos na frente da maioria.",
      searchQuery: visualHints[3],
      duration: 4.5,
    },
    {
      title: "O PRÓXIMO PASSO",
      caption: "Agora você tem a visão completa — salve e aplique hoje.",
      searchQuery: visualHints[4],
      duration: 4.5,
    },
  ];
}

async function generatePlannedScenes(topic: string): Promise<{ scenes: PlannedScene[]; usedAi: boolean }> {
  const prompt = [
    `Crie um roteiro curto de vídeo nível canal grande do YouTube/Shorts sobre: "${topic}".`,
    "Responda APENAS com JSON válido (sem markdown) no formato:",
    `{"scenes":[{"title":"TITULO CURTO","caption":"Frase falada forte em português (8 a 14 palavras)","searchQuery":"2 to 3 English keywords for documentary stock video/photo","duration":4.5}]}`,
    "Gere exatamente 5 cenas: cena 1 deve ser um gancho forte nos primeiros segundos. searchQuery deve ser termos visuais concretos em inglês (ex: 'rocket launch', 'Rome Colosseum', 'ocean storm').",
  ].join("\n");

  const conn = useAIConnectionStore.getState();
  const tryParseScenes = (content: string): PlannedScene[] | null => {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as { scenes?: Array<Partial<PlannedScene>> };
      if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 3) return null;
      return parsed.scenes.slice(0, 6).map((s, idx) => ({
        title: String(s.title || `CENA ${idx + 1}`).slice(0, 36),
        caption: String(s.caption || topic).slice(0, 140),
        searchQuery: String(s.searchQuery || "cinematic landscape").slice(0, 60),
        duration: typeof s.duration === "number" && s.duration >= 2.5 && s.duration <= 10 ? s.duration : 4.5,
      }));
    } catch {
      return null;
    }
  };

  // 1) Try user's configured connection first
  if (isAIConnectionReady(conn)) {
    try {
      const baseUrl = conn.baseUrl.replace(/\/+$/, "");
      const isAnthropic = conn.provider === "anthropic";
      const res = await fetch(`${baseUrl}${isAnthropic ? "/messages" : "/chat/completions"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(isAnthropic
            ? { "x-api-key": conn.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
            : conn.apiKey
              ? { Authorization: `Bearer ${conn.apiKey}` }
              : {}),
        },
        body: JSON.stringify(
          isAnthropic
            ? { model: conn.model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }
            : { model: conn.model, temperature: 0.7, messages: [{ role: "user", content: prompt }] },
        ),
      });
      if (res.ok) {
        const json = await res.json();
        const text = isAnthropic
          ? json?.content?.[0]?.text || ""
          : json?.choices?.[0]?.message?.content || "";
        const scenes = tryParseScenes(String(text));
        if (scenes) return { scenes, usedAi: true };
      }
    } catch {
      // Fallback to server route or deterministic scenes
    }
  }

  // 2) Try serverless Vercel API route (works when owner configured GEMINI_API_KEY / GROQ_API_KEY in Vercel)
  try {
    const serverRes = await fetch("/api/studio-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "chat",
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (serverRes.ok) {
      const json = await serverRes.json();
      const text = json?.choices?.[0]?.message?.content || "";
      const scenes = tryParseScenes(String(text));
      if (scenes) return { scenes, usedAi: true };
    }
  } catch {
    // Fallback below
  }

  return { scenes: fallbackScenesFromTopic(topic), usedAi: false };
}

async function fetchWikimediaImageFile(query: string, index: number): Promise<File | null> {
  try {
    const apiUrl = new URL("https://commons.wikimedia.org/w/api.php");
    apiUrl.search = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      origin: "*",
      generator: "search",
      gsrnamespace: "6",
      gsrsearch: `${query} filetype:bitmap`,
      gsrlimit: "5",
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "1280",
    }).toString();

    const res = await fetch(apiUrl.href, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: { pages?: Array<{ imageinfo?: Array<{ thumburl?: string; url?: string; mime?: string; width?: number }> }> };
    };
    const pages = data.query?.pages ?? [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const imgUrl = info?.thumburl || info?.url;
      if (!imgUrl || !imgUrl.startsWith("https://")) continue;

      // Try via our Vercel media proxy first so COEP require-corp never blocks it; fallback to direct fetch
      let blob: Blob | null = null;
      try {
        const proxyRes = await fetch(`/api/media-proxy?url=${encodeURIComponent(imgUrl)}`);
        if (proxyRes.ok) blob = await proxyRes.blob();
      } catch {
        // Ignore and try direct
      }
      if (!blob) {
        const directRes = await fetch(imgUrl, { credentials: "omit", referrerPolicy: "no-referrer" });
        if (directRes.ok) blob = await directRes.blob();
      }
      if (blob && blob.size > 5000 && blob.type.startsWith("image/")) {
        const ext = blob.type.includes("png") ? "png" : "jpg";
        return new File([blob], `Cena_${index + 1}_${query.replace(/[^a-z0-9]/gi, "_").slice(0, 24)}.${ext}`, {
          type: blob.type,
        });
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchSceneMediaFile(query: string, index: number, format: ChannelVideoFormat): Promise<File> {
  // 1) Try Pexels via server proxy if PEXELS_API_KEY is configured on Vercel
  try {
    const pexelsRes = await fetch("/api/studio-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "stock",
        query,
        orientation: format === "9:16" ? "portrait" : "landscape",
      }),
    });
    if (pexelsRes.ok) {
      const pexelsData = (await pexelsRes.json()) as {
        videos?: Array<{ video_files?: Array<{ link?: string; width?: number; file_type?: string }> }>;
      };
      const firstVideo = pexelsData.videos?.[0]?.video_files?.find(
        (vf) => vf.file_type === "video/mp4" && (vf.width ?? 0) >= 720 && (vf.width ?? 0) <= 1920,
      ) ?? pexelsData.videos?.[0]?.video_files?.[0];
      if (firstVideo?.link) {
        const proxyRes = await fetch(`/api/media-proxy?url=${encodeURIComponent(firstVideo.link)}`);
        if (proxyRes.ok) {
          const blob = await proxyRes.blob();
          if (blob.size > 10_000) {
            return new File([blob], `Broll_${index + 1}_Pexels.mp4`, { type: "video/mp4" });
          }
        }
      }
    }
  } catch {
    // Continue to Wikimedia fallback
  }

  // 2) Try real free video footage from Wikimedia Commons
  try {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 9000);
    const page = await searchStockFootage(query, ac.signal);
    window.clearTimeout(timer);
    const candidate = page.items.find((item) => item.duration >= 2 && item.duration <= 60) ?? page.items[0];
    if (candidate) {
      const src = preferredFootageSource(candidate);
      if (src?.url) {
        let blob: Blob | null = null;
        try {
          const proxyRes = await fetch(`/api/media-proxy?url=${encodeURIComponent(src.url)}`);
          if (proxyRes.ok) blob = await proxyRes.blob();
        } catch {
          // ignore
        }
        if (blob && blob.size > 10_000) {
          const ext = src.mime.includes("mp4") ? "mp4" : "webm";
          return new File([blob], `Broll_${index + 1}_Commons.${ext}`, { type: src.mime });
        }
      }
    }
  } catch {
    // Continue to Wikimedia HD photo fallback
  }

  // 3) Try real high-res photography from Wikimedia Commons (animated via Ken Burns keyframes!)
  const imageFile = await fetchWikimediaImageFile(query, index);
  if (imageFile) return imageFile;

  // 4) Fallback procedural high-res still frame so timeline assembly never fails offline
  const width = format === "9:16" ? 1080 : 1280;
  const height = format === "9:16" ? 1920 : 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#0b0f19");
  grad.addColorStop(0.5, index % 2 === 0 ? "#1e293b" : "#1f160c");
  grad.addColorStop(1, "#064e3b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92));
  return new File([blob], `Cena_${index + 1}_Backdrop.jpg`, { type: "image/jpeg" });
}

export async function buildChannelLevelVideo(request: ChannelVideoRequest): Promise<{ usedAi: boolean; sceneCount: number }> {
  const { topic, format, style, fps = 30, onProgress } = request;
  const width = format === "9:16" ? 1080 : 1920;
  const height = format === "9:16" ? 1920 : 1080;
  const profile = STYLE_PROFILES[style];

  onProgress?.(8, "Preparando estúdio e roteiro cinematográfico...");
  await createEditorProject({
    name: `${topic.trim().slice(0, 32) || "Cutline Production"}`,
    settings: { width, height, frameRate: fps },
  });

  onProgress?.(18, "Estruturando cenas, gancho e legendas...");
  const { scenes, usedAi } = await generatePlannedScenes(topic);

  onProgress?.(32, `Buscando ${scenes.length} B-rolls reais em HD...`);
  const mediaFiles = await Promise.all(
    scenes.map((scene, index) => fetchSceneMediaFile(scene.searchQuery, index, format)),
  );

  onProgress?.(60, "Importando mídia e gerando trilha sonora...");
  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);
  const soundtrackFile = buildCinemaSoundtrackFile(totalDuration + 0.5, profile);

  const store = useProjectStore.getState();
  for (const file of mediaFiles) {
    await store.importMedia(file);
  }
  await useProjectStore.getState().importMedia(soundtrackFile);

  let videoTrack = useProjectStore.getState().project.timeline.tracks.find((t) => t.type === "video");
  if (!videoTrack) {
    await useProjectStore.getState().addTrack("video");
    videoTrack = useProjectStore.getState().project.timeline.tracks.find((t) => t.type === "video");
  }
  let audioTrack = useProjectStore.getState().project.timeline.tracks.find((t) => t.type === "audio");
  if (!audioTrack) {
    await useProjectStore.getState().addTrack("audio");
    audioTrack = useProjectStore.getState().project.timeline.tracks.find((t) => t.type === "audio");
  }

  onProgress?.(78, "Montando timeline, Ken Burns e transições de cinema...");
  const latestItems = useProjectStore.getState().project.mediaLibrary.items;
  let cursor = 0;
  const placedClipIds: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const file = mediaFiles[i];
    const scene = scenes[i];
    const mediaItem = latestItems.find((item) => item.name === file.name);
    if (!videoTrack || !mediaItem) continue;

    await useProjectStore.getState().addClip(videoTrack.id, mediaItem.id, cursor);
    const trackNow = useProjectStore.getState().project.timeline.tracks.find((t) => t.id === videoTrack!.id);
    const clip = trackNow?.clips.find((c) => Math.abs(c.startTime - cursor) < 0.05 && c.mediaId === mediaItem.id);

    if (clip) {
      placedClipIds.push(clip.id);
      if (clip.duration > scene.duration) {
        await useProjectStore.getState().trimClip(clip.id, clip.inPoint, clip.inPoint + scene.duration);
      }

      // Apply Ken Burns smooth zoom/pan keyframes
      const zoomStart = i % 2 === 0 ? 1.0 : 1.14;
      const zoomEnd = i % 2 === 0 ? 1.14 : 1.02;
      const panStart = i % 2 === 0 ? -0.02 : 0.02;
      const panEnd = i % 2 === 0 ? 0.02 : -0.02;
      const keyframes: Keyframe[] = [
        { id: uuidv4(), time: 0, property: "scale.x", value: zoomStart, easing: "ease-in-out" },
        { id: uuidv4(), time: scene.duration, property: "scale.x", value: zoomEnd, easing: "ease-in-out" },
        { id: uuidv4(), time: 0, property: "scale.y", value: zoomStart, easing: "ease-in-out" },
        { id: uuidv4(), time: scene.duration, property: "scale.y", value: zoomEnd, easing: "ease-in-out" },
        { id: uuidv4(), time: 0, property: "position.x", value: panStart, easing: "ease-in-out" },
        { id: uuidv4(), time: scene.duration, property: "position.x", value: panEnd, easing: "ease-in-out" },
      ];
      useProjectStore.getState().updateClipKeyframes(clip.id, keyframes);
      await useProjectStore.getState().updateColorGrading(clip.id, profile.grading);
    }

    cursor += scene.duration;
  }

  // Add cinematic transitions between scenes
  for (let i = 0; i < placedClipIds.length - 1; i++) {
    await useProjectStore.getState().addClipTransition({
      id: uuidv4(),
      clipAId: placedClipIds[i],
      clipBId: placedClipIds[i + 1],
      type: profile.transition,
      duration: 0.45,
      params: {},
    });
  }

  onProgress?.(90, "Adicionando títulos de gancho e legendas dinâmicas...");
  const scoreItem = useProjectStore.getState().project.mediaLibrary.items.find((m) => m.name === soundtrackFile.name);
  if (audioTrack && scoreItem) {
    await useProjectStore.getState().addClip(audioTrack.id, scoreItem.id, 0);
  }

  // Opening hook title
  await useProjectStore.getState().addTrack("text");
  const textTrack = useProjectStore.getState().project.timeline.tracks.find((t) => t.type === "text");
  if (textTrack && scenes[0]) {
    const titleClip = useProjectStore.getState().createTextClip(
      textTrack.id,
      0.2,
      scenes[0].title,
      Math.min(3.0, scenes[0].duration - 0.3),
      {
        fontFamily: "Fraunces",
        fontSize: format === "9:16" ? 68 : 82,
        fontWeight: 700,
        color: "#ffffff",
        letterSpacing: 1,
      },
    );
    if (titleClip) {
      useProjectStore.getState().updateTextTransform(titleClip.id, { position: { x: 0.5, y: 0.28 } });
    }
  }

  // Dynamic word-by-word captions across all scenes
  let captionCursor = 0;
  for (const scene of scenes) {
    await useProjectStore.getState().addSubtitle({
      id: uuidv4(),
      text: scene.caption,
      startTime: captionCursor + 0.15,
      endTime: captionCursor + scene.duration - 0.15,
      animationStyle: "word-by-word",
      style: {
        fontFamily: "Inter",
        fontSize: format === "9:16" ? 42 : 36,
        color: "#ffffff",
        highlightColor: "#f59e0b",
        strokeColor: "#000000",
        strokeWidth: 3,
        backgroundColor: "rgba(9, 10, 13, 0.72)",
        position: "bottom",
      },
    });
    captionCursor += scene.duration;
  }

  if (placedClipIds[0]) {
    useUIStore.getState().select({ id: placedClipIds[0], type: "clip" });
  }
  onProgress?.(100, "Produção montada na timeline!");
  return { usedAi, sceneCount: scenes.length };
}
