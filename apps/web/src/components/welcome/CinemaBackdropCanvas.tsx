import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Adapted from Shader-Transition GLSL FBM warp shader for cinematic ambient backdrop
const FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec3 uColorBase;
  uniform vec3 uColorAmber;
  uniform vec3 uColorEmerald;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.0 + vec2(13.7, 9.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vUv * 2.6;
    float t = uTime * 0.22;

    vec2 warp = vec2(
      fbm(p + vec2(0.0, t * 0.35) + uMouse * 0.18),
      fbm(p + vec2(5.2, 1.3) - vec2(t * 0.25, 0.0))
    );
    float w = fbm(p + 0.85 * warp);

    float waves = sin(vUv.x * 5.0 + t) * 0.04 + cos(vUv.y * 7.0 - t * 0.8) * 0.03;
    float band = smoothstep(0.25, 0.85, w + waves);

    vec3 col = mix(uColorBase, uColorAmber, band * 0.36);
    float emeraldGlow = smoothstep(0.62, 0.95, fbm(p * 1.4 - warp * 0.6)) * 0.22;
    col = mix(col, uColorEmerald, emeraldGlow);

    // Subtle film vignette
    float dist = distance(vUv, vec2(0.5, 0.45));
    col *= smoothstep(1.05, 0.2, dist);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const CinemaBackdropCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColorBase: { value: new THREE.Color("#08090c") },
      uColorAmber: { value: new THREE.Color("#92400e") },
      uColorEmerald: { value: new THREE.Color("#065f46") },
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const handleResize = () => {
      if (!renderer || !container) return;
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      renderer.setSize(width, height);
    };

    const targetMouse = new THREE.Vector2(0, 0);
    const handlePointerMove = (e: PointerEvent) => {
      targetMouse.x = (e.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      targetMouse.y = (0.5 - e.clientY / Math.max(window.innerHeight, 1)) * 2;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    let frameId = 0;
    const start = performance.now();

    const renderFrame = (now: number) => {
      uniforms.uTime.value = prefersReducedMotion ? 1.2 : (now - start) * 0.001;
      uniforms.uMouse.value.lerp(targetMouse, 0.05);
      renderer?.render(scene, camera);
      if (!prefersReducedMotion) {
        frameId = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame(start);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
      if (renderer?.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 opacity-90"
    />
  );
};
