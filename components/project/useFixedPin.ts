'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ScrollSmoother from 'gsap/ScrollSmoother';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

/**
 * 让 `position: fixed` 的浮层真的钉在视口上。
 *
 * 为什么需要这一步：layout.tsx 里由 ScrollSmoother 接管滚动，它的实现是
 * 给 #smooth-content 加 transform: translate3d(0, -scrollTop, 0)。
 * 而 transform 会让所有后代里 position:fixed 的元素的包含块从视口变成 #smooth-content ——
 * 结果是"固定"元素会跟着内容一起被平移走（看起来像 absolute）。
 *
 * 补偿办法：每个滚动帧给元素补一个反向位移 y = 当前滚动位置，正好抵消祖先的平移。
 * 没有 ScrollSmoother（motion === 'reduced' 时它根本不创建）就没有祖先平移，补 0。
 * 这个位移同样借 ScrollTrigger 驱动，所以两种模式共用一条代码路径。
 */
export function useFixedPin(ref: { current: HTMLElement | null }): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = (self: ScrollTrigger) => {
      gsap.set(el, { y: ScrollSmoother.get() ? self.scroll() : 0 });
    };

    // start:0 / end:'max'：只借它的"每帧滚动回调"，不关心区间
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: sync,
      onRefresh: sync,
    });

    return () => {
      st.kill();
      gsap.set(el, { clearProps: 'transform' });
    };
  }, [ref]);
}