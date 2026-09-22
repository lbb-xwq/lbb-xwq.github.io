'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type ViewportLayerProps = {
  children: React.ReactNode;
};

/**
 * 视口固定层：把子节点渲染到 <body> 末尾的独立宿主节点里，也就是渲染到 #smooth-content 之外。
 *
 * 为什么必须这样：ScrollSmoother 会给 #smooth-content 打上 `matrix3d(...)` 位移，
 * 而任何 transform 都会成为 `position: fixed` 后代的包含块 —— 页面里的 "fixed" 元素
 * 于是变成相对整页定位，会跟着内容一起滚走（参考站也是把这类固定件单独提出来渲染的）。
 *
 * 宿主节点刻意不写 position / z-index / transform / filter：
 * 它不建立层叠上下文，子元素的 z-index 与 mix-blend-mode 仍在根层叠上下文里生效
 * （右上大标题要跟页面内容做差值混合，一旦被隔离到自己的上下文里就失效了）。
 */
export default function ViewportLayer({ children }: ViewportLayerProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('data-viewport-layer', '');
    // 固定层整体不拦指针：里面只有装饰元素，唯一的链接自己打开 pointer-events
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    setHost(el);
    return () => {
      setHost(null);
      el.remove();
    };
  }, []);

  // 首帧（服务端与 hydration 那一帧）没有宿主节点，渲染 null 即可，避免 SSR 不一致
  if (!host) return null;
  return createPortal(children, host);
}