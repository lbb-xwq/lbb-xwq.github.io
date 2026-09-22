'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';

import type { Project } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

import AltitudeGauge from './AltitudeGauge';
import ProjectCard from './ProjectCard';

/**
 * 卡墙整体倾角（deg）。固定值，不做滚动摆动：
 * clamp 的上界是用元素包围盒量出来的，角度一变包围盒跟着变，等于自己给自己挪门槛。
 * 旋转由注入的 CSS 先铺一帧（避免首帧是正的），随后交给 gsap.set 接管。
 */
const WALL_ROTATION = -8;
/**
 * 惯性公式：current += (target - current) * 0.08
 * 每帧只补上"剩余距离"的 8%，是一条指数趋近曲线 —— 起步快、尾巴长，
 * 才有"松手后还会滑一段"的观感（60fps 下约 0.25s 走到剩余量的 80%）。
 * motion === 'reduced' 时系数取 1：直接落到目标，去掉惯性。
 */
const FOLLOW = 0.08;
/** 小于这个距离就直接吸附到目标：否则指数曲线永远差一点点，会一直触发 gsap.set */
const SNAP_EPSILON = 0.05;
/** 键盘步长：方向键半张卡，PageUp/PageDown 0.9 屏 */
const KEY_STEP_CARDS = 0.5;
const KEY_STEP_PAGE = 0.9;
/** clamp 上界留白：滑到底时最后一张卡还完整露出这么多 */
const CLAMP_BOTTOM_SLACK = 120;
/** WheelEvent.deltaMode === 1（行）时一行的估算像素；2（页）用容器高度 */
const LINE_HEIGHT_PX = 16;
/** 触屏增益：手指滑 1px 让卡墙走 1.35px，跟手但不窜 */
const TOUCH_GAIN = 1.35;
/** 卡墙距顶部留白：别被固定 header 压住 */
const WALL_TOP = '6vh';

/**
 * 卡墙尺寸用 CSS 变量下发给卡片，断点集中在这一个小 style 块里
 * （globals.css 是冻结文件，沿用 SmoothScroll 注入样式块的做法）。
 * desktop：卡宽 min(38vw, 520px) / 间隙 2.5rem；窄屏：min(46vw, 340px) / 1.25rem。
 */
const WALL_CSS = `
[data-pw-wall] {
  --card-w: min(38vw, 520px);
  --card-h: calc(var(--card-w) * 0.625);
  --pw-gap: 2.5rem;
}
[data-pw-wall-inner] {
  transform: rotate(-8deg);
  transform-origin: center center;
}
@media (max-width: 1023px) {
  [data-pw-wall] {
    --card-w: min(46vw, 340px);
    --pw-gap: 1.25rem;
  }
}
`;

/** 位移 clamp 工具：输入与惯性输出都走它 */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export type ProjectWallProps = {
  projects: Project[];
};

/**
 * 滚轮驱动的斜向项目墙（单屏，页面自身不滚动）。
 *
 * 位移管线：wheel / touch / keydown → target（目标位移）
 *   → 每帧 rAF 让 current 指数趋近 target → gsap.set(wall, { y, rotate }) 写 transform。
 * 两者都 clamp 在 0..maxOffset：maxOffset = 卡墙底边 - 视口底边 + 留白，
 * 由行数（两列交错后的真实高度）决定，尺寸一变就交给 ResizeObserver 重算。
 */
export default function ProjectWall({ projects }: ProjectWallProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const wallRef = useRef<HTMLDivElement | null>(null);

  /** 目标位移（输入直接写它） */
  const targetRef = useRef(0);
  /** 当前位移（惯性输出，实际渲染用） */
  const currentRef = useRef(0);
  /** clamp 上界 */
  const maxRef = useRef(0);
  /** 一张卡的高度，键盘步长用 */
  const cardHRef = useRef(180);
  /** 归一化进度 0..100，给 AltitudeGauge 读（避免每帧 setState） */
  const progressRef = useRef(0);

  const motion = useStore(sel.motion);
  const reduced = motion === 'reduced';

  const applyTransform = useCallback((y: number) => {
    const wall = wallRef.current;
    if (!wall) return;
    // 只写 y 与旋转：水平居中由父级 flex 负责，transform 留给 gsap 独占
    gsap.set(wall, { y, rotate: WALL_ROTATION });
  }, []);

  // 两列交错：偶数序在左，奇数序在右且下移半张卡（--card-h / 2）
  const columns = useMemo(() => {
    const left: Project[] = [];
    const right: Project[] = [];
    projects.forEach((p, i) => {
      if (i % 2 === 0) left.push(p);
      else right.push(p);
    });
    return [left, right];
  }, [projects]);

  useEffect(() => {
    const view = viewportRef.current;
    const wall = wallRef.current;
    if (!view || !wall) return;

    /** reduced motion 没有惯性：本帧就落到目标 */
    const follow = reduced ? 1 : FOLLOW;

    /**
     * 量 clamp 上界。
     * 用 getBoundingClientRect 而不是 offsetHeight：旋转后的包围盒才是"视觉底边"。
     * rect.bottom 里含当前 y 平移，扣掉它得到 y = 0 时的底边；
     * 祖先上的入场 yPercent 不影响结果 —— 两个 rect 在同一棵祖先下，位移互相抵消。
     */
    const remeasure = () => {
      const viewRect = view.getBoundingClientRect();
      const wallRect = wall.getBoundingClientRect();
      const bottomAtRest = wallRect.bottom - currentRef.current;
      const next = Math.max(0, bottomAtRest - viewRect.bottom + CLAMP_BOTTOM_SLACK);
      maxRef.current = next;

      const card = wall.querySelector<HTMLElement>('[data-pw-card]');
      if (card && card.offsetHeight > 0) cardHRef.current = card.offsetHeight;

      // 视口变大 / 卡变小都会让上界缩水，必须把当前值一起夹回来，否则会停在界外
      if (currentRef.current > next) {
        currentRef.current = next;
        applyTransform(next);
      }
      targetRef.current = clamp(targetRef.current, 0, next);
      progressRef.current = next > 0 ? clamp((currentRef.current / next) * 100, 0, 100) : 0;
    };

    // —— 惯性循环 ——
    let raf = 0;
    const tick = () => {
      const target = targetRef.current;
      const current = currentRef.current;
      const settled = Math.abs(target - current) < SNAP_EPSILON;
      const next = settled ? target : current + (target - current) * follow;
      if (next !== current) {
        currentRef.current = next;
        applyTransform(next);
        progressRef.current = maxRef.current > 0 ? clamp((next / maxRef.current) * 100, 0, 100) : 0;
      }
      raf = window.requestAnimationFrame(tick);
    };

    const bump = (px: number) => {
      targetRef.current = clamp(targetRef.current + px, 0, maxRef.current);
      // reduced motion 下惯性循环不做补间，这里直接把当前值顶到位
      if (follow === 1) {
        currentRef.current = targetRef.current;
        applyTransform(currentRef.current);
        progressRef.current =
          maxRef.current > 0 ? clamp((currentRef.current / maxRef.current) * 100, 0, 100) : 0;
      }
    };

    // —— 滚轮 ——（deltaMode: 0 = 像素 1 = 行 2 = 页）
    const onWheel = (e: WheelEvent) => {
      // 页面本身不滚动（100svh）：滚轮只驱动卡墙，顺便挡掉 ScrollSmoother / 浏览器回弹
      e.preventDefault();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // 触控板横向扫不参与
      const unit = e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? view.clientHeight : 1;
      bump(e.deltaY * unit);
    };

    // —— 触屏 ——
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      touchY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const y = e.touches[0].clientY;
      // 手指上滑（clientY 变小）= 内容上移 = 位移增加
      bump((touchY - y) * TOUCH_GAIN);
      touchY = y;
      e.preventDefault();
    };
    const onTouchEnd = () => {
      touchY = 0;
    };

    // —— 键盘替代方案（硬性要求：不用滚轮也能浏览完整面墙）——
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // 导航浮层 / 设置面板打开时，方向键属于它们
      const state = useStore.getState();
      if (state.menuOpen || state.settingsOpen) return;

      const page = view.clientHeight * KEY_STEP_PAGE;
      const half = cardHRef.current * KEY_STEP_CARDS;
      switch (e.key) {
        case 'ArrowDown':
          bump(half);
          break;
        case 'ArrowUp':
          bump(-half);
          break;
        case 'PageDown':
          bump(page);
          break;
        case 'PageUp':
          bump(-page);
          break;
        case 'Home':
          bump(-maxRef.current); // 直接拉到 0
          break;
        case 'End':
          bump(maxRef.current); // 直接拉到底
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    // —— 尺寸变化：重算 clamp ——
    const ro = new ResizeObserver(remeasure);
    ro.observe(view);
    ro.observe(wall);

    view.addEventListener('wheel', onWheel, { passive: false });
    view.addEventListener('touchstart', onTouchStart, { passive: true });
    view.addEventListener('touchmove', onTouchMove, { passive: false });
    view.addEventListener('touchend', onTouchEnd, { passive: true });
    view.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', remeasure);

    remeasure();
    applyTransform(currentRef.current);
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      view.removeEventListener('wheel', onWheel);
      view.removeEventListener('touchstart', onTouchStart);
      view.removeEventListener('touchmove', onTouchMove);
      view.removeEventListener('touchend', onTouchEnd);
      view.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', remeasure);
      // 卸载时清掉 inline transform，只留注入 CSS 的那一帧基准旋转
      gsap.set(wall, { clearProps: 'transform' });
    };
  }, [applyTransform, reduced]);

  // 整屏入场：y 8% → 0、opacity 0 → 1，1s ease-out-expo（= --ease-out-expo）
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (reduced) {
      gsap.set(root, { clearProps: 'opacity,transform' });
      return;
    }
    const tween = gsap.fromTo(
      root,
      { opacity: 0, yPercent: 8 },
      { opacity: 1, yPercent: 0, duration: 1, ease: 'expo.out' },
    );
    return () => {
      tween.kill();
      gsap.set(root, { clearProps: 'opacity,transform' });
    };
  }, [reduced]);

  return (
    <div ref={rootRef} style={{ position: 'relative', height: '100%', width: '100%' }}>
      <style dangerouslySetInnerHTML={{ __html: WALL_CSS }} />

      {/* 顶部 HUD 行 */}
      <div
        className="hud"
        style={{
          position: 'absolute',
          top: '3.75rem',
          left: '4vw',
          right: '4vw',
          zIndex: 'var(--z-hud)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '1rem',
          color: 'rgb(var(--c-dim))',
          pointerEvents: 'none',
        }}
      >
        <span>INDEX: {projects.length} PROJECTS</span>
        <span>SCROLL / 滚轮或 ↑↓ 浏览</span>
      </div>

      <AltitudeGauge progressRef={progressRef} />

      {/*
        卡墙视口。水平居中用父级 flex 而不是 transform 居中：
        卡墙的 transform 要完整留给 gsap，避免和 CSS 里的 translate 互相叠加。
      */}
      <div
        ref={viewportRef}
        data-pw-wall=""
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          zIndex: 'var(--z-content)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <div
          ref={wallRef}
          data-pw-wall-inner=""
          style={{
            display: 'flex',
            gap: 'var(--pw-gap)',
            marginTop: WALL_TOP,
            flexShrink: 0,
            willChange: 'transform',
          }}
        >
          {columns.map((col, ci) => (
            <div
              key={ci === 0 ? 'rail-left' : 'rail-right'}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--pw-gap)',
                flexShrink: 0,
                // 两列上下错开半张卡高：斜向墙的"交错"就来自这里
                marginTop: ci === 1 ? 'calc(var(--card-h) / 2)' : 0,
              }}
            >
              {col.map((project) => (
                <ProjectCard key={project.slug} project={project} reduced={reduced} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
