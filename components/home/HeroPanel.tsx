'use client';

import { useState, type CSSProperties } from 'react';

import { person } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

/**
 * 照片画框宽度：用一个 min() 同时封住三个方向 ——
 *  - 72%：不超过毛玻璃面板宽度的 72%（面板宽 = 50vw）
 *  - 22rem：大屏上的视觉上限
 *  - 42vh：配合 3:4 比例，画框高约 56vh，矮窗口下照片不会顶出面板
 * 三者取最小，任意窗口比例都不会把画框撑破。
 */
const FRAME_WIDTH = '168px';

/** L 形角标只画相邻两条边（14×14） */
const CORNER_EDGE = '1px solid rgb(var(--c-signal))';

/** 四角角标相对画框边框外扩 1px，正好压住 1px 边框 */
const CORNER_MARKS: { key: string; style: CSSProperties }[] = [
  { key: 'tl', style: { top: '-1px', left: '-1px', borderTop: CORNER_EDGE, borderLeft: CORNER_EDGE } },
  { key: 'tr', style: { top: '-1px', right: '-1px', borderTop: CORNER_EDGE, borderRight: CORNER_EDGE } },
  { key: 'bl', style: { bottom: '-1px', left: '-1px', borderBottom: CORNER_EDGE, borderLeft: CORNER_EDGE } },
  { key: 'br', style: { bottom: '-1px', right: '-1px', borderBottom: CORNER_EDGE, borderRight: CORNER_EDGE } },
];

/**
 * 左半屏毛玻璃面板（参考站 `.hero_overlayWrap` + `.hero_overlay`）。
 *
 * 图层：外框 50% 宽 × 100% 高、mix-blend-mode:plus-lighter —— 面板会跟底下的噪声网格做加亮混合，
 * 而不是"盖住"它。里面依次是：HeroParticles 粒子层 → 照片画框 → 底部状态行。
 * 面板自身 pointer-events:none，只有照片拿 auto（要能 hover），这样中央文案与右侧 HUD 永远不被挡。
 */
export default function HeroPanel() {
  const entered = useStore(sel.entered);
  const reduced = useStore(sel.motion) === 'reduced';
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="absolute left-0 top-0 h-full w-1/2"
      style={{ zIndex: 50, mixBlendMode: 'plus-lighter', pointerEvents: 'none' }}
    >
      {/* 扫描线：1px 横线 + hero-scan 4s 线性循环（减少动效时直接不渲染） */}
      {!reduced && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '1px',
            width: '100%',
            backgroundImage: 'linear-gradient(to right, transparent, rgb(var(--c-fg) / 0.9), transparent)',
            animation: 'hero-scan 4s linear infinite',
          }}
        />
      )}

      {/* 毛玻璃面板本体 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          borderRadius: 'var(--radius-panel)',
          border: '1px solid rgb(var(--c-line))',
          backgroundColor: 'rgb(var(--c-fg) / 0.0425)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {/*
          粒子层。HeroParticles 自带 absolute inset-0 + mix-blend-mode:lighten + 就绪后 1.4s 淡入，
          所以这里再包一层，用 store.entered 控制整层 opacity 0→1：
          预加载器结束（点击进入）之前面板是空的，进入后 1.4s 淡入，缓动与 globals 的 --ease-out-expo 一致。
        */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            opacity: reduced || entered ? 1 : 0,
            transition: reduced ? 'none' : 'opacity 1.4s var(--ease-out-expo)',
          }}
        >
        </div>
        {/* 首页不放照片：参考站首页是 WebGL 3D 效果，真实头像放在 /about 的滚动序列里 */}

        {/* 面板底部状态行 */}
        <p
          className="hud-sm"
          style={{
            position: 'absolute',
            left: '1rem',
            bottom: '0.875rem',
            margin: 0,
            color: 'rgb(var(--c-dim))',
          }}
        >
          {person.roleEn} · {person.city}
        </p>
      </div>
    </div>
  );
}
