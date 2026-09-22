'use client';

import { useState } from 'react';

import Reveal from '@/components/ui/Reveal';
import { about } from '@/lib/data/content';

type Sector = (typeof about.sectors)[number];

const HOVER_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * 单个 sector 块：左侧编号 + 英文名 + 中文名，右侧正文 + 等宽标签。
 *
 * hover 高亮用 state 而不是 CSS 类：背景色写在 inline style 上（要和 GSAP 的入场
 * 动效共存），类选择器的优先级压不过 inline style，只有让 state 参与计算才真的会变。
 */
function SectorBlock({ sector }: { sector: Sector }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10"
      style={{
        padding: '1.9rem 0.75rem',
        borderBottom: '1px solid rgb(var(--c-line))',
        backgroundColor: hovered ? 'rgb(var(--c-panel))' : 'transparent',
        transition: `background-color 420ms ${HOVER_EASE}`,
      }}
    >
      <div>
        <p
          className="hud"
          style={{
            margin: 0,
            color: hovered ? 'rgb(var(--c-signal))' : 'rgb(var(--c-dim))',
            transition: `color 420ms ${HOVER_EASE}`,
          }}
        >
          {sector.id} / {sector.name.toUpperCase()}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.25rem, 2.4vw, 1.75rem)',
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
            margin: '0.55rem 0 0',
          }}
        >
          {sector.zh}
        </p>
      </div>

      <div>
        <p style={{ margin: 0, lineHeight: 1.7, color: 'rgb(var(--c-fg))' }}>{sector.body}</p>
        <ul
          className="hud-sm"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem',
            margin: '1rem 0 0',
            padding: 0,
            listStyle: 'none',
          }}
        >
          {sector.tags.map((tag, tagIndex) => (
            <li
              key={tag}
              style={{ border: '1px solid rgb(var(--c-line-2))', padding: '0.3rem 0.55rem' }}
            >
              {/* 与参考站一致：标签前面挂一个十六进制序号 */}
              <span style={{ color: 'rgb(var(--c-dim))' }}>
                {`0x${tagIndex.toString(16).padStart(2, '0')}`}
              </span>{' '}
              <span>{tag}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 6 个 sector：顶部一条 1px 分隔线，块与块之间也用 1px 分隔线连成一张表 */
export default function SectorList() {
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        borderTop: '1px solid rgb(var(--c-line))',
      }}
    >
      {about.sectors.map((sector, index) => (
        <li key={sector.id}>
          <Reveal y={40} delay={index * 0.05}>
            <SectorBlock sector={sector} />
          </Reveal>
        </li>
      ))}
    </ul>
  );
}