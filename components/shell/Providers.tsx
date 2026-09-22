'use client';

import { useEffect, useRef } from 'react';

import { startAudio, stopAudio } from '@/lib/audio';
import { useStore, sel } from '@/lib/store';

/**
 * 全站客户端 Provider。
 *
 * 目前承担的唯一职责是：把 store 里的音频状态同步到 lib/audio.ts。
 * 做成"单向对账"（状态先改 → 这里执行副作用）而不是让每个按钮自己调音频 API，
 * 好处是任何入口（HeaderControls / SettingsPanel / 未来的快捷键）都不会漏调用，
 * 而 lib/audio.ts 里的 start/stop 都是幂等的，重复调用无副作用。
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  const audioOn = useStore(sel.audioOn);
  const track = useStore(sel.track);
  /** 是否已经发生过用户手势（浏览器只允许在手势里 resume AudioContext） */
  const gestured = useRef(false);

  useEffect(() => {
    if (!audioOn) { stopAudio(); return; }
    // 没有手势就不要碰 AudioContext：那会创建一个永远 suspended 的上下文，
    // 音源节点 start() 会逐条打 autoplay 警告，而且用户什么也听不到。
    // 这种"从 localStorage 恢复成开启"的情况交给下面的一次性手势监听去补启动。
    if (gestured.current) startAudio(track);
  }, [audioOn, track]);

  /**
   * 浏览器要求 AudioContext 必须在用户手势里 resume。
   * 如果音频开关是从 localStorage 恢复成"开启"的，那时并没有手势，
   * 于是这里第一次指针/键盘交互时补一次启动 —— 只补一次，避免每次点击都重建音轨。
   */
  useEffect(() => {
    const onGesture = () => {
      gestured.current = true;
      const state = useStore.getState();
      if (state.audioOn) startAudio(state.track);
    };
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  return <>{children}</>;
}
