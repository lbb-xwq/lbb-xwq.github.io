/**
 * Hero GPGPU 粒子系统的 GLSL 与 uniform 定义。
 *
 * 架构（GPGPU 双 FBO 乒乓）：
 *   - 两张状态纹理：**位置**（xyz=位置）+ **速度**（xyz=速度），各有 2 张 render target 做乒乓。
 *   - 每个模拟步：先跑速度 pass（读 位置+速度 → 写新速度），再跑位置 pass（读 原位置+新速度 → 写新位置），
 *     也就是标准的半隐式欧拉（semi-implicit Euler）：v' = v + F·dt，p' = p + v'·dt。
 *   - 状态纹理用 uv=texel 一一对应粒子，绘制时 Points 的顶点着色器用 aRef 属性回读自己那一个 texel，
 *     所以不需要任何 CPU 端的 position 数据（初始分布也在 shader 里由 hash 程序化生成）。
 *
 * 4 种位移模式由 uniform `uMode`（0..3 的浮点）选择，模式之间用权重交叉淡化（见 modeWeights），
 * 0.8s 的过渡由组件逐帧推进 uMode 完成。
 *
 * 所有 shader 都用 GLSL1 语法（varying / texture2D / gl_FragColor）书写：three r180 一定把
 * ShaderMaterial 编译成 `#version 300 es`，并自动补上 `#define varying in/out`、
 * `#define texture2D texture`、`#define gl_FragColor pc_fragColor` 等宏，因此两边都兼容。
 */

import * as THREE from 'three';

/** 位移模式的名字，顺序 = uMode 的整数取值 */
export const PARTICLE_MODE_NAMES = ['idle', 'vortex', 'turbulence', 'pulse'] as const;
export type ParticleModeName = (typeof PARTICLE_MODE_NAMES)[number];

/**
 * 模拟纹理边长（粒子数 = 边长²）。
 * high: 144² = 20736（落在参考站 1.5~4 万的区间内）
 * medium: 80² = 6400（约 6 千）
 * saver: 不渲染
 */
export const PARTICLE_GRID_SIZE: Record<'high' | 'medium', number> = {
  high: 144,
  medium: 80,
};

/** 颗粒子初始球体半径 / 允许的最大半径（超出即回收） */
const SPREAD = 2.1;
const MAX_RADIUS = 4.6;
/** 限速：任何情况下不让速度失控（NaN 会通过纹理污染整条链，必须夹紧） */
const MAX_SPEED = 12;

export type ParticleUniforms = {
  uPos: THREE.IUniform<THREE.Texture | null>;
  uVel: THREE.IUniform<THREE.Texture | null>;
  uMode: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uInit: THREE.IUniform<number>;
  uSpread: THREE.IUniform<number>;
  uMaxRadius: THREE.IUniform<number>;
  uDt: THREE.IUniform<number>;
  uLevel: THREE.IUniform<number>;
  uAudioSpeed: THREE.IUniform<number>;
  uAudioPush: THREE.IUniform<number>;
  uMaxSpeed: THREE.IUniform<number>;
  uMouse: THREE.IUniform<THREE.Vector3>;
  uMouseForce: THREE.IUniform<number>;
};

export type ParticleRenderUniforms = {
  uPos: THREE.IUniform<THREE.Texture | null>;
  uVel: THREE.IUniform<THREE.Texture | null>;
  uSize: THREE.IUniform<number>;
  uFocal: THREE.IUniform<number>;
  uPixelRatio: THREE.IUniform<number>;
  uLevel: THREE.IUniform<number>;
  uIntensity: THREE.IUniform<number>;
  uColorBase: THREE.IUniform<THREE.Color>;
  uColorA: THREE.IUniform<THREE.Color>;
  uColorB: THREE.IUniform<THREE.Color>;
};

/** 速度 pass 的 uniform（每帧由组件写入） */
export function createParticleUniforms(): ParticleUniforms {
  return {
    uPos: { value: null },
    uVel: { value: null },
    uMode: { value: 0 },
    uTime: { value: 0 },
    uInit: { value: 1 },
    uSpread: { value: SPREAD },
    uMaxRadius: { value: MAX_RADIUS },
    uDt: { value: 0 },
    uLevel: { value: 0 },
    uAudioSpeed: { value: 1.9 },
    uAudioPush: { value: 1.5 },
    uMaxSpeed: { value: MAX_SPEED },
    uMouse: { value: new THREE.Vector3(0, 0, 0) },
    uMouseForce: { value: 0 },
  };
}

/** 绘制 pass 的 uniform */
export function createParticleRenderUniforms(): ParticleRenderUniforms {
  return {
    uPos: { value: null },
    uVel: { value: null },
    // 世界单位的基础点径；实际像素大小 = uSize * uFocal / 视距
    uSize: { value: 0.011 },
    uFocal: { value: 1000 },
    uPixelRatio: { value: 1 },
    uLevel: { value: 0 },
    uIntensity: { value: 0.55 },
    // 近白 rgb(253 255 255) 与青/品红之间的速度插值
    uColorBase: { value: new THREE.Color().setRGB(253 / 255, 255 / 255, 255 / 255) },
    uColorA: { value: new THREE.Color().setRGB(0.32, 0.95, 1.0) },
    uColorB: { value: new THREE.Color().setRGB(1.0, 0.4, 0.92) },
  };
}

/** 共用的 hash / value noise 代码块，拼进各个着色器（GLSL 没有 include，只能字符串拼） */
const HASH_GLSL = /* glsl */ `
// 2D → 1D hash（同 noiseGrid 的实现，移动端精度友好）
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash31(vec3 p) {
  vec3 p3 = fract(p * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

// 3D value noise：8 个格点 hash + smootherstep 权重。
// 在位移模式里只当作"低频扰动场"用，不需要梯度信息，所以不做 simplex。
// 注意：GLSL 要求函数先声明后使用，所以 hash31 必须写在它前面。
float valueNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}
`;

/** 模拟 pass 的全屏 quad 顶点着色器：PlaneGeometry(2,2) 的顶点已在 NDC */
export const particleSimVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * 速度 pass。
 *
 * 4 种位移模式的数学定义（都是"单位质量的加速度"，单位：世界单位/秒²）：
 *   0 idle：向半径 R(t)=1.45+0.26·sin(0.5t+φ) 的球壳做阻尼弹簧回位（k=2.4, c=1.5），
 *           再叠加一层低频 value noise 切向漂移 → 缓慢呼吸、表面有细流的球壳。
 *   1 vortex：绕 Y 轴的切向加速度 swirl=3.1/(0.55+r)（近似开普勒盘：越靠内角速度越高），
 *             径向力把粒子约束到 r≈1.15 的环，y 方向弹簧把云压成盘；再按方位角 3 条螺旋臂调制。
 *   2 turbulence：ABC 流（Arnold–Beltrami–Childress）f=(sin y+cos 0.7z, sin z+cos 0.7x, sin x+cos 0.7y)。
 *             该场构造上 ∇·f = 0，粒子不会被人为地吸进奇点，因此能保持"丝状"结构；
 *             用 value noise 调制振幅以打破周期性（等价于 curl noise 的观感，但便宜一个数量级）。
 *   3 pulse：周期 6.4s 的汇聚/爆炸脉冲：先 -dir·2.6 汇聚，再 +dir·11 爆开，
 *             爆炸段用 2.4 的强阻尼把能量吃掉，避免粒子无限加速。
 */
export const particleVelocityFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uMode;
uniform float uTime;
uniform float uDt;
uniform float uLevel;
uniform float uInit;
uniform float uMouseForce;
uniform float uAudioSpeed;
uniform float uAudioPush;
uniform float uMaxSpeed;
uniform vec3  uMouse;

varying vec2 vUv;

${HASH_GLSL}

vec3 fIdle(vec3 p, vec3 v, float ph, float t) {
  vec3 dir = normalize(p + vec3(1e-4, 1e-4, 1e-4));
  float breathe = 1.45 + 0.26 * sin(t * 0.5 + ph);   // 球壳半径呼吸
  vec3 goal = dir * breathe;
  float n = valueNoise3(p * 1.9 + vec3(0.0, t * 0.06, 0.0)) - 0.5;  // 表面细流
  goal += vec3(n, n * 0.6, -n) * 0.5;
  return (goal - p) * 2.4 - v * 1.5;                 // 阻尼弹簧
}

vec3 fVortex(vec3 p, vec3 v, float ph, float t) {
  float r = length(p.xz) + 1e-3;
  vec3 tang = vec3(-p.z, 0.0, p.x) / r;              // 绕 Y 轴的单位切向
  vec3 f = tang * (3.1 / (0.55 + r));                // 内快外慢
  f -= vec3(p.x, 0.0, p.z) / r * ((r - 1.15) * 1.6); // 径向约束成环
  f.y += -p.y * 1.4 - v.y * 1.1;                     // 竖向压扁成盘
  float az = atan(p.z, p.x);
  f += tang * 0.85 * sin(az * 3.0 - t * 0.9 + ph * 0.15); // 3 条螺旋臂
  return f - v * 0.45;
}

vec3 fTurbulence(vec3 p, vec3 v, float ph, float t) {
  vec3 q = p * 0.95 + vec3(0.0, 0.0, t * 0.13);
  vec3 f = vec3(
    sin(q.y) + cos(q.z * 0.7),
    sin(q.z) + cos(q.x * 0.7),
    sin(q.x) + cos(q.y * 0.7)
  );
  f *= 1.1 + valueNoise3(q * 1.6 + vec3(0.0, t * 0.05, 0.0));
  f -= p * 0.5;                                      // 轻弹簧，防止整体飘走
  return f - v * 0.55;
}

vec3 fPulse(vec3 p, vec3 v, float ph, float t) {
  float k = fract(t / 6.4 + ph * 0.013);             // 每颗粒子相位略错开 → 脉冲边界是波浪形
  vec3 dir = normalize(p + vec3(1e-4, 1e-4, 1e-4));
  float conv = smoothstep(0.05, 0.42, k) * (1.0 - smoothstep(0.42, 0.5, k)); // 汇聚
  float burst = smoothstep(0.5, 0.62, k) * (1.0 - smoothstep(0.62, 0.9, k)); // 爆炸
  vec3 f = dir * (-2.6 * conv + 11.0 * burst);
  return f - v * (0.6 + 2.4 * burst);                // 爆炸段强阻尼
}

// 模式权重：uMode 的整数部分是"当前模式"，小数部分是过渡进度 s。
// 权重 = 当前模式 (1-s) + 下一个模式 s，用 smoothstep 整形，因此任意时刻权重和恒为 1
// （线性混合不会造成能量的额外注入/丢失）。
vec4 modeWeights(float m) {
  float a = floor(m);
  float s = smoothstep(0.0, 1.0, m - a);
  vec4 w = vec4(0.0, 0.0, 0.0, 0.0);
  // 权重表：整数部分 a = 当前模式（拿 1-s），a+1 = 下一个模式（拿 s），其余为 0。
  // a = 3 且 s ∈ (0,1) 时是「模式 3 → 模式 0」的回绕，此时 w.x 拿 s，所以 w.x 还要判 a > 2.5。
  // 这样任意 m ∈ [0,4) 权重和恒为 1：线性混合不会额外注入/丢失能量。
  w.x = (a < 0.5) ? (1.0 - s) : ((a > 2.5) ? s : 0.0);
  w.y = (a < 0.5) ? s : ((a < 1.5) ? (1.0 - s) : 0.0);
  // （w.y / w.z / w.w 的表见上）
  w.z = (a < 0.5) ? 0.0 : ((a < 1.5) ? s : ((a < 2.5) ? (1.0 - s) : 0.0));
  w.w = (a < 1.5) ? 0.0 : ((a < 2.5) ? s : ((a < 3.5) ? (1.0 - s) : 0.0));
  // 兜底：a ∈ {0,1,2,3}，权重和必为 1；这里不再归一化以避免除零风险
  return w;
}

void main() {
  // 初始化步：速度全部置零（位置由 position pass 程序化生成）
  if (uInit > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 p = texture2D(uPos, vUv).xyz;
  vec3 v = texture2D(uVel, vUv).xyz;

  // NaN / Inf 防护：一旦速度出现 NaN 会永久留在纹理里（NaN 比较恒为 false，
  // 所以用 !(x < big) 这种写法在 GLSL1 / GLSL3 下都能捕获）。
  if (!(dot(v, v) < 1e30)) v = vec3(0.0);
  if (!(dot(p, p) < 1e30)) p = vec3(0.0);

  float ph = hash21(vUv * 13.37) * 6.2831853;
  vec4 w = modeWeights(uMode);
  vec3 acc = w.x * fIdle(p, v, ph, uTime)
           + w.y * fVortex(p, v, ph, uTime)
           + w.z * fTurbulence(p, v, ph, uTime)
           + w.w * fPulse(p, v, ph, uTime);

  // 光标：世界空间里的吸引/排斥点。衰减用 1/(r²+ε)（比 1/r² 更稳，近距离不会爆掉），
  // uMouseForce 有符号：>0 吸引，<0 排斥。
  vec3 md = uMouse - p;
  float mr2 = dot(md, md) + 0.35;
  acc += normalize(md + vec3(1e-4, 1e-4, 1e-4)) * (uMouseForce / mr2);

  // 音频联动：uLevel 已在 JS 侧做过指数平滑（不会跳变），这里只做线性映射
  float drive = 1.0 + uLevel * uAudioSpeed;          // 速度倍率
  v += acc * uDt * drive;
  v += normalize(p + vec3(1e-4, 1e-4, 1e-4)) * (uLevel * uAudioPush) * uDt; // 径向膨胀

  float sp = length(v);
  if (sp > uMaxSpeed) v *= uMaxSpeed / sp;

  gl_FragColor = vec4(v, 1.0);
}
`;

/**
 * 位置 pass：p' = p + v'·dt。
 * 初始化时用 hash 程序化生成「球体内均匀分布」：方向按球坐标取 cosθ 均匀（球面均匀），
 * 半径取 pow(u, 1/3)（体积均匀），避免粒子在球心处堆积。
 */
export const particlePositionFragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uInit;
uniform float uDt;
uniform float uSpread;
uniform float uMaxRadius;

varying vec2 vUv;

${HASH_GLSL}

void main() {
  if (uInit > 0.5) {
    float u1 = hash21(vUv * 3.17 + 11.3);
    float u2 = hash21(vUv * 5.71 + 27.7);
    float u3 = hash21(vUv * 7.13 + 41.1);
    float cosT = u2 * 2.0 - 1.0;
    float sinT = sqrt(max(0.0, 1.0 - cosT * cosT));
    float phi = u3 * 6.2831853;
    vec3 dir = vec3(sinT * cos(phi), cosT, sinT * sin(phi));
    float r = uSpread * pow(u1, 0.3333333);
    gl_FragColor = vec4(dir * r, 1.0);
    return;
  }

  vec3 p = texture2D(uPos, vUv).xyz;
  vec3 v = texture2D(uVel, vUv).xyz;
  if (!(dot(p, p) < 1e30)) p = vec3(0.0);
  if (!(dot(v, v) < 1e30)) v = vec3(0.0);

  p += v * uDt;

  // 安全网：被推到很远的粒子拉回球内一点点，避免飞出视锥或长期累积成异常值
  float r = length(p);
  if (r > uMaxRadius) p *= (uMaxRadius / r) * 0.85;

  gl_FragColor = vec4(p, 1.0);
}
`;

/**
 * 绘制 pass 顶点着色器：用 aRef 从模拟纹理里取自己的位置/速度。
 * 没有真实的历史轨迹，所以"运动模糊"用点径与透明度随速度变化来近似（见报告）。
 */
export const particleVertexShader = /* glsl */ `
precision highp float;

uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uSize;
uniform float uFocal;
uniform float uPixelRatio;
uniform float uLevel;

attribute vec2 aRef;   // 该粒子对应的模拟纹理 uv

varying float vSpeed;
varying float vSeed;
varying float vAlpha;

${HASH_GLSL}

void main() {
  vec3 p = texture2D(uPos, aRef).xyz;
  vec3 v = texture2D(uVel, aRef).xyz;
  float speed = length(v);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float seed = hash21(aRef * 91.7);
  vSpeed = speed;
  vSeed = seed;

  // gl_PointSize 不会自动做透视缩放，这里手写：size·focal/视距。
  // uFocal / uPixelRatio 的约定与 three 内置 Points 一致（uFocal 是 CSS 像素的焦距，
  // shader 里乘 uPixelRatio 才是设备像素的 gl_PointSize）。
  float sizeWorld = uSize * (0.6 + 0.8 * seed) * (1.0 + speed * 0.16 + uLevel * 0.45);
  float sizePx = sizeWorld * uFocal / max(-mv.z, 0.05);
  gl_PointSize = clamp(sizePx * uPixelRatio, 1.0, 12.0 * uPixelRatio);

  // 速度越快越"虚"，配合加法混合形成柔和的拖尾观感
  vAlpha = clamp(1.0 - speed * 0.03, 0.28, 1.0) * (0.75 + 0.25 * uLevel);
}
`;

/** 绘制 pass 片段着色器：圆形软点 + 速度/随机色相，加法混合 */
export const particleFragmentShader = /* glsl */ `
precision highp float;

uniform float uLevel;
uniform float uIntensity;
uniform vec3 uColorBase;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying float vSpeed;
varying float vSeed;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c);
  if (d2 > 0.25) discard;                  // 裁成圆点（方形点会显得很"像素"）
  float falloff = 1.0 - d2 * 4.0;          // d2: 0→中心, 0.25→边缘

  // 速度越高越偏青/品红，静止时是近白色（参考站的配色逻辑）
  float k = clamp(vSpeed * 0.13, 0.0, 1.0);
  vec3 col = mix(uColorBase, mix(uColorA, uColorB, fract(vSeed * 5.7)), k);
  col *= 0.6 + 0.9 * uLevel + 0.5 * falloff;

  // 加法混合下 out = rgb * a，所以亮度统一乘在 rgb 上、柔边只放进 alpha
  gl_FragColor = vec4(col * uIntensity, falloff * vAlpha);
}
`;
