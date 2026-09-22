'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

import { DEFAULT_TRACK_ID, startAudio } from '@/lib/audio';
import { person } from '@/lib/data/content';
import { useStore, sel } from '@/lib/store';

gsap.registerPlugin(CustomEase);
// 令牌里的 --ease-in-out-quint = cubic-bezier(.83,0,.17,1)，GSAP 需要一个具名缓动才能用同一个曲线
CustomEase.create('inOutQuint', '0.83,0,0.17,1');

/** 计数动画时长 */
const COUNT_MS = 1100; // 实测参考站：0 -> 100% 约 1.1s（曲线 6/11/41/64/72/76/90/92/96/100），随后停在 100% 等点击
/** 减少动效时的计数时长：还是让读数走一遍，但不做 1.6s 的演出 */
const COUNT_MS_REDUCED = 320;
/** 单块面板上滑时长 */
const TILE_DURATION = 0.78;
/** 16 块面板的错开总量（0 → 150ms），用 amount 而不是 each，保证总时长可预期 */
const TILE_SPREAD = 0.15;
/** 兜底：进度卡住时最长把用户关在预加载器里的时间 */
const SAFETY_MS = 4000;
/** 点击后若 GSAP 回调意外丢失，多久强制收尾 */
const CLICK_SAFETY_MS = 1800;

/** 4 列 × 4 行 = 16 块；移动端只显示前 8 块（见下面的媒体查询） */
const TILE_COUNT = 16;
const TILE_COLUMNS = 4;
const TILE_ROWS = 4;
/** ≤640px 时保留的块数：8 块在手机上不会再碎成一片 */
const MOBILE_TILE_COUNT = 8;

/**
 * 移动端覆盖：4×4 = 16 块在 ≤640px 的屏幕上会碎成一片，
 * 所以窄屏只保留 4 列 × 2 行 = 8 块（隐藏的块 nth-child 从第 9 个开始），
 * 面板数量与 stagger 都按同一份 DOM 计算，逻辑保持一致。
 */
const MOBILE_TILE_CSS = `
@media (max-width: 640px) {
  #preloader { grid-template-rows: repeat(2, 1fr); }
  #preloader [data-tile]:nth-child(n + 9) { display: none; }
}
`;
/** 启动日志出现的进度阈值，与下面的 buildLogs() 一一对应 */
const LOG_THRESHOLDS = [0.15, 0.45, 0.7, 0.92];

const LABELS = {
  engine: '引擎初始化中',
  enter: '点击进入',
  hint: '音频引擎需要一次点击才能启动',
} as const;

/**
 * 启动日志文案：由 content.ts 的字段拼出来，不写死人名/尺寸，
 * 这样换成任何人的资料，预加载器读的仍然是真实信息（不是装饰性假数据）。
 */
function buildLogs(): string[] {
  const vw = typeof window === 'undefined' ? 0 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 0 : window.innerHeight;
  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 3);
  return [
    `> 载入资料 :: ${person.name}`,
    `> 载入照片 :: ${person.portraitSpec}`,
    `> 检测视口 :: ${vw}×${vh} @${dpr}x`,
    `> 渲染界面 :: ${person.city} / ${person.timezoneLabel}`,
  ];
}

/**
 * 预加载器（--z-preloader）。
 *
 * 为什么必须有"点击"这一步：Web Audio 只能在用户手势里启动，
 * 所以这个按钮不只是仪式感，它是整站音频引擎唯一的启动点。
 *
 * 三条不能破的底线：
 *  1) 减少动效时不做面板演出，点了直接进；
 *  2) 进度卡住 4s 强制放行，绝不把用户锁死在预加载器里；
 *  3) 预加载期间把页面主体标成 inert，Tab 不能穿到背后的 HUD。
 */
export default function Preloader() {
  const reduced = useStore(sel.motion) === 'reduced';

  const rootRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const countRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const finishedRef = useRef(false);
  const readyRef = useRef(false);

  const [logCount, setLogCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  // 日志依赖视口尺寸，只能客户端生成（否则 SSR/CSR 文本不一致）
  useEffect(() => {
    setLogs(buildLogs());
  }, []);

  // 进度推进：按参考站实测的台阶曲线（6→11→41→64→72→76→90→92→96→100，~1.1s 走完）
  useEffect(() => {
    if (done) return;
    const duration = reduced ? COUNT_MS_REDUCED : COUNT_MS;
    const startedAt = performance.now();
    let rafId = 0;

    // 台阶曲线：归一化时间 → 归一化进度（分段线性插值）
    // 实测参考站：t=0ms 6% / 120ms 11% / 240ms 41% / 360ms 64% / 480ms 72% / 600ms 76% / 720ms 90% / 840ms 92% / 960ms 96% / 1080ms 100%
    const STEPS = [
      [0.000, 0.06],
      [0.109, 0.11],
      [0.218, 0.41],
      [0.327, 0.64],
      [0.436, 0.72],
      [0.545, 0.76],
      [0.655, 0.90],
      [0.764, 0.92],
      [0.873, 0.96],
      [1.000, 1.00],
    ];
    const curve = (t: number): number => {
      if (t <= 0) return STEPS[0][1];
      if (t >= 1) return STEPS[STEPS.length - 1][1];
      for (let i = 1; i < STEPS.length; i++) {
        const [t0, p0] = STEPS[i - 1];
        const [t1, p1] = STEPS[i];
        if (t <= t1) {
          const k = (t - t0) / (t1 - t0);
          return p0 + k * (p1 - p0);
        }
      }
      return 1;
    };

    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const p = curve(t);
      const percent = Math.round(p * 100);
      if (countRef.current) countRef.current.textContent = String(percent).padStart(3, '0');
      if (barRef.current) barRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
      useStore.getState().setBoot(p);

      const visible = LOG_THRESHOLDS.filter((threshold) => p >= threshold).length;
      setLogCount((prev) => (prev === visible ? prev : visible));

      if (t < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        readyRef.current = true;
        setReady(true);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [done, reduced]);

  // 就绪后把焦点给按钮：键盘用户可以直接回车进入
  useEffect(() => {
    if (ready && !done) buttonRef.current?.focus();
  }, [ready, done]);

  const complete = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    useStore.getState().enter();
    setDone(true);
  }, []);

  const enter = useCallback(() => {
    if (finishedRef.current) return;

    const state = useStore.getState();
    // 用户手势内启动音频（Providers 之后的对账是幂等的，不会重复起音轨）
    state.setAudio(true);
    startAudio(state.track || DEFAULT_TRACK_ID);

    const grid = gridRef.current;
    const all = grid ? Array.from(grid.children) : [];
    // 窄屏媒体查询把后 8 块 display:none 掉了，只对可见块做 stagger（隐藏块的 transform 没有意义）
    const tiles = window.matchMedia('(max-width: 640px)').matches
      ? all.slice(0, MOBILE_TILE_COUNT)
      : all;

    if (reduced || tiles.length === 0) {
      complete();
      return;
    }

    // 斜向错开：把块按 4 列排成网格，GSAP 会按"到起点的行列距离"分配延迟，
    // 于是左上先动、右下最后，总跨度仍锁在 0–150ms（amount 而不是 each）
    const staggerConfig: gsap.StaggerVars = {
      amount: TILE_SPREAD,
      grid: [TILE_COLUMNS, Math.max(1, Math.ceil(tiles.length / TILE_COLUMNS))],
      from: 'start',
    };

    // 中心读数先退场，再让面板整体上滑揭幕
    const timeline = gsap.timeline({ onComplete: complete });
    if (centerRef.current) {
      timeline.to(centerRef.current, { opacity: 0, duration: 0.26, ease: 'power2.out' }, 0);
    }
    timeline.to(
      tiles,
      {
        yPercent: -100,
        duration: TILE_DURATION,
        ease: 'inOutQuint',
        stagger: staggerConfig,
      },
      0.08,
    );

    // 时间线万一没回调（标签页被挂起等），也不能把用户留在幕布后面
    window.setTimeout(complete, CLICK_SAFETY_MS);
  }, [complete, reduced]);

  // 4s 兜底：只有"进度卡住"才强制放行；已就绪时继续等用户点击（音频需要那个手势）
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (finishedRef.current) return;
      if (!readyRef.current) {
        // rAF 被浏览器节流、或计数逻辑抛错 —— 直接放行，不启动音频
        complete();
      }
    }, SAFETY_MS);
    return () => window.clearTimeout(timer);
  }, [complete]);

  // 预加载期间冻结页面主体：inert 同时挡住键盘聚焦与指针事件
  useEffect(() => {
    if (done) return;
    const root = rootRef.current;
    const targets = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== root,
    );
    const previous = targets.map((el) => el.inert);
    targets.forEach((el) => {
      el.inert = true;
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      targets.forEach((el, index) => {
        el.inert = previous[index];
      });
      document.body.style.overflow = previousOverflow;
    };
  }, [done]);

  if (done) return null;

  return (
    <div
      ref={rootRef}
      id="preloader"
      role="dialog"
      aria-modal="true"
      aria-label={LABELS.engine}
      className="fixed inset-0"
      style={{
        zIndex: 'var(--z-preloader)',
        backgroundColor: 'rgb(var(--c-line))', // 面板之间的 1px 缝隙就是它露出来的部分
        display: 'grid',
        // 4 列（repeat(2,1fr) repeat(2,1fr) 就是 4 列）× 4 行 = 16 块
        gridTemplateColumns: 'repeat(2, 1fr) repeat(2, 1fr)',
        gridTemplateRows: `repeat(${TILE_ROWS}, 1fr)`,
        gap: '1px',
      }}
    >
      {/* 窄屏减块：媒体查询需要按 nth-child 定位到块本身，所以单独注入一小段样式 */}
      <style dangerouslySetInnerHTML={{ __html: MOBILE_TILE_CSS }} />

      <div ref={gridRef} className="contents">
        {Array.from({ length: TILE_COUNT }, (_, index) => (
          <span
            key={index}
            data-tile
            aria-hidden
            style={{ backgroundColor: 'rgb(var(--c-bg))', display: 'block' }}
          />
        ))}
      </div>

      {/* 中央读数层：铺在面板之上，点按钮时先淡出 */}
      <div
        ref={centerRef}
        className="scanlines flex flex-col items-center justify-center px-6 text-center"
        style={{ position: 'absolute', inset: 0 }}
      >
        <div className="noise-screen" aria-hidden />

        <span className="hud" style={{ color: 'rgb(var(--c-dim))' }}>
          {person.name} / {person.role}
        </span>

        <p
          className="hud mt-4"
          style={{ color: 'rgb(var(--c-fg))', letterSpacing: '0.34em', fontSize: 12 }}
        >
          {LABELS.engine}
        </p>

        <div className="mt-6 flex items-baseline gap-2">
          <span
            ref={countRef}
            className="font-mono text-[44px] leading-none tabular-nums md:text-[64px]"
            style={{ color: 'rgb(var(--c-fg))', fontFamily: 'var(--font-mono)' }}
          >
            000
          </span>
          <span className="hud" style={{ color: 'rgb(var(--c-dim))' }}>
            %
          </span>
        </div>

        <div
          className="mt-6 h-px w-[min(320px,72vw)] overflow-hidden"
          style={{ backgroundColor: 'rgb(var(--c-line))' }}
          aria-hidden
        >
          <span
            ref={barRef}
            className="block h-full origin-left"
            style={{
              backgroundColor: 'rgb(var(--c-signal))',
              transform: 'scaleX(0)',
              transition: 'transform 120ms linear',
            }}
          />
        </div>

        {/* 进度每帧都在变，用 aria-live 播报会刷屏；改成只在"就绪"时播报一次 */}
        <span className="sr-only" role="status" aria-live="polite">
          {ready ? '初始化完成，点击进入' : '正在初始化'}
        </span>

        <ul className="mt-8 min-h-[76px] w-full list-none space-y-1 p-0" aria-hidden>
          {logs.map((line, index) => (
            <li
              key={line}
              className="hud-sm"
              style={{
                color: 'rgb(var(--c-dim))',
                opacity: index < logCount ? 1 : 0,
                transform: index < logCount ? 'translateY(0)' : 'translateY(4px)',
                transition: 'opacity 360ms var(--ease-out-expo), transform 360ms var(--ease-out-expo)',
              }}
            >
              {line}
            </li>
          ))}
        </ul>


        {ready ? (
          <button
            ref={buttonRef}
            type="button"
            onClick={enter}
            className="hud mt-8 px-6 py-3 transition-colors duration-[420ms] ease-out-expo"
            style={{
              border: '1px solid rgb(var(--c-line-2))',
              borderRadius: 'var(--radius-panel)',
              color: 'rgb(var(--c-fg))',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            {LABELS.enter}
            <span
              aria-hidden
              style={{ animation: 'caret-blink 1.1s steps(1) infinite', marginLeft: 6 }}
            >
              _
            </span>
          </button>
        ) : (
          <span className="hud-sm mt-8" style={{ color: 'rgb(var(--c-dim))' }}>
            {LABELS.hint}
          </span>
        )}
      </div>
    </div>
  );
}
