'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sel, useStore } from '@/lib/store';
import {
  NOISE_GRID_BASE_PX,
  createNoiseGridUniforms,
  noiseGridFragmentShader,
  noiseGridVertexShader,
  type NoiseGridUniforms,
} from '@/lib/shaders/noiseGrid';

/** 三档性能里 canvas 允许的 dpr 上限（medium 降到 1） */
const DPR_CAP = { high: 1.5, medium: 1 } as const;

/** 光标影响半径（CSS px）/ 网格被推开的距离（CSS px） */
const MOUSE_RADIUS_CSS = 200;
const MOUSE_PUSH_CSS = 2.2;

/** 页面隐藏（visibilitychange）时返回 false，用来把 frameloop 切成 'never' */
function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/** 小屏用 10px 网格、桌面用 14px（参考站低档静态背景的两档间距） */
function useCompactGrid(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return compact;
}

/**
 * 低档退化：纯 CSS 静态网格（参考站低性能档就是「14px/10px 网格线的静态背景」，无 canvas）。
 * 用两层 repeating-linear-gradient 画细网格 + 主网格，底色 #020202。
 */
function StaticGrid() {
  const compact = useCompactGrid();
  const fine = compact ? 10 : NOISE_GRID_BASE_PX;
  const major = fine * 5;
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-canvas)',
        pointerEvents: 'none',
        backgroundColor: 'rgb(2 2 2)',
        backgroundImage: [
          `repeating-linear-gradient(to right, rgba(45,45,45,0.55) 0 1px, transparent 1px ${fine}px)`,
          `repeating-linear-gradient(to bottom, rgba(45,45,45,0.55) 0 1px, transparent 1px ${fine}px)`,
          `repeating-linear-gradient(to right, rgba(45,45,45,0.85) 0 1px, transparent 1px ${major}px)`,
          `repeating-linear-gradient(to bottom, rgba(45,45,45,0.85) 0 1px, transparent 1px ${major}px)`,
        ].join(','),
      }}
    />
  );
}

/**
 * WebGL 网格层：一个填满视口的 quad。
 * 相机用固定 NDC 视锥的正交相机（left/right/top/bottom = ±1），并让 R3F 自己把
 * camera.manual 置 true —— 于是窗口缩放不会改写视锥，网格永远按屏幕像素计算。
 */
function GridPlane({ detail }: { detail: number }) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const [material, setMaterial] = useState<THREE.ShaderMaterial | null>(null);
  const uniformsRef = useRef<NoiseGridUniforms | null>(null);
  /** 光标目标位置（设备像素、y 轴向上，和 gl_FragCoord 一致） */
  const mouseTarget = useRef({ x: -99999, y: -99999 });

  // 材质与 uniform 在 effect 里创建：StrictMode 的 挂载→卸载→再挂载 会 dispose 掉第一次的对象，
  // 如果放在 useMemo 里复用同一个被 dispose 的对象，第二次挂载就会拿到失效材质。
  useEffect(() => {
    const u = createNoiseGridUniforms();
    // 档位参数：medium 关掉第二个 octave（uDetail=0），噪声幅度也降一点
    u.uDetail.value = detail;
    u.uLineAlpha.value = detail > 0 ? 0.42 : 0.5;
    u.uNoiseAmount.value = detail > 0 ? 0.55 : 0.4;
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: noiseGridVertexShader,
      fragmentShader: noiseGridFragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    uniformsRef.current = u;
    setMaterial(m);
    return () => {
      uniformsRef.current = null;
      m.dispose();
    };
  }, [detail]);

  // 全局光标：算成设备像素。用 window 监听而不是 R3F 的 raycast —— 网格层 pointer-events:none，
  // 事件本来也不会落到 canvas 上。
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const dpr = gl.getPixelRatio();
      mouseTarget.current.x = e.clientX * dpr;
      mouseTarget.current.y = (window.innerHeight - e.clientY) * dpr;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [gl]);

  useFrame((_, delta) => {
    const u = uniformsRef.current;
    if (!u) return;
    const dt = Math.min(delta, 1 / 20);
    const dpr = gl.getPixelRatio();

    u.uTime.value += dt;
    u.uResolution.value.set(size.width * dpr, size.height * dpr);
    // 网格间距 = 14px × dpr × 视口缩放（小视口略密、大屏略疏，避免大屏上网格过碎）
    const scale = THREE.MathUtils.clamp(Math.min(size.width, size.height) / 900, 0.8, 1.35);
    u.uGridPx.value = NOISE_GRID_BASE_PX * dpr * scale;
    u.uLineWidth.value = Math.max(1, dpr * 0.75);
    u.uMouseRadius.value = MOUSE_RADIUS_CSS * dpr;
    u.uMousePush.value = MOUSE_PUSH_CSS * dpr;

    // 光标缓动（时间常数 ~150ms），避免指针抖动直接抖到网格上
    const k = 1 - Math.exp(-dt / 0.15);
    u.uMouse.value.x += (mouseTarget.current.x - u.uMouse.value.x) * k;
    u.uMouse.value.y += (mouseTarget.current.y - u.uMouse.value.y) * k;
  });

  if (!material) return null;
  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      {/* 自定义 ShaderMaterial 直接以 primitive 挂到 material 上，避免 intrinsic 类型体操 */}
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * 全站噪声网格背景（参考站 `section.noise-background` 的 WebGL 层）。
 * - high：canvas + dpr ≤1.5 + 两层 value noise octave
 * - medium：canvas + dpr=1 + 单层 noise
 * - saver / reduced motion：不渲染 canvas，改用纯 CSS 静态网格
 */
export default function NoiseGridBackground() {
  const tier = useStore(sel.tier);
  const motion = useStore(sel.motion);
  const visible = useDocumentVisible();

  // 显式求出画质档，避免依赖 TS 对布尔别名的收窄
  const quality: 'high' | 'medium' | null =
    motion === 'reduced' ? null : tier === 'high' ? 'high' : tier === 'medium' ? 'medium' : null;

  if (!quality) return <StaticGrid />;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-canvas)',
        pointerEvents: 'none',
        backgroundColor: 'rgb(2 2 2)',
      }}
    >
      <Canvas
        key={quality}
        dpr={[1, DPR_CAP[quality]]}
        frameloop={visible ? 'always' : 'never'}
        orthographic
        camera={{ position: [0, 0, 1], near: 0.1, far: 10, left: -1, right: 1, top: 1, bottom: -1 }}
        flat
        gl={{
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <GridPlane detail={quality === 'high' ? 1 : 0} />
      </Canvas>
    </div>
  );
}
