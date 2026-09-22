'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

import ScrambleText from '@/components/ui/ScrambleText';
import { hero, person } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

/**
 * 入场时间线（秒，参考站实测节奏）：
 *   0.00  姓名行淡入上浮（0.6s expo.out）
 *   0.10  标题第一行 y 110% → 0（1.1s expo.out）
 *   0.22  标题第二行（比第一行晚 0.12，形成两层错开的压感）
 *   0.60  信息块起（stagger 0.07，含 info 横线 / infoTag / 两行文案 / 移动端统计）
 * 时间线整体 paused，等 store.entered 置 true 才 play —— 预加载器结束前画面停留在初始态。
 */
const TL = {
  title: 0.1,
  titleLine2: 0.12,
  titleDur: 1.1,
  info: 0.6,
  infoStagger: 0.07,
  infoDur: 0.7,
} as const;

/**
 * 中央内容层（参考站 `.hero_content` → `.hero_main`）。
 * 容器 max-width 56rem、padding-inline clamp(1.5rem,5vw,4rem)，垂直居中。
 * pointer-events:none：这一层横跨左侧照片区，若吃掉指针事件，照片就 hover 不到了。
 */
export default function HeroCenter() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const entered = useStore(sel.entered);
  const reduced = useStore(sel.motion) === 'reduced';

  // 1) 先用 gsap.set 预设隐藏态，再建一条停在 0 帧的时间线
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const names = root.querySelectorAll<HTMLElement>('[data-anim="name"]');
    const lines = root.querySelectorAll<HTMLElement>('[data-anim="title-line"]');
    const blocks = root.querySelectorAll<HTMLElement>('[data-anim="block"]');
    const all = [...names, ...lines, ...blocks];

    if (reduced) {
      // 减少动效：不进时间线，清掉可能残留的内联样式，内容直接可见
      gsap.set(all, { clearProps: 'opacity,transform' });
      return;
    }

    gsap.set(names, { opacity: 0, y: 12 });
    gsap.set(lines, { yPercent: 110 }); // 落到遮罩下方 = "从字下面顶上来"
    gsap.set(blocks, { opacity: 0, y: 16 });

    const tl = gsap.timeline({ paused: true });
    tl.to(names, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 0);
    // 每行标题共用同一套缓动，第 i 行比第一行晚 i×0.12s（行数变化也不用改这里）
    lines.forEach((line, i) => {
      tl.to(line, { yPercent: 0, duration: TL.titleDur, ease: 'expo.out' }, TL.title + i * TL.titleLine2);
    });
    tl.to(
      blocks,
      { opacity: 1, y: 0, duration: TL.infoDur, ease: 'expo.out', stagger: TL.infoStagger },
      TL.info,
    );
    tlRef.current = tl;

    return () => {
      tl.kill();
      tlRef.current = null;
      // 卸载 / 切动效档时清内联样式，避免元素被留在 opacity:0
      gsap.set(all, { clearProps: 'opacity,transform' });
    };
  }, [reduced]);

  // 2) entered 才播；退回未进入状态时归位到 0 帧
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (entered) tl.play(0);
    else tl.pause(0);
  }, [entered, reduced]);

  return (
    <div
      className="absolute inset-0 flex items-center"
      style={{ zIndex: 60, pointerEvents: 'none' }}
    >
      <div style={{ position: 'relative', minHeight: '251px', width: 'min(896px, calc(100vw - 2 * clamp(1.5rem, 5.6vw, 80px)))', marginLeft: 'clamp(1.5rem, 5.6vw, 80px)' }}>
        {/* 姓名行：[ 中文名 / 拉丁名 ] + 放大中文名 + 职位（--c-dim） */}
        <div
          data-anim="name"
          className="hud"
          style={{
            display: 'flex',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: '0.75rem',
            position: 'absolute',
            bottom: 'calc(100% + 0.5rem)',
            left: 0,
            color: 'rgb(var(--c-fg))',
          }}
        >
          <ScrambleText text={`[ ${person.name} ]`} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.45em',
              fontWeight: 400,
              letterSpacing: '0.04em',
            }}
          >
            {person.name}
          </span>
          <span style={{ color: 'rgb(var(--c-dim))' }}>{person.role}</span>
        </div>

        {/* 巨型两行标题：每行一层 overflow:hidden 遮罩，行内再叠一条扫光 */}
        <h1
          aria-label={hero.ariaLabel}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            // 首页字号上调：桌面 80px；窄屏用 vw 收窄，避免「前端开发」四个汉字横向溢出
            fontSize: 'clamp(72px, 5.4vw, 80px)',
            lineHeight: 'clamp(65px, 4.9vw, 72px)',
            letterSpacing: '0.7px',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.1)',
            margin: 0,
          }}
        >
          {hero.titleLines.map((line) => (
            <span key={line} style={{ display: 'block', overflow: 'hidden' }}>
              <span data-anim="title-line" style={{ display: 'block', position: 'relative' }}>
                {line}
                {/*
                  扫光层：同一份文字，颜色透明 + background-clip:text，只让一条亮带落在字形上。
                  实测：参考站的扫光是**竖向 75px 光带**，keyframes 把 background-position-y
                  从 calc(16px - 75px) 扫到 calc(100vh - 16px - 75px)，4s linear infinite。
                  所以这里用「100% 75px」的竖向渐变 + no-repeat，才能让光带真的扫过去。
                */}
                {!reduced && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage:
                        'linear-gradient(180deg, transparent 0%, rgb(var(--c-signal) / 0.95) 50%, transparent 100%)',
                      backgroundSize: '100% 75px',
                      backgroundRepeat: 'no-repeat',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                      animation: 'sync-scan 4s linear infinite',
                    }}
                  >
                    {line}
                  </span>
                )}
              </span>
            </span>
          ))}
        </h1>

        {/* infoTag（左边一条 3rem 横线）+ 两行 infoLines */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginTop: '1.5rem' }}>
          <div
            data-anim="block"
            aria-hidden
            style={{
              marginTop: '0.625rem',
              height: '1px',
              width: '3rem',
              flex: '0 0 auto',
              backgroundColor: 'rgb(var(--c-fg) / 0.2)',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <p
              data-anim="block"
              className="hud"
              style={{ margin: 0, color: 'rgb(var(--c-dim))', letterSpacing: '0.2em' }}
            >
              {hero.infoTag}
            </p>
            <p
              data-anim="block"
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: '12.5px',
                lineHeight: 1.625,
                letterSpacing: '0.05em',
                color: 'rgb(var(--c-fg) / 0.62)',
              }}
            >
              {hero.infoLines.map((line) => (
                <span key={line} style={{ display: 'block' }}>
                  {line}
                </span>
              ))}
            </p>
          </div>
        </div>

        {/*
          移动端补充指标：只在 ≤768px 显示。
          display 用 Tailwind 的 flex / md:hidden 两个类控制（响应式变体排在后，能盖住 flex），
          不要写进 inline style —— inline 的 display:flex 会反过来盖掉 md:hidden。
        */}
        <div
          data-anim="block"
          className="flex items-center md:hidden"
          style={{ gap: '0.9rem', width: 'fit-content', marginTop: '1.25rem' }}
        >
          {hero.mobileStats.map((stat, i) => (
            <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
              {i > 0 && (
                <span
                  aria-hidden
                  style={{ width: '1px', height: '1rem', backgroundColor: 'rgb(var(--c-line-2))' }}
                />
              )}
              <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1rem',
                    lineHeight: 1,
                    color: 'rgb(var(--c-fg) / 0.9)',
                  }}
                >
                  {stat.value}
                </span>
                <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
                  {stat.label}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
