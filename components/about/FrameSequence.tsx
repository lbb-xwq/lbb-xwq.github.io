'use client';

import { person } from '@/lib/data/content';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import ViewportLayer from '@/components/about/ViewportLayer';
import { about } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

gsap.registerPlugin(ScrollTrigger);

/** 帧尺寸与总帧数都由内容层决定，组件不写死数字 */
const FRAME = about.frames;

/** ScrollTrigger 的滚动区间：每帧约 40px，至少 1200px（内容太短时也能走满 40 帧） */
const SCROLL_PER_FRAME = 40;

/** SSR 阶段不能调 useLayoutEffect（React 会告警），但客户端需要"早于绘制"的时序来避免入场闪烁 */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * canvas 读不到 CSS 变量，所以把用到的令牌值写成常量（与 app/globals.css 一致）。
 * 用 "r,g,b" 字符串拼 alpha，避免每帧构造颜色对象。
 */
const INK = {
  bg: '#020202',
  line: '45,45,45', // --c-line-2
  dim: '140,140,140', // --c-dim
  fg: '253,255,255', // --c-fg
  signal: '242,219,76', // --c-signal
} as const;

/** 帧号补零：FRAME 017 / 040 */
const pad3 = (n: number): string => String(n).padStart(3, '0');

/**
 * 确定性伪随机：把整数映射到 [0,1)。
 * 用它代替 Math.random —— 同一个层序号每次运行都取到同一个偏移，
 * 于是"帧号 → 画面"是纯函数：暂停、回滚、resize 重绘都得到同一张图。
 */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 画第 index 帧（0 ≤ index < total）。全部几何量都是归一化进度
 * `u = index / (total - 1)` 的连续函数，所以相邻帧只差一点点，整体呈现"展开 + 旋转 + 流动"的动画感：
 *
 *  1) 网格：间距 cell = 40 + 8·sin(2πu) 做呼吸；相位取 u·cell·3 的模 —— 相位每跨一格自增一格，
 *     而网格平移整整一格在视觉上等价于没动，因此取模处的跳变不可见，仍是连续的。
 *  2) 8 层同心旋转矩形：边长按 easeOutCubic 从 0.94 收到 0.28（越里层收得越多，形成"展开"），
 *     整体旋转 u·135°；每层再叠一个由 hash01(k) 决定的固定小角度与固定抖动，
 *     让层与层错开（这些量只跟层号有关，所以帧间仍然连续）。
 *  3) 干涉条纹：条纹带高度按 easeOutCubic 从 6% 展开到 68%，从中心向上下长；
 *     条纹频率 0.35→2.25 递增，相位 u·42 让亮度波随帧号流动；
 *     明暗用 sin 的正半部分平方，得到"亮线细、暗区宽"的干涉质感。
 *  4) 读取游标：1px 竖线从 8% 线性走到 92%，配合一条十字刻度，给出"正在逐帧推进"的读数感。
 *  5) 帧号水印：左下角 FRAME xxx / xxx 与 SEQ 402x600 · T=0.xx，帧号本身也是几何量的一部分。
 */
/**
 * /about 的真实头像。
 * 参考站这一块是**人物照片的 40 帧序列**（/images/frames/frame-1.webp … 40），
 * 我们用「一张真实照片作底图 + 逐帧程序化叠加层（网格 / 同心矩形 / 游标 / 帧号）」
 * 等价实现：把 public/images/portrait.jpg 放进来，这里显示的就是本人。
 */
let __aboutPhoto: HTMLImageElement | null = null;
function loadAboutPhoto() {
  if (__aboutPhoto || typeof window === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  img.src = person.portrait;
  img.onload = () => {
    __aboutPhoto = img;
  };
}
function drawFrame(
  ctx: CanvasRenderingContext2D,
  index: number,
  total: number,
  w: number,
  h: number,
): void {
  loadAboutPhoto(); // 懒加载：只在绘制时触发，避免首页预加载
  const u = total > 1 ? index / (total - 1) : 0;
  const ease = 1 - (1 - u) ** 3; // easeOutCubic
  const tau = Math.PI * 2;

  // 每帧重画前把上下文复位：clip / globalAlpha / 变换可能被上一帧改过
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = INK.bg;
  ctx.fillRect(0, 0, w, h);

  // 0) 真实照片（cover 铺满 + 随推进极轻微推近），上面再叠程序化层
  if (__aboutPhoto && __aboutPhoto.complete && __aboutPhoto.naturalWidth > 0) {
    const cover = Math.max(w / __aboutPhoto.naturalWidth, h / __aboutPhoto.naturalHeight);
    const scale = cover * (1 + 0.05 * ease);
    const dw = __aboutPhoto.naturalWidth * scale;
    const dh = __aboutPhoto.naturalHeight * scale;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(__aboutPhoto, (w - dw) / 2, (h - dh) / 2 - h * 0.02, dw, dh);
    ctx.globalAlpha = 1;
    // 与整站单色系统统一：用 saturation 混合把照片去色（推进越深越回彩）
    if (ease < 0.85) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 底部压暗，保证帧号与游标可读
    const grad = ctx.createLinearGradient(0, h * 0.55, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
  }

  // 1) 呼吸网格（+0.5 让 1px 线落在像素中心，避免被抗锯齿摊成 2px 灰线）
  const cell = 40 + 8 * Math.sin(u * tau);
  const phase = (u * cell * 3) % cell;
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${INK.line},0.5)`;
  ctx.beginPath();
  for (let x = phase - cell; x <= w + cell; x += cell) {
    const px = Math.round(x) + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
  }
  for (let y = phase - cell; y <= h + cell; y += cell) {
    const py = Math.round(y) + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
  }
  ctx.stroke();

  // 2) 同心旋转矩形
  const cx = w * 0.5;
  const cy = h * 0.44;
  const layers = 8;
  const unit = Math.min(w, h);
  const baseRot = u * Math.PI * 0.75;
  for (let k = 0; k < layers; k++) {
    const p = k / (layers - 1);
    const side = unit * (0.94 - 0.66 * ease * p) * (1 + 0.06 * Math.sin(u * tau + k * 0.7));
    const rot = baseRot + p * Math.PI * 0.5 + hash01(k + 1) * 0.3;
    const isInner = k === layers - 1;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.lineWidth = isInner ? 1.5 : 1;
    ctx.strokeStyle = isInner
      ? `rgba(${INK.signal},0.9)`
      : `rgba(${INK.line},${(0.95 - 0.35 * p).toFixed(2)})`;
    ctx.strokeRect(-side / 2, -side / 2, side, side);
    // 每层左上角留一段信号色缺口：避免整体看起来只是一叠普通边框
    ctx.strokeStyle = `rgba(${INK.signal},${(0.12 + 0.5 * p).toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(-side / 2, -side / 2);
    ctx.lineTo(-side / 2 + side * 0.22, -side / 2);
    ctx.stroke();
    ctx.restore();
  }

  // 3) 干涉条纹（裁剪在带内，带高度随帧号展开）
  const bandH = h * (0.06 + 0.62 * ease);
  const bandY = cy - bandH / 2;
  const freq = 0.35 + 1.9 * u;
  const shift = u * 42;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bandY, w, bandH);
  ctx.clip();
  // 每 3px 取一条：再密就糊成一片灰，反而看不清"干涉"的结构
  for (let y = bandY; y < bandY + bandH; y += 3) {
    const s = Math.sin(y * freq + shift);
    const a = s > 0 ? s * s * (0.1 + 0.16 * ease) : 0;
    if (a < 0.004) continue;
    ctx.fillStyle = `rgba(${INK.fg},${a.toFixed(3)})`;
    ctx.fillRect(0, y, w, 1);
  }
  ctx.restore();
  // 带的两条边缘用信号色细线标出来
  ctx.fillStyle = `rgba(${INK.signal},${(0.25 + 0.45 * ease).toFixed(2)})`;
  ctx.fillRect(0, Math.round(bandY), w, 1);
  ctx.fillRect(0, Math.round(bandY + bandH), w, 1);

  // 4) 读取游标
  const cursorX = Math.round(w * (0.08 + 0.84 * u));
  ctx.fillStyle = `rgba(${INK.signal},0.6)`;
  ctx.fillRect(cursorX, 0, 1, h);
  ctx.fillRect(cursorX - 5, Math.round(cy) - 1, 11, 1);

  // 5) 帧号水印
  ctx.font = '10px "Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = `rgba(${INK.fg},0.8)`;
  ctx.fillText(`帧 ${pad3(index + 1)} / ${pad3(total)}`, 14, h - 18);
  ctx.fillStyle = `rgba(${INK.dim},0.9)`;
  ctx.fillText(`SEQ ${w}x${h} · T=${u.toFixed(2)}`, 14, h - 6);
}

/** 四角 L 形角标（--c-signal），比画框外扩 5px，读起来像 HUD 取景框 */
function cornerStyle(v: 'top' | 'bottom', h: 'left' | 'right'): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 12,
    height: 12,
    borderStyle: 'solid',
    borderColor: 'rgb(var(--c-signal))',
    borderWidth: 0,
    pointerEvents: 'none',
  };
  if (v === 'top') {
    base.top = -5;
    base.borderTopWidth = 1;
  } else {
    base.bottom = -5;
    base.borderBottomWidth = 1;
  }
  if (h === 'left') {
    base.left = -5;
    base.borderLeftWidth = 1;
  } else {
    base.right = -5;
    base.borderRightWidth = 1;
  }
  return base;
}

/**
 * 入场初始态：只写 opacity / filter，位移交给 GSAP 的 `xPercent: -100`（等于 translateX(-100%)）。
 * 不能在这里写 `transform: translateX(-100%)`：浏览器会把它算成 px 的 matrix，
 * GSAP 读到之后当成别的位移量，再叠 xPercent 就会停在错误的位置上。
 * opacity 先挂上可以保证即使 GSAP 的 from 态晚一帧生效，也只会"看不见"，不会闪出终态。
 */
const ENTER_FROM: React.CSSProperties = {
  opacity: 0,
  filter: 'grayscale(100%)',
};

export type FrameSequenceProps = {
  /** 正文容器：擦洗的 trigger，也是入场判定的参照物 */
  triggerRef: React.RefObject<HTMLElement | null>;
};

/**
 * 滚动擦洗的图片序列。
 *
 * 没有真实素材，40 帧全部由 drawFrame() 程序化生成（不使用任何外部图片/参考站资源）。
 * 滚动只推进"帧号"这一个整数，帧号变化时才重绘一次 canvas ——
 * 于是整个滚动过程中的绘制次数上限就是帧数（40），而不是每个滚动事件一次。
 *
 * canvas 用回调 ref 落到 state 上而不是 ref.current：桌面端它渲染在
 * ViewportLayer（portal）里，portal 子树的挂载晚于父组件自己的 effect，
 * 用 ref.current 会拿到 null，导致第一帧永远画不出来。
 */
export default function FrameSequence({ triggerRef }: FrameSequenceProps) {
  const { total, width, height } = FRAME;
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [innerEl, setInnerEl] = useState<HTMLDivElement | null>(null);
  /** 已经画在 canvas 上的帧号，-1 表示还没画过（用它去重，避免重复绘制同一帧） */
  const paintedRef = useRef(-1);
  const [frameIndex, setFrameIndex] = useState(0);
  const [compact, setCompact] = useState(false);

  const tier = useStore(sel.tier);
  const reduced = useStore(sel.motion) === 'reduced';
  // reduced / saver：不做擦洗，只画第 1 帧静态显示
  const scrubEnabled = !reduced && tier !== 'saver';

  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasEl(node);
  }, []);
  const innerRef = useCallback((node: HTMLDivElement | null) => {
    setInnerEl(node);
  }, []);

  // ≤1024px：取消固定，放进正文正常流
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const paint = useCallback(
    (index: number) => {
      if (!canvasEl) return;
      const ctx = canvasEl.getContext('2d');
      if (!ctx) return;
      drawFrame(ctx, index, total, width, height);
      paintedRef.current = index;
    },
    [canvasEl, total, width, height],
  );

  // 首帧 / 换档 / 移动端切版（canvas 会被重新挂载）后补画一次
  useEffect(() => {
    paint(0);
    setFrameIndex(0);
    // 水印用的是等宽字体，字体晚到会让第一版水印走形 —— 字体就绪后按当前帧重画一次
    let alive = true;
    void document.fonts.ready
      .then(() => {
        if (alive) paint(paintedRef.current < 0 ? 0 : paintedRef.current);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [paint, compact]);

  /**
   * 滚动 → 帧号映射。
   * 区间长度 = max(1200, total × 40) = 1600px：进度 0→1 正好对应 0→39 帧、每帧约 40px 滚动量。
   * Math.round 把连续进度量化成整数帧号，只有帧号真的变了才重绘（性能）。
   */
  useEffect(() => {
    if (!scrubEnabled) return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    const apply = (progress: number) => {
      const next = Math.round(progress * (total - 1));
      if (next === paintedRef.current) return;
      paint(next);
      setFrameIndex(next);
    };

    const st = ScrollTrigger.create({
      trigger,
      start: 'top top',
      end: `+=${Math.max(1200, total * SCROLL_PER_FRAME)}`,
      scrub: 0.5,
      onUpdate: (self) => apply(self.progress),
    });

    // 创建时不会回调 onUpdate：滚到中间再进入本页（或从 saver 切到 high）时要先同步一次
    apply(st.progress);

    return () => {
      st.kill();
    };
  }, [scrubEnabled, paint, total, triggerRef, compact]);

  /**
   * 入场：初始 grayscale(100%) / opacity 0 / translateX(-100%)，进入视口后回到彩色、可见、贴边。
   * 减少动效时不播入场，直接落到终态。
   */
  useIsoLayoutEffect(() => {
    if (!innerEl) return;

    if (reduced) {
      gsap.set(innerEl, { clearProps: 'transform,opacity,filter' });
      return;
    }

    const tween = gsap.fromTo(
      innerEl,
      { xPercent: -100, opacity: 0, filter: 'grayscale(100%)' },
      {
        xPercent: 0,
        opacity: 1,
        filter: 'grayscale(0%)',
        duration: 1,
        ease: 'expo.out', // 与 --ease-out-expo 等价的 cubic-bezier(.16,1,.3,1)
        scrollTrigger: { trigger: triggerRef.current ?? innerEl, start: 'top 80%', once: true },
      },
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      gsap.set(innerEl, { clearProps: 'transform,opacity,filter' });
    };
  }, [innerEl, reduced, triggerRef, compact]);

  const content = (
    <div
      ref={innerRef}
      className="about-page"
      style={{ willChange: 'transform, opacity, filter', ...(reduced ? null : ENTER_FROM) }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          // 宽高比直接取自内容层的 402 × 600，缩放时不会被拉伸成别的比例
          aspectRatio: `${width} / ${height}`,
          border: '1px solid rgb(var(--c-line-2))',
          background: 'rgb(var(--c-bg))',
        }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          role="img"
          aria-label={`关于页滚动序列帧插画：旋转的同心方框、展开的干涉条纹与逐帧推进的读取游标，程序化生成，共 ${total} 帧`}
          style={{ width: '100%', height: '100%' }}
        />
        <span aria-hidden style={cornerStyle('top', 'left')} />
        <span aria-hidden style={cornerStyle('top', 'right')} />
        <span aria-hidden style={cornerStyle('bottom', 'left')} />
        <span aria-hidden style={cornerStyle('bottom', 'right')} />
      </div>
      <p
        className="hud-sm"
        style={{ margin: '0.6rem 0 0', color: 'rgb(var(--c-dim))', textAlign: 'right' }}
      >
        FRAME {pad3(frameIndex + 1)} / {pad3(total)}
      </p>
    </div>
  );

  // ≤1024px：跟着正文走（宽 100%），不再固定
  if (compact) {
    return <div style={{ width: '100%', margin: '2.5rem 0 1rem' }}>{content}</div>;
  }

  return (
    <ViewportLayer>
      <div
        style={{
          position: 'fixed',
          right: '5vw',
          top: '50%',
          transform: 'translateY(-50%)',
          /* 实测参考站的 frameContainer 就是固定 402x600（内联 width:402px;height:600px，
             canvas 用 aspect-ratio 402/600）—— 所以这里也用固定值，不再用 vw/vh 收窄；
             小屏只加一个 maxWidth 兜住不溢出。 */
          width: '402px',
          height: '600px',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        {content}
      </div>
    </ViewportLayer>
  );
}