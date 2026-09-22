'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

import Marquee from '@/components/ui/Marquee';
import ScrambleText from '@/components/ui/ScrambleText';
import { hero, person } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

/** 跑马灯速度（px/s，Marquee 内部按内容宽度折算时长） */
const MARQUEE_SPEED = 70;
/** 两条 HUD 进度条的目标宽度（参考站实测：内层 177 / 169，条本身 192） */
const BAR_PERCENT = [92.2, 88];

/** 把内容里的值（形如 ' 10+'）拆成 前缀 / 数字 / 后缀，用于数字滚动 */
function parseValue(raw: string) {
  const m = /^(\s*)(\d+)(.*)$/.exec(raw);
  if (!m) return { prefix: '', num: 0, suffix: raw };
  return { prefix: m[1], num: Number(m[2]), suffix: m[3] };
}

/**
 * 右上跑马灯：参考站实测是**单行**（heroMarqueeWrap = [712,32,712,43]），
 * 所有「标签 / 值」对在一条带子里循环，条目之间用 1px 竖线分隔、行上下各 1px 边框。
 * 文案全部中文。
 */
function MarqueeStack() {
  const reduced = useStore(sel.motion) === 'reduced';
  const line = hero.marquee.map((m) => `${m.tech} / ${m.label}`).join('   │   ');

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        right: 0,
        top: 32,
        width: '50%',
        minHeight: 43,
        display: 'flex',
        alignItems: 'center',
        paddingInline: '2.5rem',
        zIndex: 50,
        pointerEvents: 'none',
        borderTop: '1px solid rgb(var(--c-line))',
        borderBottom: '1px solid rgb(var(--c-line))',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, pointerEvents: 'auto' }}>
        <Marquee speed={MARQUEE_SPEED} pauseOnHover>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.75rem',
              paddingRight: '2.5rem',
              whiteSpace: 'nowrap',
            }}
          >
            <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
              实时
            </span>
            <span
              style={{
                fontSize: '1.125rem',
                letterSpacing: '0.14em',
                color: 'rgb(var(--c-fg) / 0.9)',
              }}
            >
              {line}
            </span>
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                flex: '0 0 auto',
                borderRadius: 9999,
                background: 'rgb(var(--c-live))',
                animation: reduced ? 'none' : 'live-pulse 2s cubic-bezier(.4,0,.6,1) infinite',
              }}
            />
            <span
              aria-hidden
              style={{ width: 1, height: '1.25rem', flex: '0 0 auto', background: 'rgb(var(--c-fg) / 0.1)' }}
            />
          </span>
        </Marquee>
      </div>
    </div>
  );
}

/**
 * 右侧数据块：参考站实测 [972,299,192,207]（x 约为视口 68.26%、宽 192）。
 * 标题 10px / 状态 11px + 6px 白点 / 指标 label 9px + 192x4 进度条 / 终端 8px 四行。
 * 最后一行是真实读数（性能档 / FPS / DPR），不是假数据。
 */
function HudStats() {
  const reduced = useStore(sel.motion) === 'reduced';
  const entered = useStore(sel.entered);
  const tier = useStore(sel.tier);
  const fps = useStore((s) => s.fps);
  const dpr = useStore((s) => s.dpr);

  const numRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const barRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (!entered) return;
    const nums = hero.stats.map((s, i) => {
      const { prefix, num, suffix } = parseValue(s.value);
      const el = numRefs.current[i];
      if (!el) return null;
      const obj = { v: 0 };
      return gsap.to(obj, {
        v: num,
        duration: reduced ? 0 : 1.2,
        delay: reduced ? 0 : 0.8 + i * 0.12,
        ease: 'expo.out',
        onUpdate: () => {
          el.textContent = `${prefix}${Math.round(obj.v)}${suffix}`;
        },
      });
    });
    const bars = barRefs.current.map((el, i) =>
      el
        ? gsap.fromTo(
            el,
            { width: '0%' },
            { width: `${BAR_PERCENT[i]}%`, duration: reduced ? 0 : 1.2, delay: reduced ? 0 : 0.8, ease: 'expo.out' }
          )
        : null
    );
    return () => {
      nums.forEach((t) => t?.kill());
      bars.forEach((t) => t?.kill());
    };
  }, [entered, reduced]);

  const terminalLines = hero.terminalLines.map((line, i) =>
    i === hero.terminalLines.length - 1
      ? `> 系统性能: [${tier.toUpperCase()}] ${fps || '--'} FPS @ ${dpr.toFixed(1)} DPR`
      : line
  );
  const status = fps >= 50 ? '流畅运行' : fps > 0 ? '自适应降级' : '初始化中';

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: '68.26%',
        top: '50%',
        width: 192,
        height: 207, // 参考站实测块高 207：配合 translateY(-50%) 后顶端正好落在 y=299
        transform: 'translateY(-50%)',
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          display: 'block',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          lineHeight: '15px',
          letterSpacing: '1px',
          color: 'rgb(var(--c-fg) / 0.2)',
        }}
      >
        开发者数据
      </span>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 4,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: '16.5px',
          color: 'rgb(var(--c-fg) / 0.8)',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 9999,
            background: 'rgb(var(--c-fg))',
            animation: reduced ? 'none' : 'live-pulse 2s cubic-bezier(.4,0,.6,1) infinite',
          }}
        />
        <span>{status}</span>
      </div>

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 15 }}>
        {hero.stats.map((s, i) => (
          <div key={s.label}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  lineHeight: '15px',
                  letterSpacing: '0.9px',
                  color: 'rgb(var(--c-fg) / 0.4)',
                }}
              >
                {s.label}
              </span>
              <span
                ref={(el) => {
                  numRefs.current[i] = el;
                }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  lineHeight: '15px',
                  letterSpacing: '0.9px',
                  color: 'rgb(var(--c-fg) / 0.4)',
                }}
              >
                {s.value}
              </span>
            </div>
            <div
              style={{
                marginTop: 5,
                height: 4,
                width: '100%',
                background: 'rgb(var(--c-fg) / 0.1)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                ref={(el) => {
                  barRefs.current[i] = el;
                }}
                style={{ height: '100%', width: '0%', background: 'rgb(var(--c-fg) / 0.4)' }}
              />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 33,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 9,
          lineHeight: '11px',
          color: 'rgb(var(--c-fg) / 0.3)',
        }}
      >
        {terminalLines.map((line) => (
          <span key={line} style={{ display: 'block' }}>
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 底部两列：参考站实测 [40,725,712,48]（左 40px、底 32px、宽 50%、两行各 24px）。
 * 左列「想聊聊？」+ 邮箱（hover 乱码），右列「本地时间」+ 时区与实时时钟。
 */
function BottomCols() {
  const [now, setNow] = useState('');

  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('zh-CN', {
      timeZone: person.timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const tick = () => setNow(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const col: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: '24px',
  };
  const value: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 13.5,
    letterSpacing: '0.04em',
    color: 'rgb(var(--c-fg) / 0.9)',
  };

  return (
    <footer
      style={{
        position: 'absolute',
        left: 40,
        bottom: 32,
        width: '50%',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 32,
        zIndex: 50,
        height: 48,
      }}
    >
      <div style={col}>
        <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
          {hero.helloLabel}
        </span>
        <a href={`mailto:${person.email}`} style={{ ...value, pointerEvents: 'auto' }}>
          <ScrambleText text={person.email} trigger="hover" charset="010101" />
        </a>
      </div>
      <div style={col}>
        <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
          {hero.localTimeLabel}
        </span>
        <span style={value}>
          {person.timezoneLabel} {now}
        </span>
      </div>
    </footer>
  );
}

export default function HeroHud() {
  return (
    <>
      <MarqueeStack />
      <HudStats />
      <BottomCols />
    </>
  );
}