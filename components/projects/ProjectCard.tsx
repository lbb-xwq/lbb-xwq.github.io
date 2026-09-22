'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { Project } from '@/lib/data/content';

import ProjectArt from './ProjectArt';

export type ProjectCardProps = {
  project: Project;
  /** motion === 'reduced'：去掉过渡，只保留静态高亮 */
  reduced: boolean;
};

/**
 * 斜向墙上的一张卡。
 *
 * 尺寸全部来自祖先上的 CSS 变量（ProjectWall 注入）：
 *   --card-w 卡宽 → min(38vw, 520px) / 窄屏 min(46vw, 340px)
 *   --card-h = --card-w * 0.625（16:10），第二列的半张卡错位就是 --card-h / 2
 * 这样改一处变量就同时改掉卡、错位与 clamp 的测量基准。
 *
 * hover/focus 用 state 而不是 group-hover 类：位移/描边都写在 inline style 上，
 * 类选择器压不过 inline style（参考 HeaderControls 里 HudButton 的同一取舍）。
 */
export default function ProjectCard({ project, reduced }: ProjectCardProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  /** hover 与键盘焦点共用同一套"点亮"视觉：键盘用户必须看到和鼠标一样的状态 */
  const lit = hovered || focused;

  return (
    <Link
      href={project.href ?? `/projects/${project.slug}`}
      data-pw-card=""
      aria-label={`查看项目：${project.name}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="scanlines"
      style={{
        position: 'relative',
        display: 'block',
        width: 'var(--card-w)',
        aspectRatio: '16 / 10',
        borderRadius: 'var(--radius-panel)',
        border: `1px solid ${lit ? 'rgb(var(--c-signal))' : 'rgb(var(--c-line-2))'}`,
        backgroundColor: '#000',
        overflow: 'hidden',
        transform: lit ? 'scale(1.015)' : 'scale(1)',
        transformOrigin: 'center center',
        // 0.6s + --ease-out-quint：和全站其它 hover 位移同一条曲线
        transition: reduced
          ? 'none'
          : 'transform .6s var(--ease-out-quint), border-color .6s var(--ease-out-quint), box-shadow .6s var(--ease-out-quint)',
        boxShadow: lit ? '0 20px 60px rgba(0, 0, 0, 0.55)' : 'none',
        zIndex: lit ? 2 : 1,
      }}
    >
      <ProjectArt seed={project.slug} palette={project.palette} />

      {/* 左上 order / 右上 type */}
      <span className="hud-sm" style={{ position: 'absolute', left: 12, top: 10, color: 'rgb(var(--c-fg))' }}>
        {project.order}
      </span>
      <span className="hud-sm" style={{ position: 'absolute', right: 12, top: 10, color: 'rgb(var(--c-fg))' }}>
        {project.type}
      </span>

      {/* hover/focus 时淡入的归档角标 */}
      <span
        aria-hidden
        className="hud-sm"
        style={{
          position: 'absolute',
          left: 12,
          top: 28,
          color: 'rgb(var(--c-signal))',
          opacity: lit ? 1 : 0,
          transition: reduced ? 'none' : 'opacity .35s var(--ease-out-quint)',
        }}
      >
        [ ARCHIVE_REF: {project.type} · {project.year} ]
      </span>

      {/* 底部 name + year */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '2.5rem .95rem .85rem',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '1rem',
          background: 'linear-gradient(to top, rgba(0, 0, 0, 0.86), rgba(0, 0, 0, 0))',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.1rem, 2vw, 1.6rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            color: 'rgb(var(--c-fg))',
          }}
        >
          {project.name}
        </span>
        <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))', whiteSpace: 'nowrap' }}>
          {project.year}
        </span>
      </div>

      {/*
        扫描线：复用 globals.css 里已有的 sync-scan（background-position -120% → 220%），
        配 38% 宽的亮带正好横穿整张卡；reduced motion 时完全不播，改成一条静态亮带。
      */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(90deg, rgba(242,219,76,0) 0%, rgba(242,219,76,0.9) 50%, rgba(242,219,76,0) 100%)',
          backgroundSize: '38% 100%',
          backgroundRepeat: 'no-repeat',
          mixBlendMode: 'screen',
          opacity: lit ? (reduced ? 0.22 : 0.9) : 0,
          animation: reduced ? 'none' : 'sync-scan 1.6s linear infinite',
          animationPlayState: lit && !reduced ? 'running' : 'paused',
          backgroundPosition: reduced ? '30% 0' : undefined,
          transition: reduced ? 'none' : 'opacity .3s linear',
        }}
      />
    </Link>
  );
}
