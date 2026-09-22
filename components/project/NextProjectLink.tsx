'use client';

import { useState } from 'react';
import Link from 'next/link';

import ProjectArt from '@/components/projects/ProjectArt';
import type { Project } from '@/lib/data/content';

export type NextProjectLinkProps = {
  /** 下一个项目（最后一项时由页面回卷到第一项） */
  next: Project;
  reduced: boolean;
};

/**
 * 页尾的"下一个项目"大卡：整块是一张 next/link。
 * hover/focus 时画面 zoom、标签变 --c-signal（同一套键盘可达的"点亮"逻辑）。
 */
export default function NextProjectLink({ next, reduced }: NextProjectLinkProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const lit = hovered || focused;

  return (
    <section style={{ padding: '0 1.25rem' }}>
      <div style={{ maxWidth: '82rem', margin: '0 auto' }}>
        <Link
          href={`/projects/${next.slug}`}
          aria-label={`下一个项目：${next.name}`}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="scanlines"
          style={{
            position: 'relative',
            display: 'block',
            height: 'min(60vh, 520px)',
            overflow: 'hidden',
            backgroundColor: '#000',
            border: `1px solid ${lit ? 'rgb(var(--c-signal))' : 'rgb(var(--c-line-2))'}`,
            borderRadius: 'var(--radius-panel)',
            transition: reduced ? 'none' : 'border-color .6s var(--ease-out-quint)',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              transform: lit ? 'scale(1.05)' : 'scale(1)',
              transition: reduced ? 'none' : 'transform 1.1s var(--ease-out-quint)',
            }}
          >
            <ProjectArt seed={`${next.slug}-next`} palette={next.palette} />
          </span>

          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.15))',
            }}
          />

          <span
            className="hud"
            style={{
              position: 'absolute',
              left: '1.5rem',
              top: '1.5rem',
              color: lit ? 'rgb(var(--c-signal))' : 'rgb(var(--c-dim))',
              transition: reduced ? 'none' : 'color .4s var(--ease-out-quint)',
            }}
          >
            NEXT PROJECT
          </span>

          <span
            style={{
              position: 'absolute',
              left: '1.5rem',
              right: '1.5rem',
              bottom: '1.5rem',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.6rem, 4.5vw, 3.2rem)',
                lineHeight: 0.95,
                letterSpacing: '-0.02em',
                color: 'rgb(var(--c-fg))',
              }}
            >
              {next.name}
            </span>
            <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))', whiteSpace: 'nowrap' }}>
              {next.year} ↗
            </span>
          </span>
        </Link>
      </div>
    </section>
  );
}