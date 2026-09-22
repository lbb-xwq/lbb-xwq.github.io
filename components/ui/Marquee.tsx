'use client';

import { useEffect, useRef, useState } from 'react';

import { useStore, sel } from '@/lib/store';

export type MarqueeProps = {
  children: React.ReactNode;
  /** 速度，单位 px/秒（按内容实际尺寸折算成动画时长，所以不同长度的内容观感一致） */
  speed?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  className?: string;
  pauseOnHover?: boolean;
};

/** 内容尺寸测量失败时的兜底时长，保证动画一定会动 */
const FALLBACK_DURATION = 20;

/**
 * 无缝跑马灯。
 *
 * 做法是复制一份内容，轨道整体位移 -50%（正好一份的宽度/高度）后瞬间回到起点，
 * 因为两份内容完全一致，这一跳在视觉上不可见 —— 比"等到跑完再重置"更简单也更稳。
 * 复制份 aria-hidden：屏幕阅读器不应该把同一段文案读两遍。
 */
export default function Marquee({
  children,
  speed = 80,
  direction = 'left',
  className,
  pauseOnHover = false,
}: MarqueeProps) {
  const itemRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState(FALLBACK_DURATION);
  const motion = useStore(sel.motion);
  const reduced = motion === 'reduced';
  // 悬停暂停用 state 而不是 CSS 类：animation-play-state 已经写在 inline style 上，
  // 类选择器会被 inline style 覆盖，只有让 state 参与计算才真的能暂停
  const [hovered, setHovered] = useState(false);

  const vertical = direction === 'up' || direction === 'down';
  const reversed = direction === 'right' || direction === 'down';

  useEffect(() => {
    const el = itemRef.current;
    if (!el) return;

    const measure = () => {
      // 用第一份内容的实际尺寸算时长：speed 是 px/s，这样改字号/改内容都不用调参数
      const size = vertical ? el.offsetHeight : el.offsetWidth;
      if (size <= 0) return;
      setDuration(Math.max(1, size / Math.max(1, speed)));
    };

    measure();
    // 字体加载完、窗口变化、内容变化都会改变尺寸，统一用 ResizeObserver 兜住
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [speed, vertical]);

  return (
    <div
      className={className}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          flexWrap: 'nowrap',
          width: vertical ? '100%' : 'max-content',
          willChange: 'transform',
          animationName: vertical ? 'marquee-y' : 'marquee-x',
          animationDuration: `${duration}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
          animationDirection: reversed ? 'reverse' : 'normal',
          // 减少动效时停在起始位置（仍是完整的可读内容，只是不循环）
          animationPlayState: reduced || (pauseOnHover && hovered) ? 'paused' : 'running',
        }}
      >
        <div
          ref={itemRef}
          style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', flexShrink: 0 }}
        >
          {children}
        </div>
        <div
          aria-hidden
          style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', flexShrink: 0 }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
