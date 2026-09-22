'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ScrollSmoother from 'gsap/ScrollSmoother';

import { useStore, sel } from '@/lib/store';

/** 揭幕时长与模糊半径 */
const REVEAL_MS = 500;
const BLUR_PX = 24;

// SSR 阶段不能调 useLayoutEffect（React 会告警），客户端才需要"早于绘制"的时序
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * 路由切换时的揭幕层。
 *
 * 为什么是"先瞬间盖住、再淡出"而不是"先淡入"：App Router 导航时新页面先渲染、
 * 我们的 effect 才跑起来，能控制的只有"盖住的那一帧之后"。用 useLayoutEffect
 * 盖住（早于浏览器绘制），下一帧再放开来淡出，观众看到的就是新页面从模糊里浮出来 ——
 * 这正是参考站切页的观感，而且不需要 Router 级别的事件钩子。
 */
export default function RouteTransition() {
  const pathname = usePathname();
  const entered = useStore(sel.entered);
  const motion = useStore(sel.motion);
  const reduced = motion === 'reduced';

  const [covered, setCovered] = useState(false);
  const [instant, setInstant] = useState(false);
  const firstRun = useRef(true);
  const frameRef = useRef(0);
  const timerRef = useRef(0);

  useIsomorphicLayoutEffect(() => {
    // 首屏交给 Preloader，不叠第二层幕布
    if (!entered) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }

    // 复位滚动：ScrollSmoother 接管滚动时必须走它的 API，否则内部位置会失同步
    const smoother = ScrollSmoother.get();
    smoother?.scrollTop(0);
    if (!smoother && window.scrollY > 0) window.scrollTo(0, 0);

    if (reduced) {
      // 减少动效：不放模糊，直接结束（内容本身就是清晰的）
      setInstant(true);
      setCovered(false);
      return;
    }

    setInstant(true);
    setCovered(true);
    frameRef.current = window.requestAnimationFrame(() => {
      setInstant(false);
      setCovered(false);
    });
    // 万一 rAF 没跑到，也不能让观众一直盯着幕布
    timerRef.current = window.setTimeout(() => {
      setInstant(false);
      setCovered(false);
    }, REVEAL_MS + 60);

    return () => {
      window.cancelAnimationFrame(frameRef.current);
      window.clearTimeout(timerRef.current);
    };
  }, [pathname, entered, reduced]);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        // 盖住页面内容（--z-content = 60），但留在 HUD 之下：切页时顶部状态行是持续的
        zIndex: 'calc(var(--z-content) + 5)',
        pointerEvents: 'none',
        backgroundColor: 'rgb(var(--c-bg))',
        opacity: covered ? 0.96 : 0,
        filter: covered ? `blur(${BLUR_PX}px)` : 'blur(0px)',
        backdropFilter: covered ? `blur(${BLUR_PX}px)` : 'blur(0px)',
        WebkitBackdropFilter: covered ? `blur(${BLUR_PX}px)` : 'blur(0px)',
        transition: instant
          ? 'none'
          : `opacity ${REVEAL_MS}ms var(--ease-out-expo), filter ${REVEAL_MS}ms var(--ease-out-expo), backdrop-filter ${REVEAL_MS}ms var(--ease-out-expo)`,
      }}
    />
  );
}
