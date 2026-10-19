export type SfxName =
  | 'step'
  | 'jump'
  | 'jump2'
  | 'slide'
  | 'belly'
  | 'hit'
  | 'bottle'
  | 'dodge'
  | 'boost'
  | 'milestone'
  | 'impact'
  | 'ui'
  | 'lane'
  | 'chaserWarn';

const MASTER_GAIN = 0.55;
const CLIP_GAIN = 0.85;

// BGM：96bpm、4/4、8 小节循环；STEP 是八分音符时长
const BGM_BASE_BPM = 96;
const BGM_BEAT = 60 / BGM_BASE_BPM;
const BGM_STEP = BGM_BEAT / 2;
const BGM_GAIN = 0.5;
const BGM_LOOKAHEAD = 0.5;
const BGM_INTERVAL_MS = 200;
// 8 小节和弦进行：C Am F G C Am F G
const BGM_CHORDS: ReadonlyArray<readonly number[]> = [
  [261.63, 329.63, 392.0, 523.25],
  [220.0, 261.63, 329.63, 440.0],
  [220.0, 261.63, 349.23, 440.0],
  [196.0, 246.94, 293.66, 392.0],
];
const BGM_BASS_ROOTS = [130.81, 110.0, 87.31, 98.0];
const BGM_BASS_FIFTHS = [196.0, 164.81, 130.81, 146.83];
const BGM_ARP = [0, 2, 1, 3, 2, 1, 2, 3];

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 音频总线：合成音效 + 台词/笑声片段。
 * 片段播放用 Promise（等 ended 再推进演出），音频不可用时用兜底时长，保证演出不会卡住。
 * 浏览器自动播放策略：AudioContext 只在首次真实交互后创建/恢复。
 */
export class AudioBus {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly clips = new Map<string, AudioBuffer>();
  private clipSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgm: { timer: number; nextTime: number; step: number } | null = null;
  private bgmRate = 1;
  private lastChaserWarnAt = Number.NEGATIVE_INFINITY;
  private readonly counts = new Map<string, number>();
  private skipNoted = false;
  unlocked = false;

  /** 设置里改音量：sfx/voice/bgm 各自 0..1（master 为 0 时全部静音） */
  setVolumes(sfx: number, voice: number, bgm: number): void {
    this.volumeSfx = sfx;
    this.volumeVoice = voice;
    this.volumeBgm = bgm;
    if (this.sfxBus) this.sfxBus.gain.value = Math.max(0, Math.min(1, sfx));
    const context = this.context;
    if (this.bgmGain && context) {
      this.bgmGain.gain.setTargetAtTime(Math.max(0, Math.min(1, bgm)) * BGM_GAIN, context.currentTime, 0.05);
    }
  }

  private volumeSfx = 0.8;
  private volumeVoice = 0.9;
  private volumeBgm = 0.6;

  get state(): string {
    return this.context ? this.context.state : 'closed';
  }

  /** 首次用户交互后调用；可重复调用。 */
  unlock(): void {
    this.unlocked = true;
    if (!this.context) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        console.warn('[audio] 该浏览器没有 AudioContext，静音运行');
        return;
      }
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(this.context.destination);

      this.sfxBus = this.context.createGain();
      this.sfxBus.gain.value = 1;
      this.sfxBus.connect(this.master);

      this.noise = this.createNoiseBuffer(this.context);
      console.log('[audio] AudioContext 已创建');
    }
    if (this.context.state === 'suspended') {
      const context = this.context;
      void context.resume().then(() => console.log('[audio] AudioContext 已 resume，state=' + context.state));
    }
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = Math.floor(context.sampleRate * 0.5);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private tick(name: string): void {
    const count = (this.counts.get(name) ?? 0) + 1;
    this.counts.set(name, count);
    if (count <= 3) console.log(`[audio] play ${name} (#${count})`);
  }

  private get ready(): boolean {
    return this.context !== null && this.sfxBus !== null && this.context.state === 'running';
  }

  play(name: SfxName): void {
    this.tick(name);
    if (!this.ready) {
      if (!this.skipNoted) {
        this.skipNoted = true;
        console.log(`[audio] ${name} 被跳过：音频尚未解锁（等待首次用户交互）`);
      }
      return;
    }
    const context = this.context as AudioContext;
    const bus = this.sfxBus as GainNode;
    const now = context.currentTime;

    if (name === 'chaserWarn') {
      // 1.1s 内重复触发直接忽略，避免连续逼近时高频轰炸
      if (now - this.lastChaserWarnAt < 1.1) return;
      this.lastChaserWarnAt = now;
    }

    if (name === 'step') {
      this.noiseBurst(context, bus, now, 0.09, 1400, 0.1);
    } else if (name === 'jump') {
      this.tone(context, bus, now, 'sine', 300, 660, 0.16, 0.16);
    } else if (name === 'jump2') {
      // 二段跳：比一段高 1.5 倍、更短
      this.tone(context, bus, now, 'sine', 450, 990, 0.11, 0.15);
    } else if (name === 'lane') {
      // 换道 whoosh：窄带噪声扫频 + 轻微音高下坠
      this.noiseBandSweep(context, bus, now, 0.12, 2600, 700, 2.8, 0.13);
      this.tone(context, bus, now, 'sine', 520, 360, 0.12, 0.07);
    } else if (name === 'chaserWarn') {
      // 两次低频心跳 + 短噪声"吠"
      this.tone(context, bus, now, 'sine', 82, 52, 0.15, 0.3);
      this.tone(context, bus, now + 0.17, 'sine', 82, 52, 0.15, 0.3);
      this.noiseBurst(context, bus, now + 0.05, 0.09, 460, 0.16);
    } else if (name === 'slide') {
      // 长噪声摩擦 + 低频起伏
      this.noiseSweep(context, bus, now, 0.38, 1800, 180, 0.14);
      this.tone(context, bus, now, 'triangle', 130, 85, 0.36, 0.08);
    } else if (name === 'belly') {
      // 更闷更长：低频更多、时长更长
      this.noiseSweep(context, bus, now, 0.62, 700, 95, 0.18);
      this.tone(context, bus, now, 'triangle', 165, 105, 0.58, 0.12);
    } else if (name === 'hit') {
      this.tone(context, bus, now, 'square', 120, 48, 0.32, 0.32);
      this.noiseBurst(context, bus, now, 0.24, 700, 0.26);
    } else if (name === 'bottle') {
      this.tone(context, bus, now, 'triangle', 880, 1420, 0.1, 0.18);
      this.tone(context, bus, now + 0.03, 'triangle', 1320, 1760, 0.07, 0.1);
    } else if (name === 'dodge') {
      this.noiseBurst(context, bus, now, 0.06, 2600, 0.12);
      this.tone(context, bus, now, 'square', 660, 990, 0.05, 0.06);
    } else if (name === 'boost') {
      this.tone(context, bus, now, 'sine', 523, 523, 0.12, 0.16);
      this.tone(context, bus, now + 0.1, 'sine', 659, 659, 0.12, 0.16);
      this.tone(context, bus, now + 0.2, 'sine', 784, 784, 0.18, 0.18);
    } else if (name === 'impact') {
      this.tone(context, bus, now, 'square', 150, 40, 0.22, 0.34);
      this.noiseBurst(context, bus, now, 0.18, 420, 0.3);
    } else if (name === 'milestone') {
      this.tone(context, bus, now, 'sine', 784, 784, 0.14, 0.14);
      this.tone(context, bus, now + 0.13, 'sine', 1046, 1046, 0.2, 0.14);
    } else {
      this.tone(context, bus, now, 'sine', 660, 660, 0.08, 0.12);
    }
  }

  /**
   * 播放一段素材（台词 / 笑声），返回的 Promise 在 ended 时 resolve。
   * 音频不可用或素材加载失败时，用 fallbackSeconds 兜底，保证演出流程不会卡住。
   */
  async playClip(url: string, fallbackSeconds: number): Promise<void> {
    this.tick('clip:' + url.split('/').pop());
    const context = this.context;
    const bus = this.sfxBus;
    if (!context || !bus || context.state !== 'running') {
      await delay(fallbackSeconds * 1000);
      return;
    }

    let buffer = this.clips.get(url);
    if (!buffer) {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}${url}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        this.clips.set(url, buffer);
      } catch (error) {
        console.warn(`[audio] 素材 ${url} 加载失败，用兜底时长 ${fallbackSeconds}s`, error);
        await delay(fallbackSeconds * 1000);
        return;
      }
    }

    const decoded = buffer;
    await new Promise<void>((resolve) => {
      const source = context.createBufferSource();
      source.buffer = decoded;
      const gain = context.createGain();
      gain.gain.value = CLIP_GAIN * Math.max(0, Math.min(1, this.volumeSfx)) * 0.9 + CLIP_GAIN * Math.max(0, Math.min(1, this.volumeVoice)) * 0.1;
      source.connect(gain).connect(bus);
      source.onended = () => {
        if (this.clipSource === source) this.clipSource = null;
        resolve();
      };
      this.clipSource = source;
      source.start();
    });
  }

  /** 跳过演出时切断当前片段（会触发 ended，让挂起的 Promise 收尾） */
  stopClip(): void {
    const source = this.clipSource;
    if (!source) return;
    this.clipSource = null;
    try {
      source.stop();
    } catch {
      /* 已经停了 */
    }
  }

  /** game.ts 的 dispose 仍会调用；场景低音已随 BGM 改造移除，保留兼容空实现 */
  stopDrone(): void {
    /* 无操作 */
  }

  startBgm(): void {
    const context = this.context;
    if (!context || !this.master || this.bgm) return;
    if (!this.bgmGain) {
      this.bgmGain = context.createGain();
      this.bgmGain.connect(this.master);
    }
    const now = context.currentTime;
    this.bgmGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setValueAtTime(0.0001, now);
    this.bgmGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, Math.max(0, Math.min(1, this.volumeBgm)) * BGM_GAIN), now + 0.1);
    this.bgm = {
      timer: window.setInterval(() => this.scheduleBgm(), BGM_INTERVAL_MS),
      nextTime: now + 0.15,
      step: 0,
    };
    this.scheduleBgm();
  }

  stopBgm(): void {
    const context = this.context;
    const bgm = this.bgm;
    if (!bgm) return;
    this.bgm = null;
    window.clearInterval(bgm.timer);
    if (context && this.bgmGain) {
      const now = context.currentTime;
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(Math.max(0.0001, this.bgmGain.gain.value), now);
      this.bgmGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    }
  }

  setBgmRate(scale: number): void {
    // 难度只约定这三档，其余忽略
    if (scale !== 0.9 && scale !== 1 && scale !== 1.1) return;
    this.bgmRate = scale;
  }

  private scheduleBgm(): void {
    const context = this.context;
    const bgm = this.bgm;
    const gain = this.bgmGain;
    if (!context || !bgm || !gain || context.state !== 'running') return;
    const horizon = context.currentTime + BGM_LOOKAHEAD;
    if (bgm.nextTime < context.currentTime - 0.1) {
      // 后台卡顿后不追赶补一坨音，直接从当前点续上
      bgm.nextTime = context.currentTime + 0.1;
    }
    while (bgm.nextTime < horizon) {
      this.scheduleBgmStep(context, gain, bgm.nextTime, bgm.step);
      bgm.nextTime += BGM_STEP / this.bgmRate;
      bgm.step = (bgm.step + 1) % 64;
    }
  }

  private scheduleBgmStep(context: AudioContext, destination: AudioNode, at: number, step: number): void {
    const bar = Math.floor(step / 8) % 8;
    const s = step % 8;
    const chord = BGM_CHORDS[bar % 4];
    // 尤克里里拨弦：每个八分音符拨一个和弦音
    this.tone(context, destination, at, 'triangle', chord[BGM_ARP[s]], chord[BGM_ARP[s]], 0.26, 0.09);
    // 沙锤：落在第 2/4 拍
    if (s === 2 || s === 6) this.noiseBurst(context, destination, at, 0.05, 5200, 0.045);
    // 轻贝斯：第 1 拍根音、第 3 拍五音
    if (s === 0) this.tone(context, destination, at, 'sine', BGM_BASS_ROOTS[bar % 4], BGM_BASS_ROOTS[bar % 4], 0.5, 0.14);
    if (s === 4) this.tone(context, destination, at, 'sine', BGM_BASS_FIFTHS[bar % 4], BGM_BASS_FIFTHS[bar % 4], 0.4, 0.1);
    // 偶发口哨：第 4/8 小节末的正弦滑音
    if ((bar === 3 || bar === 7) && s === 6) this.tone(context, destination, at, 'sine', 659.25, 783.99, 0.34, 0.05);
  }

  summary(): string {
    if (this.counts.size === 0) return 'sfx=0';
    return [...this.counts.entries()].map(([name, count]) => `${name}:${count}`).join(' ');
  }

  private tone(
    context: AudioContext,
    destination: AudioNode,
    at: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    peak: number,
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.02, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private noiseBurst(
    context: AudioContext,
    destination: AudioNode,
    at: number,
    duration: number,
    frequency: number,
    peak: number,
  ): void {
    if (!this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1.2;
    const gain = context.createGain();
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(destination);
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  private noiseSweep(
    context: AudioContext,
    destination: AudioNode,
    at: number,
    duration: number,
    fromHz: number,
    toHz: number,
    peak: number,
  ): void {
    if (!this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(fromHz, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, toHz), at + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(destination);
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  private noiseBandSweep(
    context: AudioContext,
    destination: AudioNode,
    at: number,
    duration: number,
    fromHz: number,
    toHz: number,
    q: number,
    peak: number,
  ): void {
    if (!this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(fromHz, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, toHz), at + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(destination);
    source.start(at);
    source.stop(at + duration + 0.02);
  }
}
