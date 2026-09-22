import type { Project } from '@/lib/data/content';

/**
 * 程序化卡面 / 画面生成器（项目墙 + 详情页共用）。
 *
 * 为什么不放图片：参考站的卡面是设计稿截图，我们没有素材版权，
 * 所以这里用 SVG 按 seed 确定性地"画"一张画面：渐变底 + 网格 + 斜带 + 同心线框 + 噪点。
 *
 * 为什么是纯函数：同一个 seed 必须永远得到同一条参数序列。
 * 服务端和客户端各跑一遍同样的代码，输出必须逐字节一致 —— 否则 React 会报 hydration 不匹配。
 * 所以随机数来自 seed（FNV-1a 哈希 + mulberry32），而不是 Math.random()。
 *
 * 为什么"同一系列"：图层结构、配色位置、噪点方式固定，只有参数（渐变方向、网格间距、
 * 同心圆中心、圆环层数、多边形边数、噪点强度）随 seed 变 —— 于是 6 张卡像同一套影像档案的不同画面。
 */

/** FNV-1a 32 位哈希：把 slug 变成整数种子 */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32：确定性伪随机数生成器，同一种子 → 同一串数 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从候选表里确定性地挑一个 */
function pick(rng: () => number, options: readonly number[]): number {
  return options[Math.floor(rng() * options.length) % options.length];
}

export type ProjectArtProps = {
  /** 画面种子：同一个 seed 永远得到同一张画面 */
  seed: string;
  /** 项目配色（content.ts 的 palette: [c1, c2]） */
  palette: Project['palette'];
  className?: string;
};

/** viewBox 固定 1600×1000（16:10）；容器比例不同时用 slice 居中裁切，不拉伸变形 */
const VB_W = 1600;
const VB_H = 1000;

export default function ProjectArt({ seed, palette, className }: ProjectArtProps) {
  const seedNum = hashSeed(seed);
  const rng = makeRng(seedNum);
  const uid = `pja${seedNum.toString(36)}`;

  // —— 参数区：全部由 rng 派生，调用顺序固定，保证确定性 ——
  const gradDeg = pick(rng, [20, 55, 90, 135, 200, 250, 300, 335]);
  const gridSize = pick(rng, [40, 48, 64, 80]);
  const gridDeg = pick(rng, [0, 15, 30, 45, 90]);
  const gridAlpha = 0.05 + rng() * 0.07;
  const ringCx = 560 + rng() * 460;
  const ringCy = 340 + rng() * 300;
  const ringCount = 3 + Math.floor(rng() * 3);
  const ringGap = 70 + rng() * 90;
  const polySides = 3 + Math.floor(rng() * 4);
  const polyR = 150 + rng() * 170;
  const polyDeg = rng() * 90;
  const bandCount = 2 + Math.floor(rng() * 2);
  const barCount = 3 + Math.floor(rng() * 3);
  const noiseAlpha = 0.1 + rng() * 0.12;

  // 渐变方向：把角度换算成 objectBoundingBox 单位下的两点（0..100）
  const rad = (gradDeg * Math.PI) / 180;
  const gx1 = (50 - Math.cos(rad) * 50).toFixed(1);
  const gy1 = (50 - Math.sin(rad) * 50).toFixed(1);
  const gx2 = (50 + Math.cos(rad) * 50).toFixed(1);
  const gy2 = (50 + Math.sin(rad) * 50).toFixed(1);

  // 同心线框：一层层往外扩，半径等差递增（同系列观感来自这个固定规则）
  const rings = Array.from({ length: ringCount }, (_, i) => 60 + i * ringGap);
  // 外框多边形：边数随 seed 变（三角/方/五边/六边），包住同心圆
  const polyPoints = Array.from({ length: polySides }, (_, i) => {
    const a = (i / polySides) * Math.PI * 2 - Math.PI / 2;
    return `${(ringCx + Math.cos(a) * polyR).toFixed(1)},${(ringCy + Math.sin(a) * polyR).toFixed(1)}`;
  }).join(' ');
  // 斜带：平行四边形，用来制造"大面积色块切分"的档案感
  const bands = Array.from({ length: bandCount }, () => {
    const y = rng() * VB_H;
    const h = 40 + rng() * 190;
    const skew = (rng() - 0.5) * 460;
    const alpha = 0.03 + rng() * 0.07;
    return { y, h, skew, alpha };
  });
  // HUD 细条：模拟界面里被裁掉的一截条状元素
  const bars = Array.from({ length: barCount }, () => {
    const y = 120 + rng() * (VB_H - 300);
    const w = 120 + rng() * 420;
    const x = rng() < 0.5 ? 80 : VB_W - 80 - w;
    return { x, y, w, alpha: 0.12 + rng() * 0.2 };
  });

  // 左下角的 seed 读数：让"归档编号"这件事在画面里也成立
  const label = seed.replace(/-/g, '_').toUpperCase();

  return (
    <svg
      className={className}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      role="presentation"
      aria-hidden
      focusable="false"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1={`${gx1}%`} y1={`${gy1}%`} x2={`${gx2}%`} y2={`${gy2}%`}>
          <stop offset="0" stopColor={palette[0]} />
          <stop offset="1" stopColor={palette[1]} />
        </linearGradient>
        <radialGradient id={`${uid}-vig`} cx="50%" cy="45%" r="78%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.6" />
        </radialGradient>
        <pattern
          id={`${uid}-grid`}
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${gridDeg})`}
        >
          <path
            d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={gridAlpha.toFixed(3)}
            strokeWidth="1.5"
          />
        </pattern>
        <filter id={`${uid}-noise`} x="0" y="0" width="100%" height="100%">
          {/* feTurbulence 的 seed 属性本身是确定性的：换 seed 就换一张噪点图 */}
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed={seedNum % 9999} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      <rect width={VB_W} height={VB_H} fill={`url(#${uid}-bg)`} />
      <rect width={VB_W} height={VB_H} fill={`url(#${uid}-grid)`} />

      <g>
        {bands.map((b, i) => (
          <polygon
            key={i}
            points={`${(-200 + b.skew).toFixed(1)},${b.y.toFixed(1)} ${(VB_W + 200 + b.skew).toFixed(1)},${b.y.toFixed(
              1,
            )} ${(VB_W + 200).toFixed(1)},${(b.y + b.h).toFixed(1)} -200,${(b.y + b.h).toFixed(1)}`}
            fill="#ffffff"
            fillOpacity={b.alpha.toFixed(3)}
          />
        ))}
      </g>

      <g>
        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x.toFixed(1)}
            y={b.y.toFixed(1)}
            width={b.w.toFixed(1)}
            height="8"
            fill="#ffffff"
            fillOpacity={b.alpha.toFixed(3)}
          />
        ))}
      </g>

      {/* 同心线框 + 外框多边形：系列感最强的两层，位置换了但结构不变 */}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.24" strokeWidth="2">
        {rings.map((r) => (
          <circle key={r} cx={ringCx.toFixed(1)} cy={ringCy.toFixed(1)} r={r.toFixed(1)} />
        ))}
      </g>
      <g transform={`rotate(${polyDeg.toFixed(2)} ${ringCx.toFixed(1)} ${ringCy.toFixed(1)})`}>
        <polygon points={polyPoints} fill="none" stroke={palette[1]} strokeOpacity="0.85" strokeWidth="2.5" />
      </g>
      <line
        x1="0"
        y1={ringCy.toFixed(1)}
        x2={VB_W}
        y2={ringCy.toFixed(1)}
        stroke="#ffffff"
        strokeOpacity="0.16"
        strokeWidth="1.5"
      />

      <rect
        width={VB_W}
        height={VB_H}
        filter={`url(#${uid}-noise)`}
        opacity={noiseAlpha.toFixed(3)}
        style={{ mixBlendMode: 'overlay' }}
      />
      <rect width={VB_W} height={VB_H} fill={`url(#${uid}-vig)`} />

      <text
        x="72"
        y="912"
        fill="#ffffff"
        fillOpacity="0.26"
        fontFamily="var(--font-mono)"
        fontSize="20"
        letterSpacing="5"
      >
        {label}
      </text>
    </svg>
  );
}
