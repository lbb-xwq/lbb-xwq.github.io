'use client';

import { useEffect, useRef, useState } from 'react';

import ProjectArt from '@/components/projects/ProjectArt';
import { sel, useStore } from '@/lib/store';
import type { Project } from '@/lib/data/content';

/**
 * 原生 <dialog> 的样式重置 + 背板。::backdrop 没法用 inline style，
 * 所以照 SmoothScroll 的做法注入一个小 style 块（globals.css 是冻结文件）。
 */
const DIALOG_CSS = `
[data-pj-dialog] {
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--c-fg));
  max-width: none;
  max-height: none;
}
[data-pj-dialog]::backdrop {
  background: rgba(0, 0, 0, 0.84);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
`;

/** 归档编号：ARCHIVE_REF: 1440×810 · 主视图 → 只留编号部分做画面种子 */
function seedOf(slug: string, index: number, ref: string): string {
  return `${slug}-s${index}-${ref}`;
}

type ShowcaseCellProps = {
  project: Project;
  index: number;
  cellRef: string;
  caption: string;
  reduced: boolean;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onOpen: (index: number) => void;
  isOpen: boolean;
};

/** 单格：hover/focus 时画面 zoom + 扫描线扫过 + ARCHIVE_REF 淡入 */
function ShowcaseCell({
  project,
  index,
  cellRef,
  caption,
  reduced,
  buttonRef,
  onOpen,
  isOpen,
}: ShowcaseCellProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const lit = hovered || focused;

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <button
        ref={buttonRef}
        type="button"
        className="scanlines"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`放大查看：${caption}`}
        onClick={() => onOpen(index)}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: 'relative',
          display: 'block',
          width: '100%',
          aspectRatio: '16 / 9',
          padding: 0,
          overflow: 'hidden',
          backgroundColor: '#000',
          border: `1px solid ${lit ? 'rgb(var(--c-signal))' : 'rgb(var(--c-line-2))'}`,
          borderRadius: 'var(--radius-panel)',
          transition: reduced ? 'none' : 'border-color .5s var(--ease-out-quint)',
        }}
      >
        {/* 画面 zoom：只动内层容器，边框保持不动 */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            transform: lit ? 'scale(1.04)' : 'scale(1)',
            transition: reduced ? 'none' : 'transform .9s var(--ease-out-quint)',
          }}
        >
          <ProjectArt seed={seedOf(project.slug, index, cellRef)} palette={project.palette} />
        </span>

        {/* 扫描线：同一套 sync-scan 关键帧，横向扫过整格 */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage:
              'linear-gradient(90deg, rgba(242,219,76,0) 0%, rgba(242,219,76,0.85) 50%, rgba(242,219,76,0) 100%)',
            backgroundSize: '34% 100%',
            backgroundRepeat: 'no-repeat',
            mixBlendMode: 'screen',
            opacity: lit ? (reduced ? 0.2 : 0.85) : 0,
            animation: reduced ? 'none' : 'sync-scan 1.8s linear infinite',
            animationPlayState: lit && !reduced ? 'running' : 'paused',
            backgroundPosition: reduced ? '33% 0' : undefined,
            transition: reduced ? 'none' : 'opacity .3s linear',
          }}
        />

        <span
          className="hud-sm"
          style={{
            position: 'absolute',
            left: 12,
            top: 10,
            color: 'rgb(var(--c-signal))',
            opacity: lit ? 1 : 0,
            transition: reduced ? 'none' : 'opacity .35s var(--ease-out-quint)',
          }}
        >
          {cellRef}
        </span>
      </button>

      <figcaption className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
        [{String(index + 1).padStart(2, '0')}] {caption}
      </figcaption>
    </figure>
  );
}

export type ShowcaseGridProps = {
  project: Project;
};

/**
 * 归档画面网格：2 列（窄屏自动落成 1 列），点击打开放大对话框。
 *
 * 对话框用原生 <dialog> + showModal()：焦点陷阱、Esc 关闭、top-layer 都是浏览器给的，
 * 我们只补三件事 —— aria-modal/aria-label、关闭后把焦点还给打开它的那一格、
 * 以及打开期间锁住页面滚动（否则背后的长页会被一起滚走）。
 */
export default function ShowcaseGrid({ project }: ShowcaseGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const triggersRef = useRef<Array<HTMLButtonElement | null>>([]);
  const motion = useStore(sel.motion);
  const reduced = motion === 'reduced';

  const cells = project.showcase;

  // 打开 / 关闭时同步原生 dialog 状态
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (openIndex === null) {
      if (dlg.open) dlg.close();
      return;
    }
    if (!dlg.open) dlg.showModal();
    // 焦点交给关闭按钮：键盘用户第一下 Tab/回车就有确定的行为
    closeRef.current?.focus();
  }, [openIndex]);

  // 打开期间锁页面滚动（reduced motion 下退回原生滚动，这层兜底同样有效）
  useEffect(() => {
    if (openIndex === null) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [openIndex]);

  const close = (index: number | null) => {
    setOpenIndex(null);
    const trigger = index === null ? null : triggersRef.current[index];
    // 显式归还焦点：某些浏览器在 dialog.close() 之后焦点会落到 body
    if (trigger) trigger.focus();
  };

  const active = openIndex === null ? null : cells[openIndex];

  return (
    <section style={{ position: 'relative', padding: '0 1.25rem' }}>
      <style dangerouslySetInnerHTML={{ __html: DIALOG_CSS }} />
      <div style={{ maxWidth: '82rem', margin: '0 auto' }}>
        <div
          className="hud"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '1.5rem',
            color: 'rgb(var(--c-dim))',
          }}
        >
          <span>[ SHOWCASE ]</span>
          <span>{String(cells.length).padStart(2, '0')} FRAMES</span>
        </div>

        <div
          style={{
            display: 'grid',
            // auto-fit + 420px 下限：桌面两列，窄屏自然落成一列，不写媒体查询
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))',
            gap: '1.5rem',
          }}
        >
          {cells.map((cell, i) => (
            <ShowcaseCell
              key={cell.ref}
              project={project}
              index={i}
              cellRef={cell.ref}
              caption={cell.caption}
              reduced={reduced}
              isOpen={openIndex === i}
              buttonRef={(el) => {
                triggersRef.current[i] = el;
              }}
              onOpen={setOpenIndex}
            />
          ))}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        data-pj-dialog=""
        aria-modal="true"
        aria-label={active ? `放大画面：${active.caption}` : '放大画面'}
        onClose={() => close(openIndex)}
        onClick={(e) => {
          // 点背板关闭：dialog 自身就是铺满内容的容器，命中它说明点的是背板
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        style={{
          margin: 'auto',
          width: 'min(92vw, 1100px)',
          maxWidth: 'none',
        }}
      >
        {active ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div
              className="scanlines"
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 9',
                overflow: 'hidden',
                backgroundColor: '#000',
                border: '1px solid rgb(var(--c-line-2))',
                borderRadius: 'var(--radius-panel)',
              }}
            >
              <ProjectArt
                seed={seedOf(project.slug, openIndex ?? 0, active.ref)}
                palette={project.palette}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: '1rem',
              }}
            >
              <div>
                <p className="hud-sm" style={{ margin: 0, color: 'rgb(var(--c-signal))' }}>
                  {active.ref}
                </p>
                <p style={{ margin: '0.35rem 0 0', color: 'rgb(var(--c-fg))' }}>{active.caption}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="hud panel-glass"
                onClick={() => dialogRef.current?.close()}
                style={{ padding: '0.55rem 0.9rem', color: 'rgb(var(--c-fg))' }}
              >
                关闭 / ESC
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}