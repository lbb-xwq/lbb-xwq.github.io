'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';

import ScrambleText from '@/components/ui/ScrambleText';
import { contact, meta, person } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

/** SSR 阶段不能调 useLayoutEffect（React 会告警），客户端需要"早于绘制"的时序来避免入场闪烁 */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** 入场位移与时长 */
const ENTER_Y = '5rem';
const ENTER_DURATION = 1;

/** tel: 链接不接受空格 */
const TEL_HREF = `tel:${person.phone.replace(/\s+/g, '')}`;

const CAPSULE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid rgb(var(--c-line-2))',
  borderRadius: 9999,
  padding: '0.55rem 1.1rem',
  color: 'rgb(var(--c-dim))',
};

/**
 * 联系页：单屏居中。
 *
 * 入场整体从 translateY(5rem) / opacity 0 落到 0 / 1，用 layout effect 把初始态
 * 落在绘制之前，避免先闪一帧终态；触发时机是 Preloader 放行（store.entered），
 * 直接进入本页时它会等用户点过 "CLICK TO ENTER" 再播。
 * 减少动效：不播入场，内容直接显示。
 */
export default function ContactPage() {
  const entered = useStore(sel.entered);
  const reduced = useStore(sel.motion) === 'reduced';
  const stageRef = useRef<HTMLDivElement | null>(null);
  /** 悬停中的社交链接：等宽胶囊 hover 时染色，用 state 而不是 CSS 类 */
  const [hovered, setHovered] = useState<string | null>(null);

  useIsoLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    if (reduced) {
      gsap.set(el, { clearProps: 'opacity,transform' });
      return;
    }

    // 还没放行：先藏起来等 store.entered 变 true（本 effect 会在那时重跑）
    if (!entered) {
      gsap.set(el, { opacity: 0, y: ENTER_Y });
      return;
    }

    const tween = gsap.fromTo(
      el,
      { opacity: 0, y: ENTER_Y },
      { opacity: 1, y: 0, duration: ENTER_DURATION, ease: 'expo.out' },
    );
    return () => {
      tween.kill();
    };
  }, [entered, reduced]);

  return (
    <main
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        minHeight: '100svh',
        padding: '6rem 1.5rem 6rem',
        textAlign: 'center',
      }}
    >
      <div
        ref={stageRef}
        style={{
          width: '100%',
          maxWidth: '44rem',
          display: 'grid',
          justifyItems: 'center',
          gap: '1.5rem',
        }}
      >
        <p className="hud" style={{ ...CAPSULE, margin: 0 }}>
          {contact.capsule}
        </p>

        <a
          href={`mailto:${person.email}`}
          data-cursor-hover
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.5rem, 4vw, 3rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            wordBreak: 'break-word',
          }}
        >
          <ScrambleText text={person.email} trigger="hover" charset="010101" />
        </a>

        <a href={TEL_HREF} className="hud" data-cursor-hover style={{ color: 'rgb(var(--c-dim))' }}>
          {person.phone}
        </a>

        <p style={{ margin: 0, color: 'rgb(var(--c-dim))', lineHeight: 1.7 }}>
          {contact.replyNote}
        </p>

        <ul
          className="hud"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '0.5rem',
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
          {person.socials.map((social) => (
            <li key={social.label}>
              <a
                href={social.href}
                data-cursor-hover
                onPointerEnter={() => setHovered(social.label)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(social.label)}
                onBlur={() => setHovered(null)}
                style={{
                  ...CAPSULE,
                  color: hovered === social.label ? 'rgb(var(--c-signal))' : 'rgb(var(--c-dim))',
                  transition: 'color 320ms var(--ease-out-expo)',
                }}
              >
                {social.label.toUpperCase()}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <p
        className="hud-sm"
        style={{
          position: 'absolute',
          bottom: '2rem',
          left: 0,
          right: 0,
          margin: 0,
          color: 'rgb(var(--c-dim))',
        }}
      >
        ◀ {meta.copyright} · {meta.siteName}
      </p>
    </main>
  );
}