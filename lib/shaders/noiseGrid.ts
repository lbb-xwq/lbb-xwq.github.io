/**
 * 全站噪声网格背景（参考站 section.noise-background 的 WebGL 版）的 GLSL 与 uniform 定义。
 *
 * 实现要点（与参考站实测行为的对应关系）：
 * 1. 参考站那张 noise.png 是私有素材 → 这里用 **程序化 value noise**（GLSL hash + 双线性插值）
 *    替代纹理采样，零外部资源、离线可用，也不涉及版权。
 * 2. 参考站是「网格 + 噪声」，网格线极细（约 1px）且对比度极低（#2D2D2D 量级）。
 *    这里用 gl_FragCoord（设备像素）算到最近网格线的距离，再用 smoothstep 做 **解析抗锯齿**，
 *    比画几何线段便宜得多：整屏只需要 1 个 quad、1 个 draw call。
 * 3. 平面正交：顶点着色器直接输出 NDC，不使用投影矩阵 —— 也就是「等效的平面正交相机」，
 *    网格间距永远按屏幕像素算，不会随透视图元缩放。
 * 4. 低性能档（saver / reduced motion）不渲染 canvas，退化为 CSS repeating-linear-gradient，
 *    对应参考站的低档静态背景。
 */

import * as THREE from 'three';

/** 网格线的基础间距（CSS px）。参考站是 14px 细网格。 */
export const NOISE_GRID_BASE_PX = 14;

/** 网格线颜色：参考站 outline-2 = rgb(45 45 45) */
const LINE_COLOR = 45 / 255;
/** 底色：#020202（参考站 section.noise-background） */
const BASE_COLOR = 2 / 255;

export type NoiseGridUniforms = {
  uTime: THREE.IUniform<number>;
  uResolution: THREE.IUniform<THREE.Vector2>;
  uMouse: THREE.IUniform<THREE.Vector2>;
  /** 网格间距，单位=设备像素（= 14 * dpr * 视口缩放） */
  uGridPx: THREE.IUniform<number>;
  /** 线宽（设备像素），用于 smoothstep 的抗锯齿宽度 */
  uLineWidth: THREE.IUniform<number>;
  uLineAlpha: THREE.IUniform<number>;
  /** 噪声频率，单位是「每个网格单元」 */
  uNoiseScale: THREE.IUniform<number>;
  /** 噪声对线亮度的调制幅度 */
  uNoiseAmount: THREE.IUniform<number>;
  /** 第二个 octave 的权重：medium 档置 0（省一次 noise） */
  uDetail: THREE.IUniform<number>;
  uMouseRadius: THREE.IUniform<number>;
  /** 光标把网格推开的像素数（视觉上的"透镜"变形） */
  uMousePush: THREE.IUniform<number>;
  uBaseColor: THREE.IUniform<THREE.Color>;
  uLineColor: THREE.IUniform<THREE.Color>;
};

/**
 * 逐帧需要刷新的数值（uGridPx / uLineWidth / uMouse* / uResolution）由组件在 useFrame 里写入，
 * 这里只给出一份与 dpr 无关的默认值，避免 dpr 变化后 uniform 与画布不一致。
 */
export function createNoiseGridUniforms(): NoiseGridUniforms {
  return {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    // 光标默认放到屏幕外，避免首帧在 (0,0) 位置出现一个假的亮斑
    uMouse: { value: new THREE.Vector2(-99999, -99999) },
    uGridPx: { value: NOISE_GRID_BASE_PX },
    uLineWidth: { value: 1 },
    uLineAlpha: { value: 0.42 },
    uNoiseScale: { value: 0.45 },
    uNoiseAmount: { value: 0.55 },
    uDetail: { value: 1 },
    uMouseRadius: { value: 200 },
    uMousePush: { value: 2.2 },
    // 注意：three 的 Color 默认按 working color space（linear-srgb）存值，
    // 也就是不做任何转换；而自定义 ShaderMaterial 的输出 three 也不会做 sRGB 编码，
    // 所以这里直接写屏幕期望的 sRGB 数值即可（45/255 就是屏幕上看到的 #2D2D2D）。
    uBaseColor: { value: new THREE.Color().setRGB(BASE_COLOR, BASE_COLOR, BASE_COLOR) },
    uLineColor: { value: new THREE.Color().setRGB(LINE_COLOR, LINE_COLOR, LINE_COLOR) },
  };
}

/** 全屏 quad 顶点着色器：PlaneGeometry(2,2) 的顶点已在 NDC，直接透传省掉矩阵乘法。 */
export const noiseGridVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * 网格 + 流动噪声。全部计算发生在 gl_FragCoord 空间（设备像素），
 * 因此 GPU 代价与分辨率成正比、与相机无关。
 */
export const noiseGridFragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uMouse;
uniform float uGridPx;
uniform float uLineWidth;
uniform float uLineAlpha;
uniform float uNoiseScale;
uniform float uNoiseAmount;
uniform float uDetail;
uniform float uMouseRadius;
uniform float uMousePush;
uniform vec3  uBaseColor;
uniform vec3  uLineColor;

varying vec2 vUv;

// 2D → 1D hash：用 fract(乘法) + 点积三角混合，比 sin(dot(p,k)) 版本在移动端
// 的大坐标上精度更稳（sin 的输入过大时会丢失低位，产生条纹状瑕疵）。
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// value noise：4 个格点 hash 做双线性插值，权重取 3f²-2f³（smootherstep）。
// 该权重让一阶导在格点处为 0，叠加后不会出现明显的方格棱线。
// 相比 simplex 便宜约一半，对这种「对比度极低的噪点」视觉上完全够用。
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 frag = gl_FragCoord.xy;        // 设备像素，原点左下
  vec2 uv = frag / uResolution;       // 0..1

  // ---- 光标响应 ----
  // 以像素距离做高斯衰减（exp(-(d/r)²)）：中心 1、半径处 0.37、两倍半径处几乎为 0，
  // 比 1/d 的幂次衰减更"局部"，不会让整屏都被光标影响。
  vec2 md = frag - uMouse;
  float mdist = length(md);
  float mfall = exp(-pow(mdist / uMouseRadius, 2.0));
  // 把网格坐标朝远离光标的方向平移 1~2px，形成轻微的透镜/推开感
  vec2 push = normalize(md + vec2(1e-4, 1e-4)) * (mfall * uMousePush);

  // ---- 网格 ----
  vec2 gp = (frag + push) / uGridPx;
  // abs(fract(x)-0.5) ∈ [0,0.5] 是到最近格线的归一化距离，乘回 uGridPx 得到像素距离
  vec2 d = (0.5 - abs(fract(gp) - 0.5)) * uGridPx;
  float lineDist = min(d.x, d.y);
  // 1px 线 + 天然抗锯齿：smoothstep 的过渡宽度就是 uLineWidth（设备像素）
  float line = 1.0 - smoothstep(0.0, uLineWidth, lineDist);

  // ---- 缓慢流动的 value noise ----
  // 两个方向用不同速度、且都不与网格对齐，避免整屏看起来在同一方向平移
  vec2 flow = vec2(uTime * 0.021, uTime * -0.013);
  vec2 nuv = frag / uGridPx * uNoiseScale + flow;
  float n = valueNoise(nuv);
  // 第二个 octave 频率取无理数倍（2.13）避免与第一层对齐产生规则花纹；
  // uDetail = 0（medium 档）时整层被跳过，直接省掉 4 次 hash
  n += uDetail * 0.5 * valueNoise(nuv * 2.13 - flow * 1.7);
  n /= 1.0 + uDetail * 0.5;

  // 网格线亮度被噪声调制 → 局部一截线变亮，形成参考站那种"接通了电"的感觉
  float lum = uLineAlpha * mix(1.0 - uNoiseAmount, 1.0, n);
  lum *= 1.0 + mfall * 0.9;                 // 光标附近整体提亮
  vec3 col = uBaseColor + uLineColor * line * lum;
  // 非网格区域留一点点噪声底纹，避免大面积纯色显得"死"（幅度 < 2/255）；
  // 再用 uv 做一个极弱的径向权重：中心略强、边缘更干净（同时让 uResolution 参与计算）
  float vign = 1.0 - 0.55 * smoothstep(0.2, 0.85, length(uv - 0.5));
  col += vec3(0.006) * (n - 0.5) * (1.0 - line) * vign;

  gl_FragColor = vec4(col, 1.0);
}
`;
