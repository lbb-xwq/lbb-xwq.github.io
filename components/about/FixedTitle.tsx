'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { about } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

gsap.registerPlugin(ScrollTrigger);

/** 缩小幅度与滚动区间：800px 内缩到 86%，再往下就保持不变 */
const SHRINK_TO = 0.86;
const SHRINK_RANGE = 800;

export type FixedTitleProps = {
  /** 正文容器：缩小动效的滚动区间以它为参照 */
  triggerRef: React.RefObject<HTMLElement | null>;
};

/**
 * 右上固定面包屑：随滚动轻微缩小。
 *
 * mix-blend-difference 让面包屑压在右侧序列帧上时自动反色，
 * 所以这里不设背景、也不设不透明遮罩 —— 混合需要能"看到"后面的内容。
 * 先用回调 ref 落到 state，等元素（可能渲染在 portal 里）真的挂上再建 ScrollTrigger。
 */
export default function FixedTitle({ triggerRef }: FixedTitleProps) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const reduced = useStore(sel.motion) === 'reduced';

  const titleRef = useCallback((node: HTMLDivElement | null) => {
    setEl(node);
  }, []);

  useEffect(() => {
    if (!el) return;
    // 减少动效：文字保持原尺寸，连 ScrollTrigger 都不建
    if (reduced) {
      gsap.set(el, { clearProps: 'transform' });
      return;
    }

    const tween = gsap.fromTo(
      el,
      { scale: 1 },
      {
        scale: SHRINK_TO,
        ease: 'none',
        scrollTrigger: {
          trigger: triggerRef.current ?? el,
          start: 'top top',
          end: `+=${SHRINK_RANGE}`,
          scrub: true,
        },
      },
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      gsap.set(el, { clearProps: 'transform' });
    };
  }, [el, reduced, triggerRef]);

  return (
    <div
      ref={titleRef}
      className="about-page"
      style={{
        position: 'fixed',
        right: 'max(1.25rem, 5vw)', // 与右侧固定 canvas 的 5vw 对齐（窄屏保底 1.25rem）
        // 顶部 HUD 高 48px，标题从它下面开始，避免压住 MENU / SOUND / SYS
        top: '3.75rem',
        zIndex: 10,
        mixBlendMode: 'difference',
        transformOrigin: 'top right',
        textAlign: 'right',
        pointerEvents: 'none',
        maxWidth: 'min(48rem, 62vw)',
      }}
    >
      <nav
        className="hud"
        aria-label="面包屑"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'baseline',
          gap: '0.45rem',
          color: 'rgb(var(--c-fg))',
        }}
      >
        <Link href="/" style={{ pointerEvents: 'auto' }}>
          {about.breadcrumb[0]}
        </Link>
        <span aria-hidden style={{ color: 'rgb(var(--c-dim))' }}>
          /
        </span>
        <span aria-current="page" style={{ color: 'rgb(var(--c-dim))' }}>
          {about.breadcrumb[1]}
        </span>
      </nav>
    </div>
  );
}