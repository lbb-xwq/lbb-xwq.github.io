'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ScrollSmoother from 'gsap/ScrollSmoother';

import { useStore, sel } from '@/lib/store';

gsap.registerPlugin(ScrollSmoother, ScrollTrigger);

/**
 * ScrollSmoother 需要的结构样式。
 * globals.css 是冻结文件，所以由组件在启用平滑滚动时注入：
 * wrapper 变成固定视口，content 在里面被 translate —— 这就是"整页跟着鼠标滚轮缓动"的原理。
 */
const SMOOTHER_CSS = `
#smooth-wrapper {
  overflow: hidden;
  position: fixed;
  height: 100%;
  width: 100%;
  top: 0;
  left: 0;
}
#smooth-content {
  overflow: visible;
  width: 100%;
}
`;

export type SmoothScrollProps = { children: React.ReactNode };

/**
 * 平滑滚动容器。
 *
 * 两个关键决定：
 *  1) motion === 'reduced' 时根本不创建 ScrollSmoother —— 减少动效的用户要的是"滚动立刻跟手"，
 *     而 ScrollSmoother 的本质就是延迟跟手，这两件事无法共存；
 *  2) 用 requestAnimationFrame 延后一帧创建：ScrollSmoother 通过测量 wrapper/content 的尺寸
 *     来建立滚动高度，必须等字体与首屏布局落地后再量，否则高度算错（页面底部会拉不到）。
 */
export default function SmoothScroll({ children }: SmoothScrollProps) {
  const motion = useStore(sel.motion);

  useEffect(() => {
    if (motion === 'reduced') return;

    let smoother: ScrollSmoother | null = null;
    const rafId = window.requestAnimationFrame(() => {
      const wrapper = document.getElementById('smooth-wrapper');
      const content = document.getElementById('smooth-content');
      // 已经有实例就不再创建：ScrollSmoother 全局只允许一个
      if (!wrapper || !content || ScrollSmoother.get()) return;

      smoother = ScrollSmoother.create({
        wrapper,
        content,
        smooth: 1,
        effects: true,
        normalizeScroll: true,
        smoothTouch: 0.1,
      });

      // 首屏尺寸确定后再刷一次，保证 ScrollTrigger 的起点/终点正确
      ScrollTrigger.refresh();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      // kill 会把 wrapper/content 的内联样式还原，切到 reduced motion 时能回退成原生滚动
      smoother?.kill();
    };
  }, [motion]);

  return (
    <>
      {motion === 'reduced' ? null : <style dangerouslySetInnerHTML={{ __html: SMOOTHER_CSS }} />}
      {children}
    </>
  );
}
