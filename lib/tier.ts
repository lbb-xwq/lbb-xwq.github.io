import type { Tier } from './store';

/**
 * 性能档判定。
 *
 * 设计原则：只用浏览器能「同步、零成本」拿到的信号。
 * 不做 WebGL 探测性渲染（那会在首屏就创建一个 context，反而拖慢启动），
 * 因此这里的判定是保守的估计值，只用于「是否降级」，不用于精确能力测量。
 *
 * 阈值（按优先级从上到下命中第一条）：
 *  - saver：用户要求减少动效；或 CPU 线程 ≤ 2；或设备内存 ≤ 2GB；或「触屏 + 线程 ≤ 4」
 *           （低端手机跑 WebGL 粒子基本必掉帧，直接退化成静态网格更诚实）
 *  - medium：线程 < 8；或内存 ≤ 4GB；或任何触屏设备（移动端即使旗舰也要按面积/功耗降一档）
 *  - high：桌面 + 线程 ≥ 8 + 内存 ≥ 8GB
 *
 * deviceMemory 只有 Chromium 实现，缺省按 4GB 处理（等于「不确定 → 不判高分」）。
 */
export const TIER_THRESHOLDS = {
  /** 低于这个线程数直接算最弱档 */
  saverCores: 2,
  /** 低于这个内存（GB）直接算最弱档 */
  saverMemory: 2,
  /** 触屏设备低于这个线程数算最弱档 */
  saverTouchCores: 4,
  /** 达到这个线程数才可能算高分档 */
  highCores: 8,
  /** 达到这个内存（GB）才可能算高分档 */
  highMemory: 8,
} as const;

/** 是否命中系统级「减少动效」偏好 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 是否为精确指针（鼠标/触控板），自定义光标只在这类设备上启用 */
export function isFinePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/** 是否触屏为主（粗指针或无 hover 能力） */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
    return true;
  }
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

/** 读出非标准/未在 TS 里声明的设备信号（deviceMemory 只有 Chromium 有） */
function readDeviceSignals(): { cores: number; memory: number } {
  const nav: Navigator = navigator;
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4;
  const memory = (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return { cores, memory };
}

export function detectTier(): Tier {
  // SSR 阶段没有设备信号，先给高分档，客户端 Hydrate 时会立刻用 setTierAuto 覆盖
  if (typeof window === 'undefined') return 'high';

  const { cores, memory } = readDeviceSignals();
  const touch = isTouchDevice();

  if (prefersReducedMotion()) return 'saver';
  if (cores <= TIER_THRESHOLDS.saverCores || memory <= TIER_THRESHOLDS.saverMemory) return 'saver';
  if (touch && cores <= TIER_THRESHOLDS.saverTouchCores) return 'saver';

  if (cores < TIER_THRESHOLDS.highCores || memory < TIER_THRESHOLDS.highMemory) return 'medium';
  if (touch) return 'medium';

  return 'high';
}
