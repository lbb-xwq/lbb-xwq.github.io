'use client';

import { useEffect, useLayoutEffect } from 'react';

import { useStore, sel } from '@/lib/store';
import type { Motion, Theme, Tier } from '@/lib/store';
import { detectTier, isFinePointer, prefersReducedMotion } from '@/lib/tier';

/** 持久化 key 直接用字段名，方便在 DevTools / layout 里的内联脚本里对照 */
const KEY_THEME = 'theme';
const KEY_MOTION = 'motion';
const KEY_AUDIO = 'audio';
const KEY_TIER = 'tier';

const THEMES: Theme[] = ['dark', 'light'];
const MOTIONS: Motion[] = ['full', 'reduced'];
const TIERS: Tier[] = ['high', 'medium', 'saver'];

// SSR 阶段没有 window，只能用 useEffect；客户端用 useLayoutEffect 抢在首次绘制前落属性
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Safari 无痕模式会直接抛异常；读不到就当作"没有持久化值"
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 同上：写不进去不影响本次会话 */
  }
}

function pick<T extends string>(stored: string | null, allowed: readonly T[]): T | null {
  return stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : null;
}

/**
 * 把 store 里的偏好落到 <html> 上，并做 localStorage 持久化。
 *
 * 时序：layout 里的内联脚本已经在首帧前写好 data-theme/data-motion，
 * 这里只做"补写 + 后续同步"，所以正常路径下不会出现主题闪烁；
 * 内联脚本被 CSP 拦掉时，这条兜底也能在首次绘制前改正（useLayoutEffect 早于 paint）。
 */
export default function Hydrate() {
  const theme = useStore(sel.theme);
  const motion = useStore(sel.motion);

  // 1) 属性同步 + 持久化订阅
  useIsomorphicLayoutEffect(() => {
    const state = useStore.getState();

    const storedTheme = pick(readKey(KEY_THEME), THEMES);
    const storedMotion = pick(readKey(KEY_MOTION), MOTIONS);
    const storedTier = pick(readKey(KEY_TIER), TIERS);
    const storedAudio = readKey(KEY_AUDIO);

    // 先注册订阅再写状态，这样首次访问"补齐默认值"的结果也会被持久化
    const unsubscribe = useStore.subscribe((next, prev) => {
      if (next.theme !== prev.theme) writeKey(KEY_THEME, next.theme);
      if (next.motion !== prev.motion) writeKey(KEY_MOTION, next.motion);
      if (next.audioOn !== prev.audioOn) writeKey(KEY_AUDIO, next.audioOn ? 'on' : 'off');
      if (next.tier !== prev.tier) writeKey(KEY_TIER, next.tier);
    });

    // 默认值：主题固定 dark（参考站只有纯黑底 + 可选浅色），动效跟随系统偏好
    state.setTheme('dark'); // 参考站没有浅色主题：始终深色（storedTheme 不再生效）
    state.setMotion(storedMotion ?? (prefersReducedMotion() ? 'reduced' : 'full'));
    state.setAudio(storedAudio === 'on');
    if (storedTier) state.setTier(storedTier);
    // 设备能力每次都重新探测：换了网络/外接屏/省电模式都不该沿用旧档位
    else state.setTierAuto(detectTier());

    return unsubscribe;
  }, []);

  // 2) 落 <html> 属性：theme / motion / cursor
  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-motion', motion);

    // 触屏或减少动效时不挂 data-cursor，globals.css 里 hide 系统光标的选择器也就不会命中
    if (motion === 'reduced' || !isFinePointer()) root.removeAttribute('data-cursor');
    else root.setAttribute('data-cursor', 'custom');
  }, [theme, motion]);

  return null;
}
