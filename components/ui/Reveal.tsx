'use client';

import { createElement, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { useStore, sel } from '@/lib/store';

// ScrollTrigger 的注册是幂等的；统一在这里注册，调用方不需要关心插件初始化
gsap.registerPlugin(ScrollTrigger);

export type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: keyof React.JSX.IntrinsicElements;
};

/**
 * 一次性滚动入场。
 *
 * 之所以用 `once: true`：回到已经看过的段落时再播一次会让长页面变得很吵，
 * 入场动效的作用是"告诉你这里有新东西"，重复播放就失去意义了。
 */
export default function Reveal({ children, className, delay = 0, y = 12, as = 'div' }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const motion = useStore(sel.motion);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (motion === 'reduced') {
      // 减少动效：内容直接可见，连 ScrollTrigger 都不创建（少一个滚动监听）
      gsap.set(el, { clearProps: 'opacity,transform' });
      return;
    }

    const tween = gsap.fromTo(
      el,
      { opacity: 0, y },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        delay,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      },
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      // 卸载/切档时清掉内联样式，避免元素被留在 opacity:0 的状态
      gsap.set(el, { clearProps: 'opacity,transform' });
    };
  }, [delay, y, motion]);

  return createElement(as, { ref, className }, children);
}
