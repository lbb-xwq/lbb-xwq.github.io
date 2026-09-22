'use client';

import Link from 'next/link';
import { useState } from 'react';

import { notFound } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

/** 四角 L 形角标（--c-signal），贴着装饰框的角往里画 */
function cornerStyle(v: 'top' | 'bottom', h: 'left' | 'right'): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 14,
    height: 14,
    borderStyle: 'solid',
    borderColor: 'rgb(var(--c-signal))',
    borderWidth: 0,
  };
  if (v === 'top') {
    base.top = 0;
    base.borderTopWidth = 1;
  } else {
    base.bottom = 0;
    base.borderBottomWidth = 1;
  }
  if (h === 'left') {
    base.left = 0;
    base.borderLeftWidth = 1;
  } else {
    base.right = 0;
    base.borderRightWidth = 1;
  }
  return base;
}

/**
 * 404。
 *
 * 单屏居中，装饰只有一条 1px 扫描线（globals.css 的 hero-scan）和四角角标。
 * 扫描线从 -10vh 跑到 110vh，所以外面套一层 `overflow: clip`：
 * clip 只做裁切、不会变成滚动容器，因此不会给页面造出多余的滚动高度。
 * 减少动效时不渲染扫描线（循环动效是纯装饰）。
 */
export default function NotFound() {
  const reduced = useStore(sel.motion) === 'reduced';
  const [hovered, setHovered] = useState(false);

  return (
    <main
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        minHeight: '100svh',
        padding: '7rem 1.5rem',
        textAlign: 'center',
      }}
    >
      {reduced ? null : (
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, overflow: 'clip', pointerEvents: 'none' }}
        >
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: 1,
              backgroundImage:
                'linear-gradient(to right, transparent, rgba(253,255,255,0.2), transparent)',
              animation: 'hero-scan 4s linear infinite',
            }}
          />
        </div>
      )}

      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 'clamp(1rem, 3.5vw, 2.5rem)',
          pointerEvents: 'none',
        }}
      >
        <span style={cornerStyle('top', 'left')} />
        <span style={cornerStyle('top', 'right')} />
        <span style={cornerStyle('bottom', 'left')} />
        <span style={cornerStyle('bottom', 'right')} />
      </div>

      <div style={{ position: 'relative', maxWidth: '44rem' }}>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(6rem, 22vw, 18rem)',
            lineHeight: 0.8,
            letterSpacing: '-0.05em',
            fontWeight: 500,
            margin: 0,
          }}
        >
          {notFound.code}
        </p>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            margin: '1.25rem 0 0',
          }}
        >
          {notFound.title}
        </h1>

        <p style={{ margin: '1rem 0 0', lineHeight: 1.7, color: 'rgb(var(--c-dim))' }}>
          {notFound.body}
        </p>

        <Link
          href="/"
          className="hud"
          data-cursor-hover
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginTop: '2.5rem',
            border: '1px solid rgb(var(--c-line-2))',
            borderRadius: 9999,
            padding: '0.9rem 1.6rem',
            color: hovered ? '#000' : 'rgb(var(--c-fg))',
            backgroundColor: hovered ? 'rgb(var(--c-signal))' : 'transparent',
            transition:
              'background-color 400ms var(--ease-out-expo), color 400ms var(--ease-out-expo)',
          }}
        >
          {notFound.cta}
        </Link>
      </div>
    </main>
  );
}