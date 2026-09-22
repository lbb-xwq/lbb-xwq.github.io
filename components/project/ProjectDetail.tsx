'use client';

import { useRef } from 'react';
import Link from 'next/link';

import NoiseGridBackground from '@/components/canvas/NoiseGridBackground';
import Reveal from '@/components/ui/Reveal';
import type { Project } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

import MarqueeRow from './MarqueeRow';
import NextProjectLink from './NextProjectLink';
import ScrollProgress from './ScrollProgress';
import ScrollTitle from './ScrollTitle';
import ShowcaseGrid from './ShowcaseGrid';
import { useFixedPin } from './useFixedPin';

/** 句末标点：中英文都算 */
const SENTENCE_END = '。！？!?';

/** 按句末标点切句（手写循环而不是 lookbehind 正则：不依赖运行时对 lookbehind 的支持） */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buffer = '';
  for (const ch of text) {
    buffer += ch;
    if (SENTENCE_END.includes(ch)) {
      out.push(buffer);
      buffer = '';
    }
  }
  if (buffer) out.push(buffer);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * 把 overview 拆成 2–3 段 case study 文本。
 *
 * 规则：overview 有 2 句以上就逐句成段（最多 3 段）；
 * 只有一句时（content.ts 里多数项目就是这样）用 description 打头 —— 两段都来自 content.ts，
 * 不新增任何文案。
 */
function caseStudyParagraphs(project: Project): string[] {
  const sentences = splitSentences(project.overview);
  if (sentences.length >= 2) return sentences.slice(0, 3);
  return [project.description, project.overview];
}

export type ProjectDetailProps = {
  project: Project;
  /** 下一个项目（最后一项由页面回卷到第一项） */
  next: Project;
};

/**
 * 项目详情长页。
 *
 * 结构：Hero（左：返回/序号/大标题/描述/技术栈，右：dossier 键值块）
 * → ShowcaseGrid（点开对话框）
 * → MarqueeRow（程序化小格跑马灯，两条）
 * → case study 段落（逐段 Reveal）
 * → NextProjectLink（下一个项目）
 * 顶部右上角固定的 ScrollTitle 与左下角固定的 ScrollProgress 是两层常驻浮层。
 */
export default function ProjectDetail({ project, next }: ProjectDetailProps) {
  const heroRef = useRef<HTMLElement | null>(null);
  const motion = useStore(sel.motion);
  const reduced = motion === 'reduced';
  const paragraphs = caseStudyParagraphs(project);
  const bgRef = useRef<HTMLDivElement | null>(null);

  // 背景层与两个浮层都要钉在视口上（ScrollSmoother 的祖先 transform 会把 fixed 拖走）
  useFixedPin(bgRef);

  return (
    <div style={{ position: 'relative', zIndex: 'var(--z-content)', paddingBottom: '10rem' }}>
      {/*
        噪声网格背景：外面这层是"可被钉住的容器"。
        它自己带 transform（translateZ(0) → 建立包含块），于是内部的 fixed 背景填满的是它，
        每帧再补一个反向位移，整层就稳稳贴在视口上，而 canvas 始终只有一屏那么大。
      */}
      <div
        ref={bgRef}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-canvas)',
          pointerEvents: 'none',
          transform: 'translateZ(0)',
        }}
      >
        <NoiseGridBackground />
      </div>
      <ScrollTitle name={project.name} triggerRef={heroRef} />
      <ScrollProgress />

      <section
        ref={heroRef}
        className="grid gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)] lg:items-start"
        style={{
          position: 'relative',
          minHeight: '80vh',
          padding: '10rem 1.25rem 5rem',
        }}
      >
        <div>
          <Reveal>
            <Link href="/projects" className="hud" style={{ color: 'rgb(var(--c-dim))' }}>
              ← ALL PROJECTS
            </Link>
          </Reveal>

          <Reveal delay={0.05}>
            <p className="hud-sm" style={{ margin: '2.5rem 0 0', color: 'rgb(var(--c-dim))' }}>
              {project.order} / {project.type}
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <h1
              style={{
                margin: '1rem 0 1.5rem',
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(2.5rem, 7vw, 6rem)',
                lineHeight: 0.92,
                letterSpacing: '-0.02em',
                color: 'rgb(var(--c-fg))',
              }}
            >
              {project.name}
            </h1>
          </Reveal>

          <Reveal delay={0.15}>
            <p
              style={{
                margin: 0,
                maxWidth: '60ch',
                lineHeight: 1.75,
                color: 'rgb(var(--c-dim))',
              }}
            >
              {project.description}
            </p>
          </Reveal>

          <Reveal delay={0.2}>
            <ul
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                margin: '2rem 0 0',
                padding: 0,
                listStyle: 'none',
              }}
            >
              {project.stack.map((tech) => (
                <li
                  key={tech}
                  className="hud-sm"
                  style={{
                    padding: '0.45rem 0.7rem',
                    border: '1px solid rgb(var(--c-line-2))',
                    borderRadius: 'var(--radius-panel)',
                    color: 'rgb(var(--c-fg))',
                  }}
                >
                  {tech}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* dossier：ROLE / YEAR / TYPE / STACK，行与行之间 1px 分隔 */}
        <div style={{ maxWidth: 460, width: '100%' }}>
          <Reveal delay={0.08}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid rgb(var(--c-line-2))',
              }}
            >
              <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
                ROLE
              </span>
              <span style={{ textAlign: 'right' }}>{project.role}</span>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.75rem 0',
                borderBottom: '1px solid rgb(var(--c-line-2))',
              }}
            >
              <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
                YEAR
              </span>
              <span style={{ textAlign: 'right' }}>{project.year}</span>
            </div>
          </Reveal>
          <Reveal delay={0.16}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.75rem 0',
                borderBottom: '1px solid rgb(var(--c-line-2))',
              }}
            >
              <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
                TYPE
              </span>
              <span style={{ textAlign: 'right' }}>{project.type}</span>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.75rem 0',
                borderBottom: '1px solid rgb(var(--c-line-2))',
              }}
            >
              <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
                STACK
              </span>
              <span style={{ textAlign: 'right' }}>{project.stack.join(' / ')}</span>
            </div>
          </Reveal>
        </div>
      </section>

      <ShowcaseGrid project={project} />

      {/* 第一条跑马灯：左向 */}
      <MarqueeRow project={project} variant="a" direction="left" count={5} />

      {/* case study：overview 拆成 2–3 段，逐段 Reveal */}
      <section style={{ padding: '4rem 1.25rem 2rem' }}>
        <div style={{ maxWidth: '82rem', margin: '0 auto' }}>
          <div
            className="hud"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
              marginBottom: '2rem',
              color: 'rgb(var(--c-dim))',
            }}
          >
            <span>[ CASE_STUDY ]</span>
            <span>
              {project.order} · {project.year}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {paragraphs.map((text, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <p
                  style={{
                    margin: 0,
                    maxWidth: '60ch',
                    lineHeight: 1.75,
                    color: i === 0 ? 'rgb(var(--c-fg))' : 'rgb(var(--c-dim))',
                  }}
                >
                  {text}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 第二条跑马灯：右向，种子与第一条不同 */}
      <MarqueeRow project={project} variant="b" direction="right" count={3} />

      <NextProjectLink next={next} reduced={reduced} />
    </div>
  );
}