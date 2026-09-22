'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { sel, useStore } from '@/lib/store';

import { useFixedPin } from './useFixedPin';

gsap.registerPlugin(ScrollTrigger);

export type ScrollTitleProps = {
  /** 项目名（content.ts 的 project.name） */
  name: string;
  /** 滚动触发的参照物：Hero 区块。用它的 top 对齐视口 top 作为起点 */
  triggerRef: React.RefObject<HTMLElement | null>;
};

/**
 * 固定在右上角的项目名（滚动时缩小淡出）。
 *
 * 触发点用 Hero 元素而不是自己：`fixed` 元素的页面坐标几乎不随滚动变化，
 * 拿它自己当 trigger 会得到一个"还没滚就已经跑完"的区间。
 * Hero 的 top 对齐视口 top 时正好是滚动起点（scrollY = 0），
 * 之后 1200px 内把 scale 从 1 洗到 0.86、透明度降到 0.4。
 */
export default function ScrollTitle({ name, triggerRef }: ScrollTitleProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const motion = useStore(sel.motion);

  // ScrollSmoother 用 transform 移动内容，fixed 会被"拖走"：这个 hook 每帧补回反向位移
  useFixedPin(titleRef);

  useEffect(() => {
    const el = titleRef.current;
    const trigger = triggerRef.current;
    if (!el || !trigger) return;

    if (motion === 'reduced') {
      // 减少动效：不建 ScrollTrigger，保持初始大小
      gsap.set(el, { clearProps: 'transform,opacity' });
      return;
    }

    const tween = gsap.fromTo(
      el,
      { scale: 1, opacity: 1 },
      {
        scale: 0.86,
        opacity: 0.4,
        ease: 'none',
        scrollTrigger: {
          trigger,
          start: 'top top',
          end: '+=1200',
          scrub: true,
        },
      },
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      gsap.set(el, { clearProps: 'transform,opacity' });
    };
  }, [motion, triggerRef]);

  return (
    <h2
      ref={titleRef}
      aria-hidden
      className="hidden md:block"
      style={{
        position: 'fixed',
        top: '6rem',
        right: '2.5rem',
        margin: 0,
        maxWidth: '42vw',
        textAlign: 'right',
        transformOrigin: 'top right',
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(1.1rem, 2.4vw, 2rem)',
        lineHeight: 1.05,
        letterSpacing: '-0.01em',
        color: 'rgb(var(--c-dim))',
        pointerEvents: 'none',
        zIndex: 'var(--z-hud)',
        willChange: 'transform',
      }}
    >
      {name}
    </h2>
  );
}