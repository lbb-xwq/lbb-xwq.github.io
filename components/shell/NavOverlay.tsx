'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import gsap from 'gsap';

import { playUiSound } from '@/lib/audio';
import { nav, person } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

/**
 * 导航菜单面板。
 * 参考站实测：菜单是**从右下胶囊位置向上展开**的面板
 *   nav-menu-root = [1064,216,320,557]（与胶囊同 x/宽，底边同为 773）
 * 结构：
 *   nav-menu-header  1064 内左 25px：h3 「Menu」20px + 副标题 10px + 右侧 36×36 徽章
 *   nav-menu-social-grid 2 列 × 2 行，每个 130×38（bg 白 3%、边框 rgba(85,85,85,.1)、4px 圆点 + 12px 文本）
 *   编号导航项（[1]…[4]）
 * 文案全部中文。
 */

/** 面板位置（来自参考站实测）：右 40 / 下 32 / 宽 320 / 高 557 */
const PANEL = { right: 40, bottom: 32, width: 320, height: 557 };

/** 收起后面板只剩头部这一条的高度 */
const COLLAPSED = 58;
/** 头部下方内容区的最终高度（参考站实测） */
const LIST_HEIGHT = 499;

/**
 * 入场/退场动效参数（秒）。只为“从右下胶囊位置长出来”服务：
 *   y    +26 → 0   面板从胶囊下方浮上来
 *   scale .96 → 1  以 bottom right 为原点向外长开
 *   opacity 0 → 1  与高度擦除同时进行，避免“啪”一下实心弹出
 * 行错开：header → 社交 4 格 → 编号 4 项，共 9 行，每行 35ms，最后一行约 820ms 落定。
 *
 * 缓动选用 power3.out 而不是 expo.out：expo.out 在 42% 时间点已经跑完 94.5% 的位移，
 * 看起来就是"瞬间弹出 + 一点回弹"，感知上等于没有动效（实测高度 56→441 仅用了 90ms）。
 * power3.out 前 100ms 约走 49%，配合 0.5~0.7s 的时长才能真的看见"展开"。
 */
const OPEN = {
  height: { duration: 0.5, ease: 'power3.out' },
  fade: { duration: 0.3, ease: 'power2.out' },
  shift: { duration: 0.7, ease: 'power3.out' },
  list: { duration: 0.55, ease: 'power2.out', delay: 0.08 },
  rows: { duration: 0.4, ease: 'power2.out', delay: 0.14, stagger: 0.035 },
} as const;

const CLOSE = {
  rows: { duration: 0.2, ease: 'power2.in', stagger: 0.025 },
  list: { duration: 0.34, ease: 'power2.in', delay: 0.04 },
  // 用 power2.in 而不是 power3.in：后者在 20% 时间点只走 0.8%，前 300ms 会是一段“点完没反应”的死区
  panel: { duration: 0.42, ease: 'power2.in', delay: 0.14 },
} as const;

export default function NavOverlay() {
  const open = useStore(sel.menuOpen);
  const setMenu = useStore((s) => s.setMenu);
  const motion = useStore(sel.motion);
  const panelRef = useRef<HTMLDivElement>(null);
  // 关闭时先播收起动画再隐藏：display 交给本地 mounted，否则 React 会在 open=false 时立刻 display:none
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // 打开时记下触发元素，关闭后把焦点还回去
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      playUiSound('slide');
      const first = panelRef.current?.querySelector<HTMLElement>('a,button');
      first?.focus();
    } else if (triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
    }
  }, [open]);

  // 入场/退场动效：面板展开 + 浮入 + 淡入，内部行错开；收起时严格反向
  useEffect(() => {
    const el = panelRef.current;
    const list = listRef.current;
    if (!el || !list) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-nav-in]'));

    /**
     * 减少动效时直接落到终态，不播任何补间。
     * 这里**不能**用 clearProps: 'all' —— 它会连同 JSX 首帧写入的 height 一起清掉，
     * 而 React 不会重写“值没变”的 style，面板就会扁成 auto 高度（实测 304px，而非 557px）。
     * 所以改为显式断言终态。
     */
    const settle = () => {
      gsap.set(el, { clearProps: 'transform,opacity', height: PANEL.height });
      gsap.set(list, { clearProps: 'height' });
      gsap.set(rows, { clearProps: 'transform,opacity' });
    };

    if (!open) {
      // 减少动效：不播任何补间，但要把补间留下的 inline 属性归位，否则下次打开会读到中间值
      if (motion === 'reduced') {
        settle();
        setMounted(false);
        return;
      }
      // 收起：行先散 → 内容收拢 → 面板缩回胶囊位置（顺序与打开相反）
      const tl = gsap.timeline({ onComplete: () => setMounted(false) });
      tl.to(rows, { opacity: 0, y: 8, duration: CLOSE.rows.duration, ease: CLOSE.rows.ease, stagger: { each: CLOSE.rows.stagger, from: 'end' } }, 0);
      tl.to(list, { height: 0, duration: CLOSE.list.duration, ease: CLOSE.list.ease }, CLOSE.list.delay);
      tl.to(
        el,
        { height: COLLAPSED, opacity: 0, y: 20, scale: 0.97, duration: CLOSE.panel.duration, ease: CLOSE.panel.ease },
        CLOSE.panel.delay,
      );
      return () => tl.kill();
    }

    // display 必须先于 GSAP 生效，否则首帧量不到尺寸
    el.style.display = 'flex';
    setMounted(true);

    if (motion === 'reduced') {
      settle();
      return;
    }

    // 起始态显式写死：关闭动画播到一半又打开时，也能从确定的起点开始
    gsap.set(el, { height: COLLAPSED, opacity: 0, y: 26, scale: 0.96 });
    gsap.set(list, { height: 0 });
    gsap.set(rows, { opacity: 0, y: 12 });

    const tl = gsap.timeline();
    tl.to(el, { height: PANEL.height, duration: OPEN.height.duration, ease: OPEN.height.ease }, 0);
    tl.to(el, { opacity: 1, duration: OPEN.fade.duration, ease: OPEN.fade.ease }, 0);
    tl.to(el, { y: 0, scale: 1, duration: OPEN.shift.duration, ease: OPEN.shift.ease }, 0);
    tl.to(list, { height: LIST_HEIGHT, duration: OPEN.list.duration, ease: OPEN.list.ease }, OPEN.list.delay);
    tl.to(rows, { opacity: 1, y: 0, duration: OPEN.rows.duration, ease: OPEN.rows.ease, stagger: OPEN.rows.stagger }, OPEN.rows.delay);

    return () => {
      tl.kill();
    };
  }, [open, motion]);

  // Esc 关闭 + Tab 在面板内循环
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(false);
        playUiSound('click');
        return;
      }
      if (event.key !== 'Tab') return;
      const el = panelRef.current;
      if (!el) return;
      const focusables = Array.from(el.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setMenu]);

  const close = () => setMenu(false);

  return (
    <div
      ref={panelRef}
      id="nav-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="导航菜单"
      style={{
        position: 'fixed',
        right: PANEL.right,
        bottom: PANEL.bottom,
        width: PANEL.width,
        maxHeight: `calc(100vh - ${PANEL.bottom + 20}px)`,
        height: PANEL.height,
        zIndex: 'var(--z-overlay)',
        display: mounted ? 'flex' : 'none',
        flexDirection: 'column',
        overflowY: 'auto',
        background: 'rgba(18,18,18,0.86)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(85,85,85,0.3)',
        borderRadius: 12,
        transformOrigin: 'bottom right',
      }}
    >
      {/* 头部：标题 + 副标题 + 徽章（参考站 nav-menu-header） */}
      <div
        data-nav-in
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '24px 25px 22px',
          borderBottom: '1px solid rgba(85,85,85,0.1)',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.5px' }}>
            菜单
          </h3>
          <p
            style={{
              margin: '5px 0 0',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              lineHeight: '15px',
              letterSpacing: '1px',
              color: 'rgb(var(--c-fg) / 0.4)',
            }}
          >
            导航
          </p>
        </div>
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(85,85,85,0.1)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '1px',
            color: 'rgb(var(--c-fg) / 0.4)',
          }}
        >
          目录
        </span>
      </div>

      <div ref={listRef} style={{ padding: '20px 25px 25px' }}>
        {/* 社交链接 2×2（参考站 nav-menu-social-grid：每格 130×38） */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {person.socials.map((social) => (
            <a
              key={social.label}
              href={social.href}
              data-nav-in
              className="nav-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                height: 38,
                paddingInline: 11,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(85,85,85,0.1)',
                borderRadius: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: '0.6px',
                color: 'rgb(var(--c-fg))',
              }}
            >
              <span aria-hidden style={{ width: 4, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.2)' }} />
              {social.label}
            </a>
          ))}
        </div>

        {/* 编号导航：首页 [1] … 联系 [4] */}
        <ul style={{ listStyle: 'none', margin: '22px 0 0', padding: 0 }}>
          {nav.map((item, index) => (
            <li key={item.id} data-nav-in>
              <Link
                href={item.href}
                onClick={close}
                className="nav-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 0',
                  borderTop: '1px solid rgba(85,85,85,0.1)',
                  fontFamily: 'var(--font-display)',
                  fontSize: 20,
                  letterSpacing: '-0.4px',
                  color: 'rgb(var(--c-fg))',
                }}
              >
                {item.label}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '1px',
                    color: 'rgb(var(--c-fg) / 0.4)',
                  }}
                >
                  [{index + 1}]
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}