'use client';

import { create } from 'zustand';

export type Tier = 'high' | 'medium' | 'saver';
export type Theme = 'dark' | 'light';
export type Motion = 'full' | 'reduced';

/**
 * 全站状态（zustand v5）。
 * 所有组件只读这里的字段、只调这里的 action —— 这是并行开发的冻结接口。
 */
type StoreState = {
  /** 预加载器是否已完成（"CLICK TO ENTER" 之后为 true） */
  entered: boolean;
  /** 预加载进度 0→1，仅展示用 */
  boot: number;
  /** 导航浮层 */
  menuOpen: boolean;
  /** System / Global Config 面板 */
  settingsOpen: boolean;
  /** 音频引擎开关（浏览器要求用户手势后才能启动） */
  audioOn: boolean;
  /** 当前音轨 id，取值来自 lib/audio.ts 的 TRACKS */
  track: string;
  theme: Theme;
  motion: Motion;
  /** 生效的性能档（用户手动覆盖后使用此值） */
  tier: Tier;
  /** 设备自动判定出的性能档 */
  tierAuto: Tier;
  /** 实时 FPS 与像素比，HUD 读数用 */
  fps: number;
  dpr: number;

  enter: () => void;
  setBoot: (n: number) => void;
  setMenu: (v: boolean) => void;
  setSettings: (v: boolean) => void;
  setAudio: (v: boolean) => void;
  setTrack: (id: string) => void;
  setTheme: (t: Theme) => void;
  setMotion: (m: Motion) => void;
  setTier: (t: Tier) => void;
  setTierAuto: (t: Tier) => void;
  setFps: (n: number) => void;
  setDpr: (n: number) => void;
};

export const useStore = create<StoreState>((set) => ({
  entered: false,
  boot: 0,
  menuOpen: false,
  settingsOpen: false,
  audioOn: false,
  track: 'ambient',
  theme: 'dark',
  motion: 'full',
  tier: 'high',
  tierAuto: 'high',
  fps: 0,
  dpr: 1,

  enter: () => set({ entered: true }),
  setBoot: (n) => set({ boot: n }),
  setMenu: (menuOpen) => set({ menuOpen }),
  setSettings: (settingsOpen) => set({ settingsOpen }),
  setAudio: (audioOn) => set({ audioOn }),
  setTrack: (track) => set({ track }),
  setTheme: (theme) => set({ theme }),
  setMotion: (motion) => set({ motion }),
  setTier: (tier) => set({ tier }),
  setTierAuto: (tierAuto) => set({ tier: tierAuto, tierAuto }),
  setFps: (fps) => set({ fps }),
  setDpr: (dpr) => set({ dpr }),
}));

/** 常用选择器（避免组件里写内联箭头函数导致重复渲染） */
export const sel = {
  entered: (s: StoreState) => s.entered,
  tier: (s: StoreState) => s.tier,
  theme: (s: StoreState) => s.theme,
  motion: (s: StoreState) => s.motion,
  audioOn: (s: StoreState) => s.audioOn,
  track: (s: StoreState) => s.track,
  menuOpen: (s: StoreState) => s.menuOpen,
  settingsOpen: (s: StoreState) => s.settingsOpen,
};
