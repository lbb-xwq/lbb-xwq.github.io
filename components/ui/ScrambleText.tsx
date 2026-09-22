'use client';

import { createElement, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

import { useStore, sel } from '@/lib/store';

// 插件注册是幂等的，模块级注册一次即可（多个组件 import 也不会重复注册）
gsap.registerPlugin(ScrambleTextPlugin);

export type ScrambleTextProps = {
  text: string;
  className?: string;
  as?: 'span' | 'p' | 'h1' | 'h2';
  charset?: string;
  trigger?: 'mount' | 'hover';
  duration?: number;
  delay?: number;
};

/**
 * 乱码揭示文字。
 *
 * 初始渲染就是最终文案（服务端也输出正确文本），再由 GSAP 把字符替换成 charset 里的乱码
 * 逐个揭示 —— 这样即使 JS 挂了、或者 JS 还在加载，页面上也不会出现空白标题。
 */
export default function ScrambleText({
  text,
  className,
  as = 'span',
  charset = '010101',
  trigger = 'mount',
  duration = 1.2,
  delay = 0,
}: ScrambleTextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const motion = useStore(sel.motion);
  const reduced = motion === 'reduced';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 减少动效时直接落到终态：乱码揭示属于纯装饰，没有信息量
    if (reduced) {
      el.textContent = text;
      return;
    }

    const run = () => {
      tweenRef.current?.kill();
      tweenRef.current = gsap.to(el, {
        duration,
        delay,
        ease: 'none', // 揭示节奏由 charset 的逐个替换决定，再叠缓动反而拖沓
        scrambleText: {
          text,
          chars: charset,
          speed: 1,
          revealDelay: 0,
          tweenLength: false,
        },
      });
    };

    if (trigger === 'hover') {
      // hover 模式下文字常驻可见，进入时再"重扫"一遍
      el.textContent = text;
      el.addEventListener('pointerenter', run);
      return () => {
        el.removeEventListener('pointerenter', run);
        tweenRef.current?.kill();
        tweenRef.current = null;
        el.textContent = text;
      };
    }

    run();
    return () => {
      tweenRef.current?.kill();
      tweenRef.current = null;
    };
  }, [text, charset, trigger, duration, delay, reduced]);

  // 用 createElement 渲染四种等价标签：类型上无需把 ref 强转成某个具体 HTMLElement 子类型
  return createElement(as, { ref, className }, text);
}
