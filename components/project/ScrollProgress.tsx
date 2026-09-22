'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { useFixedPin } from './useFixedPin';

// 插件注册幂等；这里注册一次即可，Reveal / ScrollTitle 也会各自注册
gsap.registerPlugin(ScrollTrigger);

/** 补零到三位：000 → 100，等宽数字不会因为位数变化而左右跳 */
function pad3(n: number): string {
  return String(Math.round(n)).padStart(3, '0');
}

/**
 * 左下角的滚动进度：fixed bottom-6 left-10。
 *
 * 读的是 ScrollTrigger 的 self.progress（0..1），由 onUpdate 驱动，
 * 写 DOM 而不是 setState —— 滚动中每帧 setState 会把整页详情组件拖着一起重渲染。
 * reduced motion 下不额外处理：ScrollTrigger 依旧工作（原生滚动时 progress 一样准），
 * 只是这里的数值变化本来就没有过渡动画。
 */
export default function ScrollProgress() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const numberRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);

  // ScrollSmoother 靠 transform 移动内容，fixed 元素会被一起拖走：每帧补回反向位移
  useFixedPin(rootRef);

  useEffect(() => {
    const number = numberRef.current;
    const bar = barRef.current;
    const root = rootRef.current;
    if (!number || !bar || !root) return;

    let lastA11y = -1;
    const draw = (progress: number) => {
      const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
      bar.style.transform = `scaleX(${p})`;
      number.textContent = pad3(p * 100);
      const rounded = Math.round(p * 100);
      if (rounded !== lastA11y) {
        lastA11y = rounded;
        root.setAttribute('aria-valuenow', String(rounded));
      }
    };

    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => draw(self.progress),
      // 页面高度变化 / 刷新时也重画一次，避免刷新后停在旧读数
      onRefresh: (self) => draw(self.progress),
    });

    return () => {
      st.kill();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="progressbar"
      aria-label="页面阅读进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      style={{
        position: 'fixed',
        left: '2.5rem',
        bottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        pointerEvents: 'none',
        zIndex: 'var(--z-hud)',
      }}
    >
      <span ref={numberRef} className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
        000
      </span>
      <span
        aria-hidden
        style={{
          position: 'relative',
          display: 'block',
          width: '8rem',
          height: 1,
          background: 'rgb(var(--c-line-2))',
        }}
      >
        <span
          ref={barRef}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgb(var(--c-signal))',
            transform: 'scaleX(0)',
            transformOrigin: 'left center',
          }}
        />
      </span>
    </div>
  );
}