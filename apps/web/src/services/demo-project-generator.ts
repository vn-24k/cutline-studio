import { useProjectStore } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";
import { createEditorProject } from "./project-creation";

function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
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

/**
 * Generates a rhythmic demo soundtrack with intentional silence pockets
 * so beat detection, waveform rendering and silence cutting can be tested right away.
 */
function buildProceduralAudioFile(durationSeconds = 9): File {
  const sampleRate = 44100;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const samples = new Float32Array(totalSamples);
  const bpm = 112;
  const beatInterval = 60 / bpm;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    // Intentional silent gap between 3.3s and 4.4s and between 7.1s and 8.0s for silence-cut testing
    if ((t > 3.3 && t < 4.4) || (t > 7.1 && t < 8.0)) {
      samples[i] = 0;
      continue;
    }

    const beatPhase = (t % beatInterval) / beatInterval;
    const kick = Math.exp(-beatPhase * 12) * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-beatPhase * 18)) * t) * 0.55;
    const chord =
      (Math.sin(2 * Math.PI * 220 * t) +
        0.7 * Math.sin(2 * Math.PI * 277.18 * t) +
        0.5 * Math.sin(2 * Math.PI * 329.63 * t)) *
      0.12;
    const fadeIn = Math.min(1, t / 0.25);
    const fadeOut = Math.min(1, (durationSeconds - t) / 0.35);
    samples[i] = (kick + chord) * fadeIn * fadeOut;
  }

  const blob = encodeWavPcm16(samples, sampleRate);
  return new File([blob], "Cutline_Demo_Beat_112BPM.wav", { type: "audio/wav" });
}

async function renderSceneVideoFile(options: {
  filename: string;
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  scene: "intro" | "motion";
}): Promise<File> {
  const { filename, width, height, durationMs, fps, scene } = options;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
    throw new Error("Seu navegador não suporta captura de stream em Canvas para gerar o vídeo demo.");
  }

  const mimeCandidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 3_500_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error("Falha ao gravar clipe de demonstração."));
  });

  const drawFrame = (progress: number) => {
    ctx.clearRect(0, 0, width, height);

    if (scene === "intro") {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#090a0f");
      grad.addColorStop(0.55, "#1a140b");
      grad.addColorStop(1, "#0b1915");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Animated cinema light sweep
      const cx = width * (0.2 + 0.6 * progress);
      const cy = height * (0.45 + Math.sin(progress * Math.PI * 2) * 0.08);
      const radial = ctx.createRadialGradient(cx, cy, 20, cx, cy, width * 0.45);
      radial.addColorStop(0, "rgba(245, 158, 11, 0.42)");
      radial.addColorStop(0.5, "rgba(16, 185, 129, 0.14)");
      radial.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      // Safe-area technical reticle
      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 2;
      ctx.strokeRect(width * 0.08, height * 0.1, width * 0.84, height * 0.8);

      ctx.fillStyle = "#f59e0b";
      ctx.font = `600 ${Math.round(height * 0.032)}px monospace`;
      ctx.fillText(`REEL 01 · ${width}x${height} · ${fps}FPS`, width * 0.11, height * 0.18);

      ctx.fillStyle = "#f8fafc";
      ctx.font = `700 ${Math.round(height * 0.085)}px sans-serif`;
      ctx.fillText("CUTLINE STUDIO", width * 0.11, height * 0.52);

      ctx.fillStyle = "rgba(226, 232, 240, 0.78)";
      ctx.font = `400 ${Math.round(height * 0.036)}px sans-serif`;
      ctx.fillText("CENA DE ABERTURA · CORTE, COR E AUDIO EM TEMPO REAL", width * 0.11, height * 0.61);
    } else {
      const grad = ctx.createLinearGradient(width, 0, 0, height);
      grad.addColorStop(0, "#051914");
      grad.addColorStop(0.5, "#111827");
      grad.addColorStop(1, "#1e1b4b");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Moving geometric bars for visual motion / color grading test
      for (let i = 0; i < 6; i++) {
        const x = ((i * 0.18 + progress * 0.65) % 1.1) * width - width * 0.05;
        const barH = height * (0.35 + 0.15 * Math.sin(progress * Math.PI * 2 + i));
        ctx.fillStyle = i % 2 === 0 ? "rgba(43, 212, 154, 0.28)" : "rgba(245, 158, 11, 0.25)";
        ctx.fillRect(x, (height - barH) / 2, width * 0.07, barH);
      }

      ctx.fillStyle = "#2bd49a";
      ctx.font = `600 ${Math.round(height * 0.032)}px monospace`;
      ctx.fillText("B-ROLL 02 · TESTE DE GRADE & TRANSICAO", width * 0.11, height * 0.2);

      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.round(height * 0.07)}px sans-serif`;
      const tc = (progress * (durationMs / 1000)).toFixed(2);
      ctx.fillText(`TIMECODE 00:00:0${tc}`, width * 0.11, height * 0.55);
    }
  };

  recorder.start(100);
  const start = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - start;
      const progress = Math.min(1, elapsed / durationMs);
      drawFrame(progress);
      if (elapsed < durationMs) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    tick();
  });

  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  const blob = await stopped;
  return new File([blob], filename, { type: mimeType });
}

export async function createDemoStudioProject(options?: {
  width?: number;
  height?: number;
  fps?: number;
}): Promise<void> {
  const width = options?.width ?? 1280;
  const height = options?.height ?? 720;
  const fps = options?.fps ?? 30;

  await createEditorProject({
    name: "Cutline Demo Reel",
    settings: { width, height, frameRate: fps },
  });

  const [sceneOne, sceneTwo] = await Promise.all([
    renderSceneVideoFile({
      filename: "01_Abertura_Cutline.webm",
      width,
      height,
      durationMs: 3200,
      fps,
      scene: "intro",
    }),
    renderSceneVideoFile({
      filename: "02_Motion_Broll.webm",
      width,
      height,
      durationMs: 3200,
      fps,
      scene: "motion",
    }),
  ]);
  const audioFile = buildProceduralAudioFile(8.5);

  const store = useProjectStore.getState();
  const [res1, res2, resAudio] = await Promise.all([
    store.importMedia(sceneOne),
    store.importMedia(sceneTwo),
    store.importMedia(audioFile),
  ]);

  const updated = useProjectStore.getState();
  const items = updated.project.mediaLibrary.items;
  const media1 = items.find((m) => m.name === sceneOne.name);
  const media2 = items.find((m) => m.name === sceneTwo.name);
  const mediaAudio = items.find((m) => m.name === audioFile.name);

  let videoTrack = updated.project.timeline.tracks.find((t) => t.type === "video");
  if (!videoTrack) {
    await updated.addTrack("video");
    videoTrack = useProjectStore.getState().project.timeline.tracks.find((t) => t.type === "video");
  }

  let audioTrack = useProjectStore.getState().project.timeline.tracks.find((t) => t.type === "audio");
  if (!audioTrack) {
    await useProjectStore.getState().addTrack("audio");
    audioTrack = useProjectStore.getState().project.timeline.tracks.find((t) => t.type === "audio");
  }

  if (videoTrack && media1 && res1.success) {
    await useProjectStore.getState().addClip(videoTrack.id, media1.id, 0);
  }
  if (videoTrack && media2 && res2.success) {
    const firstClip = useProjectStore
      .getState()
      .project.timeline.tracks.find((t) => t.id === videoTrack!.id)?.clips[0];
    const startSecond = firstClip ? firstClip.duration : 3.2;
    await useProjectStore.getState().addClip(videoTrack.id, media2.id, startSecond);
  }

  if (audioTrack && mediaAudio && resAudio.success) {
    await useProjectStore.getState().addClip(audioTrack.id, mediaAudio.id, 0);
  }

  // Add an editorial title overlay track
  await useProjectStore.getState().addTrack("text");
  const textTrack = useProjectStore.getState().project.timeline.tracks.find((t) => t.type === "text");
  if (textTrack) {
    useProjectStore.getState().createTextClip(
      textTrack.id,
      0.35,
      "EDICAO CINEMATOGRAFICA",
      2.6,
      {
        fontSize: Math.round(height * 0.065),
        fontWeight: 700,
        color: "#f8fafc",
        letterSpacing: 2,
      },
    );
  }

  // Select the first video clip so the inspector immediately reveals Color/Transform/Effects
  const firstClipId = useProjectStore
    .getState()
    .project.timeline.tracks.find((t) => t.type === "video")?.clips[0]?.id;
  if (firstClipId) {
    useUIStore.getState().select({ id: firstClipId, type: "clip" });
  }
}
