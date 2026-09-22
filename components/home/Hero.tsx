'use client';

import NoiseGridBackground from '@/components/canvas/NoiseGridBackground';
import HeroParticles from '@/components/canvas/HeroParticles';
import { sel, useStore } from '@/lib/store';

import HeroCenter from './HeroCenter';
import HeroHud from './HeroHud';
import HeroPanel from './HeroPanel';

/**
 * 首页 hero（单屏 100svh、overflow hidden、底色 --c-solid）。
 *
 * 图层顺序与参考站一致（z 从下到上）：
 *   0   NoiseGridBackground（自身 fixed + z-index: var(--z-canvas)）
 *   50  粒子层：参考站实测 hero_heroCanvas = [20,0,1384,805]，
 *       也就是「铺满全宽、左右各留 20px」，并且 mix-blend-mode: lighten（加亮混合）
 *   50  HeroPanel（左半屏毛玻璃 + 照片画框）
 *   50  HeroHud（单行跑马灯 / 右侧读数 / 底部两列）
 *   60  HeroCenter（姓名行 + 巨型标题 + INFO_LOG）
 */
export default function Hero() {
  const entered = useStore(sel.entered);
  const reduced = useStore((s) => s.motion === 'reduced');

  return (
    <section
      className="home-hero"
      style={{
        position: 'relative',
        display: 'grid',
        placeContent: 'center',
        height: '100svh',
        width: '100%',
        overflow: 'hidden',
        padding: '1.25rem',
        backgroundColor: 'rgb(var(--c-solid))',
      }}
    >
      <NoiseGridBackground />

      {/* 粒子层：全宽 + lighten（实测左 20px / 宽 1384 / mix-blend-mode: lighten） */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          top: 0,
          bottom: 0,
          mixBlendMode: 'lighten',
          pointerEvents: 'none',
          opacity: reduced || entered ? 1 : 0,
          transition: reduced ? 'none' : 'opacity 1.4s var(--ease-out-expo)',
        }}
      >
        <HeroParticles />
      </div>

      <HeroPanel />
      <HeroHud />
      <HeroCenter />
    </section>
  );
}