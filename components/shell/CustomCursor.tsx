'use client';

import { useEffect, useRef, useState } from 'react';

import { useStore, sel } from '@/lib/store';
import { isFinePointer } from '@/lib/tier';

/** 拖尾时间窗：只保留最近 400ms 的采样点 */
const TRAIL_MS = 400;
/** 采样点上限，防止快速甩动时数组无限增长 */
const MAX_POINTS = 160;
/** 准星跟随的缓动系数（每帧向目标插值 18%） */
const RETICLE_EASE = 0.18;
const RETICLE_SIZE = 32;
/** 末端圆点半径 */
const HEAD_RADIUS = 1.8;
/** 悬停到可交互元素上时的放大倍率 */
const HOVER_SCALE = 1.7;

type TrailPoint = { x: number; y: number; t: number };

/**
 * 自定义光标：canvas 拖尾折线 + DOM 十字准星。
 *
 * 只在「精确指针 + 非减少动效」的设备上启用（触屏上画拖尾纯属浪费电）。
 * 省电的关键在 rAF 循环的退出条件：鼠标静止且拖尾点全部过期后主动停掉循环，
 * 下一次 pointermove 再启动 —— 空闲时页面完全没有逐帧工作。
 */
export default function CustomCursor() {
  const motion = useStore(sel.motion);
  const theme = useStore(sel.theme);
  const [enabled, setEnabled] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reticleRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);

  // 拖尾颜色跟着主题走：浅色底上用深色，否则拖尾看不见
  const colorRef = useRef('253 255 255');
  colorRef.current = theme === 'light' ? '11 11 11' : '253 255 255';

  // 能力检测必须放在客户端：SSR 阶段一律"不启用"
  useEffect(() => {
    setEnabled(isFinePointer() && motion !== 'reduced');
  }, [motion]);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const reticle = reticleRef.current;
    const inner = innerRef.current;
    const label = labelRef.current;
    if (!canvas || !reticle || !inner || !label) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const points: TrailPoint[] = [];
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let initialised = false;
    let rafId = 0;
    let hoverEl: Element | null = null;

    const resize = () => {
      // DPR 封顶 2：4K/5K 屏上按真实 DPR 画拖尾会白白多花几倍填充率
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (points.length === 0) return;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 逐段绘制：越老的点越透明、越细，形成"挥动后留下笔触"的感觉
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const age = Math.min(1, Math.max(0, (now - b.t) / TRAIL_MS));
        const fade = (1 - age) * (1 - age);
        if (fade <= 0.01) continue;
        ctx.strokeStyle = `rgba(${colorRef.current}, ${(fade * 0.65).toFixed(3)})`;
        ctx.lineWidth = 0.6 + fade * 1.4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      const head = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(head.x, head.y, HEAD_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${colorRef.current})`;
      ctx.fill();
    };

    const loop = (now: number) => {
      rafId = 0;

      while (points.length > 0 && now - points[0].t > TRAIL_MS) points.shift();

      // 准星缓动跟随
      currentX += (targetX - currentX) * RETICLE_EASE;
      currentY += (targetY - currentY) * RETICLE_EASE;
      reticle.style.transform = `translate3d(${currentX - RETICLE_SIZE / 2}px, ${
        currentY - RETICLE_SIZE / 2
      }px, 0)`;

      draw(now);

      // 没有拖尾点、准星也追上了 → 停掉循环；下一次 pointermove 会重新启动
      const chasing = Math.abs(targetX - currentX) > 0.2 || Math.abs(targetY - currentY) > 0.2;
      if (points.length > 0 || chasing) rafId = window.requestAnimationFrame(loop);
    };

    const start = () => {
      if (rafId === 0) rafId = window.requestAnimationFrame(loop);
    };

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!initialised) {
        // 第一次移动直接把准星落到指针位置，避免它从左上角飞过来
        initialised = true;
        currentX = targetX;
        currentY = targetY;
        reticle.style.opacity = '1';
      }
      points.push({ x: targetX, y: targetY, t: performance.now() });
      if (points.length > MAX_POINTS) points.shift();
      start();
    };

    /** 悬停态直接改 DOM：指针穿过嵌套元素时会频繁触发，走 React state 会疯狂重渲染 */
    const applyHover = (el: Element | null) => {
      if (el === hoverEl) return;
      hoverEl = el;
      const text =
        el?.getAttribute('data-cursor-label') ?? el?.getAttribute('aria-label') ?? el?.textContent ?? '';
      inner.style.transform = el ? `scale(${HOVER_SCALE})` : 'scale(1)';
      label.textContent = el ? text.trim().slice(0, 18) : '';
      label.style.opacity = el ? '1' : '0';
    };

    const onOver = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      applyHover(target.closest('a, button, [data-cursor-hover]'));
    };

    const onOut = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest('a, button, [data-cursor-hover]');
      if (!el) return;
      const related = event instanceof PointerEvent ? event.relatedTarget : null;
      // 指针只是在按钮内部的子元素之间移动时不应该取消悬停态
      if (related instanceof Node && el.contains(related)) return;
      if (hoverEl === el) applyHover(null);
    };

    const onLeaveWindow = () => {
      reticle.style.opacity = '0';
      applyHover(null);
    };

    const onEnterWindow = () => {
      reticle.style.opacity = '1';
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeaveWindow);
    document.documentElement.addEventListener('pointerenter', onEnterWindow);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.documentElement.removeEventListener('pointerleave', onLeaveWindow);
      document.documentElement.removeEventListener('pointerenter', onEnterWindow);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [enabled]);

  // 触屏 / 减少动效：连 DOM 都不渲染（Hydrate 也不会挂 data-cursor）
  if (!enabled) return null;

  const armStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: 'currentColor',
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0"
        style={{ zIndex: 'var(--z-cursor)' }}
      />

      <div
        ref={reticleRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0"
        style={{
          width: RETICLE_SIZE,
          height: RETICLE_SIZE,
          zIndex: 'var(--z-cursor)',
          color: 'rgb(var(--c-fg))',
          opacity: 0,
          transition: 'opacity 240ms var(--ease-out-expo)',
          willChange: 'transform',
        }}
      >
        <div
          ref={innerRef}
          style={{ position: 'absolute', inset: 0, transition: 'transform 280ms var(--ease-out-expo)' }}
        >
          {/* 十字准星四条短臂：中间留空隙，视觉上更像取景器 */}
          <span style={{ ...armStyle, left: '50%', top: 0, width: 1, height: 9, marginLeft: -0.5 }} />
          <span style={{ ...armStyle, left: '50%', bottom: 0, width: 1, height: 9, marginLeft: -0.5 }} />
          <span style={{ ...armStyle, top: '50%', left: 0, width: 9, height: 1, marginTop: -0.5 }} />
          <span style={{ ...armStyle, top: '50%', right: 0, width: 9, height: 1, marginTop: -0.5 }} />
        </div>

        <span
          ref={labelRef}
          className="hud-sm"
          style={{
            position: 'absolute',
            left: 'calc(100% + 8px)',
            top: '50%',
            transform: 'translateY(-50%)',
            whiteSpace: 'nowrap',
            opacity: 0,
            transition: 'opacity 240ms var(--ease-out-expo)',
          }}
        />
      </div>
    </>
  );
}
