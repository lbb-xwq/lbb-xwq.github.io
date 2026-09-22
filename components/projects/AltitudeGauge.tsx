'use client';

import { useEffect, useRef } from 'react';

export type AltitudeGaugeProps = {
  /**
   * 由 ProjectWall 每帧写入的归一化进度（0..100）。
   * 用 ref 而不是 props/state：进度是每帧都变的连续量，走 React 状态会让整面卡墙跟着重渲染；
   * ref 是可变共享单元，读写都不触发渲染（结构类型，不绑定具体 ref 实例）。
   */
  progressRef: { current: number };
};

/** 刻度：每 10% 一根短刻度；标签每 20% 一个（00/20/40/60/80/100） */
const TICKS = Array.from({ length: 11 }, (_, i) => i * 10);
const LABELS = Array.from({ length: 6 }, (_, i) => i * 20);

/** 数值补零：000 / 042 / 100 —— 等宽数字跳动时才不会左右抖 */
function pad3(n: number): string {
  return String(Math.round(n)).padStart(3, '0');
}

/**
 * 高度计（左侧竖向）。
 *
 * 映射关系：progress 0..100 → top 0%..100%（指针），数值直接显示同一条归一化进度。
 * 指针与读数都由本组件自己的 rAF 循环读 progressRef 后直接写 DOM（不 setState），
 * 因为它是 60fps 的连续量，而高度计本身只有一个 1px 指针和一段数字需要更新。
 *
 * 窄屏（≤1024px）改为底部横向进度条：竖版留在左栏会跟卡片打架，
 * 横版贴在底部不影响浏览，两者共用同一份 DOM 引用与同一个循环。
 */
export default function AltitudeGauge({ progressRef }: AltitudeGaugeProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const verticalMarkerRef = useRef<HTMLDivElement | null>(null);
  const verticalReadoutRef = useRef<HTMLSpanElement | null>(null);
  const horizontalMarkerRef = useRef<HTMLDivElement | null>(null);
  const horizontalReadoutRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = -1;
    let lastA11y = -1;

    const tick = () => {
      const p = progressRef.current < 0 ? 0 : progressRef.current > 100 ? 100 : progressRef.current;
      if (Math.abs(p - last) >= 0.05) {
        last = p;
        const pct = `${p.toFixed(2)}%`;
        // 竖版：指针与读数一起沿竖线走；横版：同一个百分比映射到 left
        if (verticalMarkerRef.current) verticalMarkerRef.current.style.top = pct;
        if (verticalReadoutRef.current) verticalReadoutRef.current.style.top = pct;
        if (horizontalMarkerRef.current) horizontalMarkerRef.current.style.left = pct;
        const text = pad3(p);
        if (verticalReadoutRef.current) verticalReadoutRef.current.textContent = text;
        if (horizontalReadoutRef.current) horizontalReadoutRef.current.textContent = text;
        // aria-valuenow 只在整数位变化时写：读屏不该被每帧一次的属性变更刷屏
        const rounded = Math.round(p);
        if (rounded !== lastA11y) {
          lastA11y = rounded;
          rootRef.current?.setAttribute('aria-valuenow', String(rounded));
        }
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [progressRef]);

  return (
    <div
      ref={rootRef}
      role="progressbar"
      aria-label="项目墙浏览进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 'var(--z-hud)',
        // 覆盖整屏但不吃事件：卡片必须还能点、还能 Tab 到
        pointerEvents: 'none',
      }}
    >
      {/* 桌面：左侧竖向高度计，left:4vw / top:50% */}
      <div
        aria-hidden
        className="hidden min-[1025px]:block"
        style={{
          position: 'absolute',
          left: '4vw',
          top: '50%',
          transform: 'translateY(-50%)',
          height: '40vh',
          minHeight: '220px',
          width: 96,
        }}
      >
        {/* 40vh 基准竖线 */}
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 1,
            background: 'rgb(var(--c-line-2))',
          }}
        />
        {/* 每 10% 一根刻度（向左伸 6px，避免和右侧标签/读数挤在一起） */}
        {TICKS.map((t) => (
          <span
            key={`tick-${t}`}
            style={{
              position: 'absolute',
              left: -6,
              top: `${t}%`,
              width: 6,
              height: 1,
              background: 'rgb(var(--c-dim))',
            }}
          />
        ))}
        {/* 00/20/40/60/80/100 */}
        {LABELS.map((l) => (
          <span
            key={`label-${l}`}
            className="hud-sm"
            style={{
              position: 'absolute',
              left: 10,
              top: `${l}%`,
              transform: 'translateY(-50%)',
              color: 'rgb(var(--c-dim))',
            }}
          >
            {String(l).padStart(2, '0')}
          </span>
        ))}
        {/* --c-signal 指针 + 旁边的补零读数 */}
        <div
          ref={verticalMarkerRef}
          style={{
            position: 'absolute',
            left: -26,
            top: '0%',
            width: 26,
            height: 1,
            transform: 'translateY(-50%)',
            background: 'rgb(var(--c-signal))',
          }}
        />
        <span
          ref={verticalReadoutRef}
          className="hud-sm"
          style={{
            position: 'absolute',
            left: 52,
            top: '0%',
            color: 'rgb(var(--c-signal))',
            transform: 'translateY(-50%)',
          }}
        >
          000
        </span>
      </div>

      {/* 窄屏（≤1024px）：底部横向进度条，替代竖版高度计 */}
      <div
        aria-hidden
        className="min-[1025px]:hidden"
        style={{ position: 'absolute', left: '4vw', right: '4vw', bottom: '2.25rem', height: 1 }}
      >
        <span
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgb(var(--c-line-2))',
          }}
        />
        {TICKS.map((t) => (
          <span
            key={`htick-${t}`}
            style={{
              position: 'absolute',
              left: `${t}%`,
              top: -3,
              width: 1,
              height: 7,
              background: 'rgb(var(--c-dim))',
            }}
          />
        ))}
        <span
          ref={horizontalMarkerRef}
          style={{
            position: 'absolute',
            left: '0%',
            top: -5,
            width: 1,
            height: 11,
            background: 'rgb(var(--c-signal))',
          }}
        />
        <span
          ref={horizontalReadoutRef}
          className="hud-sm"
          style={{ position: 'absolute', right: 0, bottom: 8, color: 'rgb(var(--c-signal))' }}
        >
          000
        </span>
      </div>
    </div>
  );
}