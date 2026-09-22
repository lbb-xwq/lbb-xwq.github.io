'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ScrollSmoother from 'gsap/ScrollSmoother';

import { TRACKS, playUiSound, startAudio, stopAudio } from '@/lib/audio';
import { useStore, sel } from '@/lib/store';
import type { Tier } from '@/lib/store';

/**
 * 右侧系统设置面板。
 *
 * 视觉与 NavOverlay 共用同一套面板语言，两个浮层看起来才是同一个产品：
 *   面板    毛玻璃 24px + 白 3% 底 + rgba(85,85,85,0.3) 描边
 *   头部    20px display 标题 + 10px mono 副标题 + 36×36 徽章按钮（padding 24/25/22）
 *   分组    [ 编号 ] + 12px mono 标题，分组之间 1px rgba(85,85,85,0.1)（全宽贯通）
 *   控件    与菜单里社交按钮同规格的行：高 38 / 4px 圆角 / 白 3% 底 / rgba(85,85,85,0.1) 描边
 *
 * 为什么重做：
 *   1) 原来 [ 01 ] 核心主题 是一个占满整行、却只有 1 个选项的分段控件 ——
 *      看起来像"能点的大按钮"，实际点它什么都不变（参考站本来就是只读版本行）。
 *   2) 音轨选择是 8px 胶囊，比同组的其他控件（10px）还小，字号层级自相矛盾。
 *   3) 分组分隔线用了 --c-line(#1D1D1D)，压在 #0A0A0A 底上基本看不见，节奏全靠 padding 撑。
 *
 * 与 NavOverlay 同一套焦点规则：打开时焦点进入面板、Esc/遮罩/关闭按钮都能关、
 * 关闭时把焦点还给 SYS 按钮；关闭状态下用 visibility:hidden（而不是只靠透明度），
 * 这样内部元素不会被 Tab 到。
 */

const LABELS = {
  title: '系统',
  subtitle: 'GLOBAL CONFIG',
  core: '核心主题',
  audio: '音频引擎',
  tier: '性能档',
  close: '关闭设置面板',
} as const;

/** 底部说明：写清楚"设置存哪里、Saver 会付出什么代价" */
const NOTE =
  '所有设置保存在本地（localStorage），不上传、不需要登录。性能档选「省电」时，WebGL 场景会降级为静态网格、粒子数量减半、后处理关闭 —— 低端设备上这是"能跑"和"跑不动"的区别。';

const AUDIO_OPTIONS: Array<{ value: 'on' | 'off'; label: string }> = [
  { value: 'on', label: '开' },
  { value: 'off', label: '关' },
];

const TIER_OPTIONS: Array<{ value: Tier; label: string }> = [
  { value: 'high', label: '高性能' },
  { value: 'medium', label: '均衡' },
  { value: 'saver', label: '省电' },
];

const TRACK_OPTIONS = TRACKS.map((track) => ({ value: track.id, label: track.label }));

/** 档位 → 中文标签：直接从选项表反查，避免两处写死同一份文案 */
const TIER_LABEL = Object.fromEntries(TIER_OPTIONS.map((option) => [option.value, option.label])) as Record<Tier, string>;

/**
 * 行规格（对齐 NavOverlay 的社交按钮：130×38 / 白 3% / rgba(85,85,85,.1) / 4px）。
 * 只在 use site 补 padding 与排布，保证所有可选行看起来是同一类东西。
 */
const ROW: React.CSSProperties = {
  height: 38,
  borderRadius: 4,
  border: '1px solid rgba(85,85,85,0.1)',
  backgroundColor: 'rgba(255,255,255,0.03)',
};

const ROW_TEXT: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  letterSpacing: '0.6px',
};

const HAIRLINE = '1px solid rgba(85,85,85,0.1)';

type SectionProps = {
  index: string;
  title: string;
  /** 分组标题的 id：分段控件要靠它做 aria-labelledby */
  titleId: string;
  /** 标题右侧的当前值（省得用户要在控件里找自己选了什么） */
  value?: string;
  children: React.ReactNode;
};

/**
 * 分组容器：左「[ 编号 ] + 标题」，右当前值，下面挂控件。
 * 用 borderTop 全宽贯通（padding 放在分组自己身上），这样分隔线是整条面板宽，不是缩进的一小段。
 */
function Section({ index, title, titleId, value, children }: SectionProps) {
  return (
    <section style={{ padding: '18px 25px', borderTop: HAIRLINE }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="hud" style={{ color: 'rgb(var(--c-fg) / 0.4)' }}>
            [ {index} ]
          </span>
          <h3 id={titleId} className="hud" style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'rgb(var(--c-fg))' }}>
            {title}
          </h3>
        </div>
        {value ? (
          <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
            {value}
          </span>
        ) : null}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

type SegmentedProps<T extends string> = {
  id: string;
  /** aria-labelledby 指向的分组标题 id */
  labelId: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
};

/**
 * 分段控件（radiogroup + role="radio"）。
 * 用 roving tabindex：整组只占一个 Tab 位，组内用方向键切换，符合 WAI-ARIA radio 的模式。
 * hover 高亮走 state 而不是 CSS 类：底色写在 inline style 上，类选择器压不过它。
 */
function Segmented<T extends string>({ id, labelId, options, value, onChange }: SegmentedProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [hovered, setHovered] = useState<T | null>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = options.findIndex((option) => option.value === value);
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % options.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    if (next < 0) return;

    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" id={id} aria-labelledby={labelId} onKeyDown={onKeyDown} style={{ display: 'flex', gap: 6 }}>
      {options.map((option, i) => {
        const checked = option.value === value;
        const lit = checked || hovered === option.value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onPointerEnter={() => setHovered(option.value)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(option.value)}
            onBlur={() => setHovered(null)}
            data-cursor-hover
            data-cursor-label={option.label}
            className="flex-1 transition-colors duration-[380ms] ease-out-expo"
            style={{
              ...ROW,
              ...ROW_TEXT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 10px',
              color: checked ? 'rgb(var(--c-bg))' : lit ? 'rgb(var(--c-fg))' : 'rgb(var(--c-dim))',
              borderColor: checked ? 'rgb(var(--c-fg))' : lit ? 'rgba(85,85,85,0.4)' : 'rgba(85,85,85,0.1)',
              backgroundColor: checked ? 'rgb(var(--c-fg))' : lit ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsPanel() {
  const open = useStore(sel.settingsOpen);
  const audioOn = useStore(sel.audioOn);
  const track = useStore(sel.track);
  const tier = useStore(sel.tier);
  const [readout, setReadout] = useState({ fps: 0, dpr: 1 });
  const [closeHovered, setCloseHovered] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    useStore.getState().setSettings(false);
  }, []);

  /*
   * FPS/像素比 读数只在面板打开时订阅：FpsMeter 每 800ms 写一次 store，
   * 常驻订阅会让整个面板每秒重渲染一次 —— 看不见的读数不该花这份钱。
   */
  useEffect(() => {
    if (!open) return;
    const current = useStore.getState();
    setReadout({ fps: current.fps, dpr: current.dpr });
    return useStore.subscribe((next, prev) => {
      if (next.fps !== prev.fps || next.dpr !== prev.dpr) {
        setReadout({ fps: next.fps, dpr: next.dpr });
      }
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusRaf = window.requestAnimationFrame(() => panelRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      playUiSound('click');
      close();
    };
    window.addEventListener('keydown', onKeyDown);

    // 面板打开时冻结页面滚动（与导航浮层一致的模态语义）
    const smoother = ScrollSmoother.get();
    smoother?.paused(true);

    return () => {
      window.cancelAnimationFrame(focusRaf);
      window.removeEventListener('keydown', onKeyDown);
      smoother?.paused(false);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, close]);

  const changeAudio = (value: 'on' | 'off') => {
    const next = value === 'on';
    useStore.getState().setAudio(next);
    // 在用户手势里直接启停，保证 AudioContext 真的能 resume
    if (next) {
      startAudio(track);
      playUiSound('pop');
    } else {
      playUiSound('click');
      stopAudio();
    }
  };

  const changeTier = (value: Tier) => {
    useStore.getState().setTier(value);
    playUiSound('click');
  };

  const changeTrack = (value: string) => {
    useStore.getState().setTrack(value);
    useStore.getState().setAudio(true);
    startAudio(value);
    playUiSound('pop');
  };

  const currentTrack = TRACKS.find((item) => item.id === track) ?? TRACKS[0];

  return (
    <>
      {/* 遮罩：纯鼠标便利，键盘用户走 Esc 或面板里的关闭按钮 */}
      <div
        aria-hidden
        onClick={close}
        className="fixed inset-0 transition-opacity duration-[420ms] ease-out-expo"
        style={{
          zIndex: 'var(--z-overlay)',
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      <aside
        id="settings-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${LABELS.title} / ${LABELS.subtitle}`}
        aria-hidden={!open}
        tabIndex={-1}
        className="fixed right-0 top-0 h-full w-[min(440px,92vw)] overflow-y-auto"
        style={{
          zIndex: 'var(--z-overlay)',
          backgroundColor: 'rgba(18,18,18,0.86)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderLeft: '1px solid rgba(85,85,85,0.3)',
          // 面板贴着视口右缘，圆角与右侧边框都没有意义
          borderRadius: 0,
          overscrollBehavior: 'contain',
          transform: open ? 'translateX(0)' : 'translateX(101%)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          transition:
            'transform 560ms var(--ease-out-expo), opacity 400ms var(--ease-out-expo), visibility 0ms linear',
          // 字号与滚动条策略见 globals.css 的 #settings-panel（.hud 默认 10px/8px 在这里偏小）
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '24px 25px 22px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.5px' }}>
              {LABELS.title}
            </h2>
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
              {LABELS.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              playUiSound('click');
              close();
            }}
            onPointerEnter={() => setCloseHovered(true)}
            onPointerLeave={() => setCloseHovered(false)}
            onFocus={() => setCloseHovered(true)}
            onBlur={() => setCloseHovered(false)}
            aria-label={LABELS.close}
            data-cursor-hover
            data-cursor-label="CLOSE"
            style={{
              ...ROW,
              height: 36,
              width: 36,
              display: 'grid',
              placeItems: 'center',
              flex: '0 0 auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1,
              color: closeHovered ? 'rgb(var(--c-fg))' : 'rgb(var(--c-fg) / 0.4)',
              backgroundColor: closeHovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
              transition: 'color 300ms var(--ease-out-expo), background-color 300ms var(--ease-out-expo)',
            }}
          >
            ✕
          </button>
        </header>

        {/* [ 01 ] 核心主题：参考站的 Core Theme 就是一行只读版本信息，不做成"能点的控件" */}
        <Section index="01" title={LABELS.core} titleId="set-core-label">
          <div style={{ ...ROW, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
            <span className="hud-sm" style={{ color: 'rgb(var(--c-dim))' }}>
              当前版本
            </span>
            <span style={{ ...ROW_TEXT, color: 'rgb(var(--c-fg))' }}>V_1.0</span>
          </div>
        </Section>

        <Section
          index="02"
          title={LABELS.audio}
          titleId="set-audio-label"
          value={audioOn ? '已启用' : '已关闭'}
        >
          <Segmented
            id="set-audio"
            labelId="set-audio-label"
            options={AUDIO_OPTIONS}
            value={audioOn ? 'on' : 'off'}
            onChange={changeAudio}
          />
          <div style={{ marginTop: 16 }}>
            <p id="set-track-label" className="hud-sm" style={{ margin: '0 0 8px', color: 'rgb(var(--c-dim))' }}>
              音轨选择
            </p>
            <Segmented
              id="set-track"
              labelId="set-track-label"
              options={TRACK_OPTIONS}
              value={track}
              onChange={changeTrack}
            />
            {/* 当前音轨的说明：选中项已经不重复在这里了，只留描述与节拍 */}
            <p style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.7, color: 'rgb(var(--c-dim))' }}>
              {currentTrack.blurb} ·{' '}
              <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', color: 'rgb(var(--c-fg) / 0.75)' }}>
                {currentTrack.bpm > 0 ? `${currentTrack.bpm} BPM` : 'NO_BPM'}
              </span>
            </p>
          </div>
        </Section>

        <Section index="03" title={LABELS.tier} titleId="set-tier-label" value={TIER_LABEL[tier]}>
          <Segmented id="set-tier" labelId="set-tier-label" options={TIER_OPTIONS} value={tier} onChange={changeTier} />
        </Section>

        <p style={{ margin: 0, padding: '16px 25px 0', borderTop: HAIRLINE, fontSize: 11.5, lineHeight: 1.75, color: 'rgb(var(--c-dim))' }}>
          {NOTE}
        </p>

        <div
          className="hud-sm"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', padding: '14px 25px 24px', color: 'rgb(var(--c-dim))' }}
        >
          <span>帧率 {readout.fps > 0 ? readout.fps.toFixed(0).padStart(3, '0') : '---'}</span>
          <span>像素比 {readout.dpr.toFixed(2)}</span>
          <span>性能档 {TIER_LABEL[tier]}</span>
        </div>
      </aside>
    </>
  );
}