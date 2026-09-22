'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

import FixedTitle from '@/components/about/FixedTitle';
import FrameSequence from '@/components/about/FrameSequence';
import SectorList from '@/components/about/SectorList';
import ViewportLayer from '@/components/about/ViewportLayer';
import Reveal from '@/components/ui/Reveal';
import { about } from '@/lib/data/content';

/** 正文大字：lead / leadBig / outro.big 共用同一套排版 */
const BIG_TEXT: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(2rem, 5vw, 3.5rem)',
  lineHeight: 1,
  letterSpacing: '-0.02em',
  margin: 0,
};

/**
 * 上下固定渐变遮罩：让滚到 HUD 与页底的内容淡出，而不是被硬边切掉。
 * 层级压在正文之上、顶部 HUD（--z-hud = 70）之下，所以状态行不会被糊住。
 */
function GradientMasks() {
  const base: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    right: 0,
    height: '10rem',
    zIndex: 8,
    pointerEvents: 'none',
  };
  return (
    <>
      <div
        aria-hidden
        style={{
          ...base,
          top: 0,
          background: 'linear-gradient(to bottom, rgb(var(--c-bg)), transparent)',
        }}
      />
      <div
        aria-hidden
        style={{
          ...base,
          bottom: 0,
          background: 'linear-gradient(to top, rgb(var(--c-bg)), transparent)',
        }}
      />
    </>
  );
}

/** outro 的胶囊按钮：hover 时填成信号色、文字转黑 */
function OutroCta() {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href="/contact"
      className="hud"
      data-cursor-hover
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid rgb(var(--c-line-2))',
        borderRadius: 9999,
        padding: '0.9rem 1.6rem',
        color: hovered ? '#000' : 'rgb(var(--c-fg))',
        backgroundColor: hovered ? 'rgb(var(--c-signal))' : 'transparent',
        transition: `background-color 400ms var(--ease-out-expo), color 400ms var(--ease-out-expo)`,
      }}
    >
      {about.outro.cta}
    </Link>
  );
}

/**
 * 关于页。
 *
 * 只有一列正文（max-width 42rem），右半边留给滚动的图片序列；
 * 标题、渐变遮罩、序列帧三者都是视口固定件，必须渲染到 #smooth-content 之外（见 ViewportLayer）。
 * main 同时是帧序列擦洗的 trigger，所以它必须留在正文流里、由内容撑高。
 */
export default function AboutClient() {
  const articleRef = useRef<HTMLElement | null>(null);

  return (
    <main
      ref={articleRef}
      className="about-page"
      style={{
        position: 'relative',
        zIndex: 1,
        paddingTop: 'clamp(8rem, 18vh, 11rem)',
        // 左侧留出与固定 canvas 错开的空档；右侧限制 42rem 让正文不会伸进画布
        paddingLeft: 'clamp(1.5rem, 6vw, 6rem)',
        paddingRight: 'clamp(1.5rem, 4vw, 3rem)',
        paddingBottom: '12rem',
      }}
    >
      <ViewportLayer>
        <GradientMasks />
        <FixedTitle triggerRef={articleRef} />
      </ViewportLayer>

      <div style={{ maxWidth: '42rem' }}>
        <p style={BIG_TEXT}>{about.lead.join(' ')}</p>

        <p style={{ ...BIG_TEXT, marginTop: '0.4rem' }}>
          {about.leadBig.map((line) => (
            <span key={line} style={{ display: 'block' }}>
              {line}
            </span>
          ))}
        </p>

        <p
          style={{
            maxWidth: '60ch',
            lineHeight: 1.7,
            color: 'rgb(var(--c-dim))',
            margin: '1.75rem 0 0',
          }}
        >
          {about.lede}
        </p>

        {/* ≤1024px 时它会落在这个位置（正文流内、宽 100%）；桌面端渲染进视口固定层 */}
        <FrameSequence triggerRef={articleRef} />
      </div>

      <div style={{ maxWidth: '42rem', marginTop: '5.5rem' }}>
        <SectorList />
      </div>

      <section style={{ maxWidth: '42rem', marginTop: '7rem' }}>
        <Reveal y={40}>
          <p style={BIG_TEXT}>
            {about.outro.big.map((line) => (
              <span key={line} style={{ display: 'block' }}>
                {line}
              </span>
            ))}
          </p>
          <div style={{ marginTop: '2.25rem' }}>
            <OutroCta />
          </div>
        </Reveal>
      </section>
    </main>
  );
}