'use client';

/**
 * 程序化音频引擎（Web Audio API）。
 *
 * 为什么不用音频文件：参考站的音轨是运行时合成的，没有外部素材；
 * 而且合成器意味着零网络请求、零解码延迟，音量/音高可以跟着交互实时变化。
 *
 * 浏览器策略：AudioContext 必须在用户手势之后才能出声，
 * 所以这里所有「启动」入口都只可能被真实点击/按键触发（Preloader 的 CLICK TO ENTER、
 * Header 的 SOUND、设置面板里的切换）。任何自动播放路径都不存在。
 *
 * 对外契约（其他 agent 依赖，不要改名字）：
 *   TRACKS / startAudio / stopAudio / setTrack / getAnalyser / getLevel / playUiSound
 */

export type UiSoundKind = 'click' | 'pop' | 'slide';

export type AudioTrack = {
  id: string;
  label: string;
  /** 每分钟节拍数；0 表示无节拍（持续氛围） */
  bpm: number;
  /** 面板里显示的一句说明 */
  blurb: string;
};

export const TRACKS: AudioTrack[] = [
  { id: 'ambient', label: '氛围漂移', bpm: 0, blurb: '低频氛围床，无节拍' },
  { id: 'digital-minimalism', label: '数字极简', bpm: 96, blurb: '稀疏脉冲与低频铺底' },
  { id: 'retro', label: '复古琶音', bpm: 118, blurb: '合成器琶音 + 反馈延迟' },
];

export const DEFAULT_TRACK_ID = TRACKS[0].id;

/** 模块级单例：一个页面只允许一个 AudioContext（多开会互相打架且数量受限） */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let uiBus: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;

let activeTrack: string | null = null;
let teardown: Array<() => void> = [];
let stopTimer: number | null = null;
let levelSmooth = 0;

/** 主音量上限：氛围类音轨容易盖过页面其余声音，参考站整体音量也很克制 */
const MASTER_LEVEL = 0.5;
const UI_BUS_LEVEL = 0.32;

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

function stopSource(node: AudioScheduledSourceNode): void {
  // 已经 stop 过的节点再 stop 会抛错，这里吞掉即可（清理路径不应该因为重复调用而崩）
  try {
    node.stop();
  } catch {
    /* noop */
  }
}

/** 懒创建音频图：sources → master → analyser → destination */
function ensureGraph(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx && master && analyser && uiBus) return ctx;

  const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctor) return null;

  const c = new Ctor();
  const m = c.createGain();
  m.gain.value = 0; // 从 0 淡入，避免第一帧的爆音

  const a = c.createAnalyser();
  a.fftSize = 512;
  a.smoothingTimeConstant = 0.82;
  a.minDecibels = -90;
  a.maxDecibels = -10;

  const ui = c.createGain();
  ui.gain.value = UI_BUS_LEVEL;

  m.connect(a);
  ui.connect(a);
  a.connect(c.destination);

  ctx = c;
  master = m;
  analyser = a;
  uiBus = ui;
  freqData = new Uint8Array(a.frequencyBinCount);

  return c;
}

/** 一段白噪循环，用作氛围床与打击乐器的音源（比生成很多短 buffer 更省内存） */
function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(c.sampleRate * 2);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

type ToneOptions = {
  freq: number;
  /** 频率滑向的目标值（滑音/打击乐用） */
  toFreq?: number;
  type: OscillatorType;
  gain: number;
  duration: number;
  /** 相对于 currentTime 的延迟秒数（步进音序器排程用） */
  delay?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
  destination: AudioNode;
};

/** 一个带 ADSR 雏形的单音：8ms 起音 + 指数衰减，够用且不会有咔哒声 */
function tone(c: AudioContext, o: ToneOptions): void {
  const at = c.currentTime + Math.max(0, o.delay ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, at);
  if (o.toFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.toFreq), at + o.duration);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(o.gain, at + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, at + o.duration);

  let head: AudioNode = osc;
  osc.connect(env);
  head = env;

  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.value = o.filter.freq;
    if (o.filter.q !== undefined) f.Q.value = o.filter.q;
    head.connect(f);
    head = f;
  }

  head.connect(o.destination);
  osc.start(at);
  osc.stop(at + o.duration + 0.06);
  // 节点在 stop 之后由 GC 回收，但显式断开可以让图保持干净（长会话下很重要）
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
}

/** 噪声型打击/质感声（hi-hat、气流） */
function noiseHit(
  c: AudioContext,
  destination: AudioNode,
  opts: { delay?: number; duration: number; gain: number; type: BiquadFilterType; freq: number; q?: number },
): void {
  const at = c.currentTime + Math.max(0, opts.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer(c);
  src.loop = true;

  const f = c.createBiquadFilter();
  f.type = opts.type;
  f.frequency.value = opts.freq;
  if (opts.q !== undefined) f.Q.value = opts.q;

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(opts.gain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + opts.duration);

  src.connect(f);
  f.connect(env);
  env.connect(destination);
  src.start(at);
  src.stop(at + opts.duration + 0.02);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    env.disconnect();
  };
}

/** kick：从 150Hz 迅速滑到 45Hz 的正弦，靠音高下坠做出"砰"的感觉 */
function kick(c: AudioContext, destination: AudioNode, delay: number): void {
  tone(c, { freq: 150, toFreq: 45, type: 'sine', gain: 0.28, duration: 0.28, delay, destination });
}

/**
 * 十六分音符步进器。
 * 用 setInterval 而不是 AudioWorklet：音序只做「触发」不做「音频计算」，
 * 抖动被排程提前量（+30ms）吸收，听感上足够稳，而且清理只要 clearInterval。
 */
function startSequencer(bpm: number, steps: number, cb: (step: number, at: number) => void): () => void {
  const stepMs = (60 / bpm / 4) * 1000;
  let step = 0;
  const id = window.setInterval(() => {
    const c = ctx;
    if (!c || c.state !== 'running') return;
    cb(step % steps, c.currentTime + 0.03);
    step += 1;
  }, stepMs);
  return () => window.clearInterval(id);
}

/** 低频持续氛围：三个失谐振荡器 + 噪声垫，滤波截止频率被 0.045Hz 的 LFO 缓慢扫动 */
function buildAmbient(c: AudioContext, out: AudioNode): Array<() => void> {
  const locals: Array<() => void> = [];

  const bus = c.createGain();
  bus.gain.value = 0.9;
  bus.connect(out);
  locals.push(() => bus.disconnect());

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 360;
  lp.Q.value = 5;
  lp.connect(bus);
  locals.push(() => lp.disconnect());

  const voices: Array<{ freq: number; type: OscillatorType; gain: number }> = [
    { freq: 55, type: 'triangle', gain: 0.5 },
    { freq: 82.4, type: 'sawtooth', gain: 0.15 },
    { freq: 110.6, type: 'sawtooth', gain: 0.08 },
  ];
  voices.forEach(({ freq, type, gain }) => {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(lp);
    osc.start();
    locals.push(() => {
      stopSource(osc);
      osc.disconnect();
      g.disconnect();
    });
  });

  // 噪声垫：经过低通的噪声听起来像"空气"，让氛围层不显得是纯电子音
  const air = c.createBufferSource();
  air.buffer = getNoiseBuffer(c);
  air.loop = true;
  const airLp = c.createBiquadFilter();
  airLp.type = 'lowpass';
  airLp.frequency.value = 900;
  const airGain = c.createGain();
  airGain.gain.value = 0.035;
  air.connect(airLp);
  airLp.connect(airGain);
  airGain.connect(bus);
  air.start();
  locals.push(() => {
    stopSource(air);
    air.disconnect();
    airLp.disconnect();
    airGain.disconnect();
  });

  // 滤波器扫动 LFO
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.045;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 240;
  lfo.connect(lfoGain);
  lfoGain.connect(lp.frequency);
  lfo.start();
  locals.push(() => {
    stopSource(lfo);
    lfo.disconnect();
    lfoGain.disconnect();
  });

  return locals;
}

/** 数字极简：稀疏的方波脉冲 + 低频铺底，留白比声音更重要 */
function buildPulse(c: AudioContext, out: AudioNode): Array<() => void> {
  const locals: Array<() => void> = [];

  const sub = c.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 55;
  const subGain = c.createGain();
  subGain.gain.value = 0.2;
  sub.connect(subGain);
  subGain.connect(out);
  sub.start();
  locals.push(() => {
    stopSource(sub);
    sub.disconnect();
    subGain.disconnect();
  });

  const pattern = [1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
  const notes = [440, 523.25, 587.33, 659.25];

  locals.push(
    startSequencer(96, pattern.length, (step, at) => {
      const delay = at - c.currentTime;
      if (pattern[step]) {
        tone(c, {
          freq: notes[(step * 3) % notes.length],
          type: 'square',
          gain: 0.045,
          duration: 0.12,
          delay,
          filter: { type: 'bandpass', freq: 1500, q: 1.1 },
          destination: out,
        });
      }
      if (step % 8 === 4) {
        noiseHit(c, out, { delay, duration: 0.09, gain: 0.02, type: 'highpass', freq: 5200 });
      }
    }),
  );

  return locals;
}

/** 复古合成器琶音：三角波琶音 + 反馈延迟 + 底鼓/踩镲，延迟本身就是这台"机器"的性格 */
function buildRetro(c: AudioContext, out: AudioNode): Array<() => void> {
  const locals: Array<() => void> = [];

  const echo = c.createDelay(0.8);
  echo.delayTime.value = 0.255;
  const feedback = c.createGain();
  feedback.gain.value = 0.34;
  const echoOut = c.createGain();
  echoOut.gain.value = 0.4;
  echo.connect(feedback);
  feedback.connect(echo);
  echo.connect(echoOut);
  echoOut.connect(out);
  locals.push(() => {
    echo.disconnect();
    feedback.disconnect();
    echoOut.disconnect();
  });

  const arp = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 196.0];
  const loop = c.createBiquadFilter();
  loop.type = 'lowpass';
  loop.frequency.value = 2600;
  loop.connect(out);
  locals.push(() => loop.disconnect());

  locals.push(
    startSequencer(118, arp.length, (step, at) => {
      const delay = at - c.currentTime;
      tone(c, {
        freq: arp[step],
        type: 'triangle',
        gain: 0.05,
        duration: 0.22,
        delay,
        destination: loop,
      });
      // 影子音只进延迟线，制造"回声跟着走"的空间感
      tone(c, { freq: arp[step] * 2, type: 'triangle', gain: 0.02, duration: 0.16, delay, destination: echo });
      if (step === 0 || step === 4) kick(c, out, delay);
      if (step % 2 === 1) {
        noiseHit(c, out, { delay, duration: 0.05, gain: 0.018, type: 'highpass', freq: 6800 });
      }
    }),
  );

  return locals;
}

function buildTrack(c: AudioContext, out: AudioNode, trackId: string): Array<() => void> {
  switch (trackId) {
    case 'digital-minimalism':
      return buildPulse(c, out);
    case 'retro':
      return buildRetro(c, out);
    case 'ambient':
    default:
      return buildAmbient(c, out);
  }
}

function releaseVoices(): void {
  const fns = teardown;
  teardown = [];
  fns.forEach((fn) => fn());
}

/**
 * 启动（或切换）音轨。
 * 幂等：同一音轨重复调用不会叠加——Providers / Preloader / 按钮可能在同一帧里都调它。
 */
export function startAudio(trackId: string = DEFAULT_TRACK_ID): void {
  const c = ensureGraph();
  if (!c || !master) return;

  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }

  if (activeTrack === trackId && teardown.length > 0 && c.state === 'running') return;

  releaseVoices();
  // resume 只能在用户手势里成功；失败也不抛，静默降级为"无声但页面正常"
  void c.resume().catch(() => undefined);

  const now = c.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(MASTER_LEVEL, now, 0.8);

  teardown = buildTrack(c, master, trackId);
  activeTrack = trackId;
}

/** 停止并淡出（保留 AudioContext 以便下次秒开；挂起状态几乎不耗电） */
export function stopAudio(): void {
  const c = ctx;
  if (!c || !master) return;
  releaseVoices();
  activeTrack = null;
  levelSmooth = 0;

  const now = c.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(0, now, 0.15);

  if (stopTimer !== null) window.clearTimeout(stopTimer);
  stopTimer = window.setTimeout(() => {
    stopTimer = null;
    if (ctx && ctx === c && !activeTrack && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
  }, 400);
}

/** 换轨：只有在正在播放时才真的重启音轨，否则等下一次 startAudio */
export function setTrack(trackId: string): void {
  if (activeTrack === trackId) return;
  if (activeTrack) {
    startAudio(trackId);
    return;
  }
  activeTrack = null;
}

export function getAnalyser(): AnalyserNode | null {
  return analyser;
}

/**
 * 0–1 的响度读数，供 WebGL 粒子做音频联动。
 * 取频谱数据（不是波形）的平均值再乘因子——频谱均值对人耳感受更接近"能量"。
 * 内部做了单极点平滑，避免粒子跟着每一帧抖。
 */
export function getLevel(): number {
  if (!analyser || !freqData || !ctx || ctx.state !== 'running') {
    levelSmooth *= 0.9;
    return levelSmooth;
  }
  analyser.getByteFrequencyData(freqData);
  let sum = 0;
  for (let i = 0; i < freqData.length; i += 1) sum += freqData[i];
  const mean = sum / freqData.length / 255;
  levelSmooth += (mean - levelSmooth) * 0.3;
  // 频谱均值本身很小（多数频段接近 0），乘一个增益让它落到可用的 0–1 区间
  return Math.min(1, levelSmooth * 2.4);
}

/**
 * UI 反馈音。
 * 只在引擎已经运行时发声——关掉声音后按钮不该继续响，这是"声音开关"的语义边界。
 */
export function playUiSound(kind: UiSoundKind): void {
  const c = ctx;
  if (!c || !uiBus || c.state !== 'running') return;

  switch (kind) {
    case 'click':
      tone(c, {
        freq: 1400,
        type: 'square',
        gain: 0.09,
        duration: 0.045,
        filter: { type: 'highpass', freq: 500 },
        destination: uiBus,
      });
      break;
    case 'pop':
      tone(c, { freq: 220, toFreq: 440, type: 'sine', gain: 0.14, duration: 0.12, destination: uiBus });
      break;
    case 'slide':
      tone(c, {
        freq: 900,
        toFreq: 240,
        type: 'triangle',
        gain: 0.1,
        duration: 0.2,
        filter: { type: 'lowpass', freq: 2200 },
        destination: uiBus,
      });
      break;
    default:
      break;
  }
}

/** 音频引擎当前是否真的在出声（供 HUD 指示用） */
export function isAudioRunning(): boolean {
  return Boolean(ctx && ctx.state === 'running' && activeTrack);
}
