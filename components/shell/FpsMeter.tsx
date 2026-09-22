'use client';

import { useEffect } from 'react';

import { useStore } from '@/lib/store';

/** 采样窗口：太短会抖，太长 HUD 读数就跟不上实际情况 */
const SAMPLE_MS = 800;

/**
 * 帧率采样器。
 *
 * 不渲染任何东西 —— 它只把读数写进 store，谁来显示（HUD、设置面板）由消费方决定。
 * 页面切到后台时 rAF 本来就会停，但显式 stop 可以顺带清掉计数器，
 * 避免切回来时把"标签页休眠的几秒"当成帧耗时算出一个荒唐的 FPS。
 */
export default function FpsMeter() {
  useEffect(() => {
    let rafId = 0;
    let frames = 0;
    let windowStart = performance.now();
    let running = false;

    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed >= SAMPLE_MS) {
        const state = useStore.getState();
        state.setFps(Math.round((frames * 1000) / elapsed));
        state.setDpr(Math.round((window.devicePixelRatio || 1) * 100) / 100);
        frames = 0;
        windowStart = now;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      frames = 0;
      windowStart = performance.now();
      rafId = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
