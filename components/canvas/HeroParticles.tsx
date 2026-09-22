'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { sel, useStore } from '@/lib/store';
import { getLevel } from '@/lib/audio';
import {
  PARTICLE_GRID_SIZE,
  createParticleRenderUniforms,
  createParticleUniforms,
  particleFragmentShader,
  particlePositionFragmentShader,
  particleSimVertexShader,
  particleVelocityFragmentShader,
  particleVertexShader,
  type ParticleRenderUniforms,
  type ParticleUniforms,
} from '@/lib/shaders/particles';

/** 相机参数：uFocal（点径的透视缩放）依赖 fov，改这里必须和 Canvas 的 camera 同步 */
const HERO_CAMERA = { fov: 42, near: 0.1, far: 60, position: [0, 0, 6.2] } as const;

/** high 允许 dpr 到 1.75（画面只占视口一半）；medium 固定 1 */
const DPR_RANGE: Record<'high' | 'medium', number | [number, number]> = {
  high: [1, 1.75],
  medium: 1,
};

const MODE_HOLD = 9; // 自动轮换时每种模式持续秒数
const MODE_FADE = 0.8; // 模式过渡时长（秒）
const MOUSE_FORCE = 1.7; // >0 吸引、<0 排斥
const AUDIO_TAU = 0.25; // 音频电平平滑时间常数（秒）

/** 页面隐藏时返回 false，用来把 frameloop 切成 'never'（暂停 useFrame 与渲染） */
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

const WRAPPER_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  minHeight: '100vh',
  opacity: 0, // 渲染就绪后 gsap 淡入到 1
  mixBlendMode: 'lighten', // 参考站：canvas 以 lighten 叠加在毛玻璃面板上
  pointerEvents: 'none',
  zIndex: 0,
  willChange: 'opacity',
};

type SimResources = {
  posRT: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  velRT: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  simScene: THREE.Scene;
  simCamera: THREE.Camera;
  simMesh: THREE.Mesh;
  simGeometry: THREE.PlaneGeometry;
  velMaterial: THREE.ShaderMaterial;
  posMaterial: THREE.ShaderMaterial;
  velUniforms: ParticleUniforms;
  posUniforms: ParticleUniforms;
  points: THREE.Points;
  pointsGeometry: THREE.BufferGeometry;
  pointsMaterial: THREE.ShaderMaterial;
  renderUniforms: ParticleRenderUniforms;
  dispose: () => void;
};

/**
 * 创建 GPGPU 所需的一整套 three 资源。
 * 全部在 effect 里创建、在 cleanup 里 dispose：StrictMode 的 挂载→卸载→再挂载 会 dispose 掉第一批对象，
 * 放在 useMemo 里复用同一个被 dispose 的 render target / material 会直接失效（RT 的 framebuffer 已被回收）。
 */
function createSimResources(gl: THREE.WebGLRenderer, grid: number): SimResources | null {
  // 状态纹理必须是「可渲染的浮点格式」：优先 RGBA32F，其次 RGBA16F。
  // 两者都没有时直接放弃粒子层（退化成 8bit 会把位置量化到 1/255，物理完全失效）。
  const type = gl.extensions.has('EXT_color_buffer_float')
    ? THREE.FloatType
    : gl.extensions.has('EXT_color_buffer_half_float')
      ? THREE.HalfFloatType
      : null;
  if (type === null) return null;

  const makeRT = () =>
    new THREE.WebGLRenderTarget(grid, grid, {
      type,
      format: THREE.RGBAFormat,
      // 每个粒子只采样自己那一个 texel，nearest 既是正确做法也避开了浮点线性过滤的扩展依赖
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      colorSpace: THREE.NoColorSpace, // 纯数据纹理，不做任何 sRGB 转换
    });

  const velUniforms = createParticleUniforms();
  const posUniforms = createParticleUniforms();
  const renderUniforms = createParticleRenderUniforms();

  const velMaterial = new THREE.ShaderMaterial({
    uniforms: velUniforms,
    vertexShader: particleSimVertexShader,
    fragmentShader: particleVelocityFragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const posMaterial = new THREE.ShaderMaterial({
    uniforms: posUniforms,
    vertexShader: particleSimVertexShader,
    fragmentShader: particlePositionFragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const pointsMaterial = new THREE.ShaderMaterial({
    uniforms: renderUniforms,
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

  // 模拟 pass 用独立 scene/camera：它只往 FBO 里写，绝不能进入 R3F 主场景（否则会被画到屏幕上）。
  const simGeometry = new THREE.PlaneGeometry(2, 2);
  const simScene = new THREE.Scene();
  // THREE.Camera 的 projectionMatrix 是单位阵 → 平面顶点 [-1,1] 直接就是 NDC
  const simCamera = new THREE.Camera();
  const simMesh = new THREE.Mesh(simGeometry, velMaterial);
  simMesh.frustumCulled = false;
  simScene.add(simMesh);

  const count = grid * grid;
  const refs = new Float32Array(count * 2);
  const placeholder = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const col = i % grid;
    const row = Math.floor(i / grid);
    refs[i * 2] = (col + 0.5) / grid;
    refs[i * 2 + 1] = (row + 0.5) / grid;
  }
  const pointsGeometry = new THREE.BufferGeometry();
  // position 只决定 draw count（顶点着色器完全覆盖它），填 0 即可，省下 20k×3 的真实数据
  pointsGeometry.setAttribute('position', new THREE.BufferAttribute(placeholder, 3));
  pointsGeometry.setAttribute('aRef', new THREE.BufferAttribute(refs, 2));
  pointsGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  const points = new THREE.Points(pointsGeometry, pointsMaterial);
  points.frustumCulled = false; // 真实位置在纹理里，包围盒没有意义

  const posRT: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] = [makeRT(), makeRT()];
  const velRT: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] = [makeRT(), makeRT()];

  const dispose = () => {
    posRT.forEach((rt) => rt.dispose());
    velRT.forEach((rt) => rt.dispose());
    simScene.remove(simMesh);
    simGeometry.dispose();
    velMaterial.dispose();
    posMaterial.dispose();
    pointsGeometry.dispose();
    pointsMaterial.dispose();
  };

  return {
    posRT,
    velRT,
    simScene,
    simCamera,
    simMesh,
    simGeometry,
    velMaterial,
    posMaterial,
    velUniforms,
    posUniforms,
    points,
    pointsGeometry,
    pointsMaterial,
    renderUniforms,
    dispose,
  };
}

type ParticleSystemProps = {
  grid: number;
  /** entered === true 之后才真正推进模拟 */
  enabled: boolean;
  audioOn: boolean;
  mode?: number;
  onReady: () => void;
};

function ParticleSystem({ grid, enabled, audioOn, mode, onReady }: ParticleSystemProps) {
  const gl = useThree((s) => s.gl);
  const [resources, setResources] = useState<SimResources | null>(null);

  /** 指针在面板内的 NDC（canvas 是 pointer-events:none，所以监听 window） */
  const pointer = useRef({ nx: 0, ny: 0, inside: false });
  const enabledRef = useRef(enabled);
  const audioRef = useRef(audioOn);
  const modeRef = useRef(mode);
  const onReadyRef = useRef(onReady);

  const sim = useRef({
    pp: 0, // 当前（源）位置纹理索引
    pv: 0, // 当前（源）速度纹理索引
    inited: false, // 初始分布是否已经写进纹理
    ready: false, // 是否已经触发过淡入
    time: 0, // 自维护的模拟时间（R3F 的 clock 在 frameloop 切换时会被重置）
    level: 0, // 平滑后的音频电平
    force: 0, // 光标力度 0..1
    mouseX: 0,
    mouseY: 0,
    uMode: 0, // 传给 shader 的 0..3 连续值
    modeFrom: 0,
    modeTo: 0,
    modeT: 1, // 过渡进度 0..1
    cycle: 0,
  });

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    audioRef.current = audioOn;
  }, [audioOn]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const created = createSimResources(gl, grid);
    if (!created) return;
    setResources(created);
    return () => {
      created.dispose();
      setResources(null);
    };
  }, [gl, grid]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      pointer.current.nx = x * 2 - 1;
      pointer.current.ny = -(y * 2 - 1);
      // 稍微放宽边界：光标拖出面板一点点时力度平滑消失，而不是硬切
      pointer.current.inside = x >= -0.08 && x <= 1.08 && y >= -0.08 && y <= 1.08;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [gl]);

  useFrame((state, delta) => {
    if (!resources) return;
    const st = sim.current;
    // 掉帧 / 切后台回来时 delta 可能很大：物理步长夹在 1/30，避免一帧把粒子甩飞
    const dt = Math.min(delta, 1 / 30);

    // ---------- 音频（0..1）----------
    let raw = 0;
    try {
      const v = getLevel();
      if (Number.isFinite(v)) raw = Math.min(1, Math.max(0, v));
    } catch {
      raw = 0; // lib/audio.ts 未就绪 / 音频引擎没启动
    }
    if (!audioRef.current) raw = 0;
    // 指数平滑（时间常数 0.25s）：静音或读不到时平滑回落到 0，不会突然跳变
    st.level += (raw - st.level) * (1 - Math.exp(-dt / AUDIO_TAU));

    // ---------- 光标 ----------
    const ms = 1 - Math.exp(-dt / 0.12);
    st.mouseX += (pointer.current.nx * state.viewport.width * 0.5 - st.mouseX) * ms;
    st.mouseY += (pointer.current.ny * state.viewport.height * 0.5 - st.mouseY) * ms;
    st.force += ((pointer.current.inside ? 1 : 0) - st.force) * (1 - Math.exp(-dt / 0.25));

    // ---------- 绘制 pass 的 uniform（dpr / 视口会变，必须每帧刷）----------
    const dpr = gl.getPixelRatio();
    const ru = resources.renderUniforms;
    ru.uPixelRatio.value = dpr;
    // gl_PointSize 不吃 projectionMatrix，所以自己算焦距：(h/2) / tan(fov/2)。
    // 这里用 CSS 像素，和 three 内置 Points 的约定一致（shader 里再乘 uPixelRatio → 设备像素）。
    ru.uFocal.value = (state.size.height * 0.5) / Math.tan((HERO_CAMERA.fov * Math.PI) / 360);
    ru.uLevel.value = st.level;

    const running = enabledRef.current;
    // 预加载器还没结束：只保留第一次写好的静态分布，不推进物理
    if (st.inited && !running) return;

    const vu = resources.velUniforms;
    const pu = resources.posUniforms;
    const uInit = st.inited ? 0 : 1;

    if (running) {
      st.time += dt;

      // ---------- 位移模式：0.8s 过渡 ----------
      const external = modeRef.current;
      if (external === undefined) {
        st.cycle += dt;
        if (st.modeT >= 1 && st.cycle >= MODE_HOLD) {
          st.cycle = 0;
          st.modeFrom = st.uMode;
          // +1 可能是 4：shader 的权重表把 (模式 3 → 模式 0) 当作回绕处理，不会经过中间模式
          st.modeTo = Math.floor(st.uMode) + 1;
          st.modeT = 0;
        }
      } else if (st.modeT >= 1 && Math.abs(st.uMode - external) > 1e-3) {
        st.modeFrom = st.uMode;
        st.modeTo = external;
        st.modeT = 0;
      }
      if (st.modeT < 1) {
        st.modeT = Math.min(1, st.modeT + dt / MODE_FADE);
        st.uMode = st.modeFrom + (st.modeTo - st.modeFrom) * st.modeT;
        // 过渡结束把 uMode 收进 [0,4)：4 ≙ 0，数值连续所以不会闪
        if (st.modeT >= 1) st.uMode = st.modeTo % 4;
      }
    }

    vu.uMode.value = st.uMode;
    vu.uTime.value = st.time;
    vu.uDt.value = running ? dt : 0;
    vu.uLevel.value = st.level;
    vu.uInit.value = uInit;
    vu.uMouse.value.set(st.mouseX, st.mouseY, 0);
    vu.uMouseForce.value = st.force * MOUSE_FORCE;

    pu.uDt.value = running ? dt : 0;
    pu.uInit.value = uInit;

    // ---------- GPGPU 乒乓：速度 pass → 位置 pass ----------
    // 速度：v' = v + F·dt（读 旧位置 + 旧速度，写 新速度）
    vu.uPos.value = resources.posRT[st.pp].texture;
    vu.uVel.value = resources.velRT[st.pv].texture;
    resources.simMesh.material = resources.velMaterial;
    gl.setRenderTarget(resources.velRT[1 - st.pv]);
    gl.render(resources.simScene, resources.simCamera);
    st.pv = 1 - st.pv;

    // 位置：p' = p + v'·dt（用刚写好的新速度）
    pu.uPos.value = resources.posRT[st.pp].texture;
    pu.uVel.value = resources.velRT[st.pv].texture;
    resources.simMesh.material = resources.posMaterial;
    gl.setRenderTarget(resources.posRT[1 - st.pp]);
    gl.render(resources.simScene, resources.simCamera);
    st.pp = 1 - st.pp;

    // 交还给 R3F：本帧回调结束后它会自己 render(scene, camera)
    gl.setRenderTarget(null);

    // 绘制 pass 采样最新状态
    ru.uPos.value = resources.posRT[st.pp].texture;
    ru.uVel.value = resources.velRT[st.pv].texture;

    st.inited = true;
    if (!st.ready) {
      st.ready = true;
      onReadyRef.current(); // 第一帧真的画出来了 → 开始 1.4s 淡入
    }
  });

  if (!resources) return null;
  return <primitive object={resources.points} />;
}

type HeroParticlesProps = {
  /** 外部指定位移模式（0..3）；不传则每 9s 自动轮换 */
  mode?: number;
};

/**
 * Hero 的 GPGPU 粒子层。
 * - high：144² = 20736 颗粒子，dpr ≤1.75
 * - medium：80² = 6400 颗粒子，dpr = 1
 * - saver / reduced motion：完全不渲染（不创建 WebGL 上下文）
 */
export default function HeroParticles({ mode }: HeroParticlesProps) {
  const tier = useStore(sel.tier);
  const motion = useStore(sel.motion);
  const entered = useStore(sel.entered);
  const audioOn = useStore(sel.audioOn);
  const visible = useDocumentVisible();

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const fadedRef = useRef(false);

  const handleReady = useCallback(() => {
    if (fadedRef.current) return;
    fadedRef.current = true;
    const el = wrapperRef.current;
    if (!el) return;
    tweenRef.current?.kill();
    // 参考站：canvas opacity 0 → 1，约 1.4s；--ease-out-expo ≈ gsap 'expo.out'
    tweenRef.current = gsap.to(el, { opacity: 1, duration: 1.4, ease: 'expo.out' });
  }, []);

  useEffect(
    () => () => {
      tweenRef.current?.kill();
    },
    [],
  );

  // 显式求出画质档，避免依赖 TS 对布尔别名的收窄
  const quality: 'high' | 'medium' | null =
    motion === 'reduced' ? null : tier === 'high' ? 'high' : tier === 'medium' ? 'medium' : null;

  return (
    <div ref={wrapperRef} aria-hidden style={WRAPPER_STYLE}>
      {quality ? (
        <Canvas
          key={quality}
          dpr={DPR_RANGE[quality]}
          frameloop={visible ? 'always' : 'never'}
          camera={HERO_CAMERA}
          flat
          gl={{
            alpha: true, // 粒子以加法混合叠在面板上，背景保持透明
            antialias: false,
            depth: false,
            stencil: false,
            powerPreference: 'high-performance',
          }}
          onCreated={({ gl }) => gl.setClearAlpha(0)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <ParticleSystem
            grid={PARTICLE_GRID_SIZE[quality]}
            enabled={entered}
            audioOn={audioOn}
            mode={mode}
            onReady={handleReady}
          />
        </Canvas>
      ) : null}
    </div>
  );
}
