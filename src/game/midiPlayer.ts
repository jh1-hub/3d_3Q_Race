export interface MidiNoteEvent {
  startSec: number;
  durationSec: number;
  channel: number;
  note: number;
  velocity: number;
  program: number;
  channelVolume: number;
}

export interface ParsedMidi {
  notes: MidiNoteEvent[];
  durationSec: number;
}

interface TempoEvent {
  tick: number;
  usPerQuarter: number;
}

interface RawMidiNote {
  startTick: number;
  endTick: number;
  channel: number;
  note: number;
  velocity: number;
  program: number;
  channelVolume: number;
}

function readVarLen(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let pos = offset;
  while (pos < bytes.length) {
    const b = bytes[pos++];
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return [value, pos];
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  );
}

export function parseStandardMidi(buffer: ArrayBuffer): ParsedMidi {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 14) {
    throw new Error('Invalid MIDI file: header too short');
  }
  const headerId = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (headerId !== 'MThd') {
    throw new Error('Invalid MIDI header');
  }
  const headerLen = readUint32BE(bytes, 4);
  const numTracks = readUint16BE(bytes, 10);
  const division = readUint16BE(bytes, 12);
  if ((division & 0x8000) !== 0) {
    throw new Error('SMPTE MIDI time division is not supported');
  }
  const ppq = Math.max(1, division);

  const tempos: TempoEvent[] = [{ tick: 0, usPerQuarter: 500000 }];
  const rawNotes: RawMidiNote[] = [];
  let maxEndTick = 0;

  let pos = 8 + headerLen;
  for (let t = 0; t < numTracks && pos + 8 <= bytes.length; t++) {
    const chunkId = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const chunkLen = readUint32BE(bytes, pos + 4);
    const trackStart = pos + 8;
    const trackEnd = Math.min(bytes.length, trackStart + chunkLen);
    pos = trackEnd;
    if (chunkId !== 'MTrk') continue;

    let p = trackStart;
    let tick = 0;
    let runningStatus = 0;
    const programs = new Array<number>(16).fill(80);
    const volumes = new Array<number>(16).fill(1);
    const activeNotes = new Map<number, { startTick: number; velocity: number; program: number; vol: number }>();

    while (p < trackEnd) {
      const [deltaTick, nextP] = readVarLen(bytes, p);
      tick += deltaTick;
      p = nextP;
      if (p >= trackEnd) break;

      let status = bytes[p];
      if (status < 0x80) {
        status = runningStatus;
      } else {
        p += 1;
        if (status < 0xf0) {
          runningStatus = status;
        }
      }

      if (status === 0xff) {
        if (p >= trackEnd) break;
        const metaType = bytes[p++];
        const [metaLen, metaStart] = readVarLen(bytes, p);
        p = metaStart;
        if (metaType === 0x51 && metaLen === 3 && p + 3 <= trackEnd) {
          const us = (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2];
          tempos.push({ tick, usPerQuarter: Math.max(1000, us) });
        }
        p = Math.min(trackEnd, p + metaLen);
      } else if (status === 0xf0 || status === 0xf7) {
        const [sysLen, sysStart] = readVarLen(bytes, p);
        p = Math.min(trackEnd, sysStart + sysLen);
      } else {
        const hi = status & 0xf0;
        const ch = status & 0x0f;
        if (hi === 0xc0) {
          if (p < trackEnd) programs[ch] = bytes[p++];
        } else if (hi === 0xd0) {
          if (p < trackEnd) p += 1;
        } else {
          if (p + 1 >= trackEnd) break;
          const d1 = bytes[p++];
          const d2 = bytes[p++];

          if (hi === 0xb0 && d1 === 7) {
            volumes[ch] = Math.max(0.1, d2 / 127);
          } else if (hi === 0x90 && d2 > 0) {
            const key = (ch << 8) | d1;
            const prev = activeNotes.get(key);
            if (prev) {
              rawNotes.push({
                startTick: prev.startTick,
                endTick: Math.max(prev.startTick + 1, tick),
                channel: ch,
                note: d1,
                velocity: prev.velocity,
                program: prev.program,
                channelVolume: prev.vol,
              });
            }
            activeNotes.set(key, {
              startTick: tick,
              velocity: d2 / 127,
              program: programs[ch],
              vol: volumes[ch],
            });
          } else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) {
            const key = (ch << 8) | d1;
            const prev = activeNotes.get(key);
            if (prev) {
              rawNotes.push({
                startTick: prev.startTick,
                endTick: Math.max(prev.startTick + 1, tick),
                channel: ch,
                note: d1,
                velocity: prev.velocity,
                program: prev.program,
                channelVolume: prev.vol,
              });
              activeNotes.delete(key);
            }
          }
        }
      }
    }

    for (const [key, prev] of activeNotes.entries()) {
      const ch = key >> 8;
      const note = key & 0xff;
      rawNotes.push({
        startTick: prev.startTick,
        endTick: Math.max(prev.startTick + ppq / 4, tick),
        channel: ch,
        note,
        velocity: prev.velocity,
        program: prev.program,
        channelVolume: prev.vol,
      });
    }

    if (tick > maxEndTick) maxEndTick = tick;
  }

  tempos.sort((a, b) => a.tick - b.tick);

  // Build cumulative time map across tempo changes
  const tempoSegments: { tick: number; sec: number; usPerQuarter: number }[] = [];
  let accSec = 0;
  let lastTick = 0;
  let lastUs = tempos[0].usPerQuarter;
  for (const tp of tempos) {
    if (tp.tick > lastTick) {
      accSec += ((tp.tick - lastTick) / ppq) * (lastUs / 1_000_000);
      lastTick = tp.tick;
    }
    lastUs = tp.usPerQuarter;
    tempoSegments.push({ tick: tp.tick, sec: accSec, usPerQuarter: lastUs });
  }

  const tickToSec = (targetTick: number): number => {
    let seg = tempoSegments[0];
    for (let i = 1; i < tempoSegments.length; i++) {
      if (tempoSegments[i].tick <= targetTick) {
        seg = tempoSegments[i];
      } else {
        break;
      }
    }
    return seg.sec + ((targetTick - seg.tick) / ppq) * (seg.usPerQuarter / 1_000_000);
  };

  // Quantize loop end to bar boundary if close so loops align cleanly on beat
  const ticksPerBar = ppq * 4;
  const roundedBars = Math.max(1, Math.round(maxEndTick / ticksPerBar));
  const loopEndTick =
    Math.abs(maxEndTick - roundedBars * ticksPerBar) <= ppq ? roundedBars * ticksPerBar : maxEndTick;
  const durationSec = Math.max(1, tickToSec(loopEndTick));

  const notes: MidiNoteEvent[] = rawNotes
    .map((n) => {
      const startSec = tickToSec(n.startTick);
      const endSec = Math.min(durationSec, tickToSec(n.endTick));
      return {
        startSec,
        durationSec: Math.max(0.03, endSec - startSec),
        channel: n.channel,
        note: n.note,
        velocity: n.velocity,
        program: n.program,
        channelVolume: n.channelVolume,
      };
    })
    .filter((n) => n.startSec < durationSec)
    .sort((a, b) => a.startSec - b.startSec);

  return { notes, durationSec };
}

function midiNoteToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class ChiptuneMidiPlayer {
  private ctx: AudioContext;
  private destination: AudioNode;
  private noiseBuffer: AudioBuffer;
  private midi: ParsedMidi | null = null;
  private playing = false;
  private timerId: number | null = null;
  private loopBaseTime = 0;
  private scheduledUntilOffset = 0;
  private noteCursor = 0;
  private activeStoppers = new Set<() => void>();

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
    this.noiseBuffer = this.createNoiseBuffer(ctx);
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate;
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  public setMidi(midi: ParsedMidi): void {
    this.midi = midi;
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public start(): void {
    if (!this.midi || this.midi.notes.length === 0 || this.playing) return;
    this.playing = true;
    this.loopBaseTime = this.ctx.currentTime + 0.04;
    this.scheduledUntilOffset = 0;
    this.noteCursor = 0;
    this.scheduleAhead();
    this.timerId = window.setInterval(() => this.scheduleAhead(), 50);
  }

  public stop(): void {
    this.playing = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    for (const stopFn of this.activeStoppers) {
      stopFn();
    }
    this.activeStoppers.clear();
  }

  private scheduleAhead(): void {
    if (!this.playing || !this.midi) return;
    const { notes, durationSec } = this.midi;
    const lookaheadEnd = this.ctx.currentTime - this.loopBaseTime + 0.24;

    while (this.scheduledUntilOffset < lookaheadEnd) {
      if (this.noteCursor >= notes.length) {
        // Advance smoothly to next loop iteration
        this.loopBaseTime += durationSec;
        this.scheduledUntilOffset = 0;
        this.noteCursor = 0;
        const nextWindow = this.ctx.currentTime - this.loopBaseTime + 0.24;
        if (nextWindow <= 0) break;
        continue;
      }

      const ev = notes[this.noteCursor];
      if (ev.startSec > lookaheadEnd) {
        this.scheduledUntilOffset = lookaheadEnd;
        break;
      }

      const when = this.loopBaseTime + ev.startSec;
      if (when >= this.ctx.currentTime - 0.03) {
        this.triggerNote(ev, Math.max(this.ctx.currentTime, when));
      }
      this.scheduledUntilOffset = ev.startSec;
      this.noteCursor += 1;
    }
  }

  private triggerNote(ev: MidiNoteEvent, when: number): void {
    if (ev.channel === 9) {
      this.triggerDrum(ev.note, ev.velocity * ev.channelVolume, when);
      return;
    }

    const ctx = this.ctx;
    const freq = midiNoteToFreq(ev.note);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    let filter: BiquadFilterNode | null = null;

    const ampBase = Math.min(0.22, ev.velocity * ev.channelVolume * 0.22);
    const dur = Math.min(ev.durationSec, 2.5);

    if (ev.program === 38 || ev.program === 39 || ev.channel <= 1) {
      // FM Motor Bass
      osc.type = ev.channel === 0 ? 'sawtooth' : 'square';
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(1800, freq * 4.5), when);
      filter.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 1.4), when + Math.min(dur, 0.22));
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(ampBase * 1.05, when + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.03);
    } else if (ev.program === 89 || ev.channel === 4) {
      // Stab / Pad Chords
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(ampBase * 0.65, when + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.06);
    } else if (ev.program === 81 || ev.channel === 5) {
      // Arcade Saw Lead
      osc.type = 'sawtooth';
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3400, when);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(ampBase * 0.72, when + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.04);
    } else if (ev.channel >= 6) {
      // FX / Impact
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, when);
      osc.frequency.exponentialRampToValueAtTime(Math.max(55, freq * 0.35), when + Math.min(dur, 0.45));
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(ampBase * 0.6, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.min(dur, 0.5));
    } else {
      // Chiptune Square Arp / Echo
      osc.type = 'square';
      const channelScale = ev.channel === 3 ? 0.36 : 0.62;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(ampBase * channelScale, when + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.025);
    }

    if (ev.channel < 6) {
      osc.frequency.setValueAtTime(freq, when);
    }

    if (filter) {
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(this.destination);

    const stopTime = when + dur + 0.08;
    const stopper = () => {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Ignore already-stopped nodes
      }
      this.activeStoppers.delete(stopper);
    };
    this.activeStoppers.add(stopper);
    osc.onended = () => {
      this.activeStoppers.delete(stopper);
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Ignore
      }
    };
    osc.start(when);
    osc.stop(stopTime);
  }

  private triggerDrum(note: number, vel: number, when: number): void {
    const ctx = this.ctx;
    const amp = Math.min(0.32, vel * 0.32);

    if (note === 35 || note === 36) {
      // 8-bit Kick
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, when);
      osc.frequency.exponentialRampToValueAtTime(38, when + 0.095);
      gain.gain.setValueAtTime(amp * 1.15, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
      osc.connect(gain);
      gain.connect(this.destination);
      const stopper = () => {
        try {
          osc.stop();
          osc.disconnect();
          gain.disconnect();
        } catch {
          // Ignore
        }
        this.activeStoppers.delete(stopper);
      };
      this.activeStoppers.add(stopper);
      osc.onended = () => this.activeStoppers.delete(stopper);
      osc.start(when);
      osc.stop(when + 0.14);
      return;
    }

    if (note === 38 || note === 40) {
      // Snare: noise + short pitch snap
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1900, when);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(amp * 0.72, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.destination);
      const stopper = () => {
        try {
          src.stop();
          src.disconnect();
          gain.disconnect();
        } catch {
          // Ignore
        }
        this.activeStoppers.delete(stopper);
      };
      this.activeStoppers.add(stopper);
      src.onended = () => this.activeStoppers.delete(stopper);
      src.start(when);
      src.stop(when + 0.14);
      return;
    }

    if (note === 42 || note === 46 || note === 49) {
      // Closed Hat / Open Hat / Crash
      const dur = note === 49 ? 0.34 : note === 46 ? 0.14 : 0.045;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(note === 49 ? 4200 : 6800, when);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(amp * (note === 49 ? 0.55 : 0.32), when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.destination);
      const stopper = () => {
        try {
          src.stop();
          src.disconnect();
          gain.disconnect();
        } catch {
          // Ignore
        }
        this.activeStoppers.delete(stopper);
      };
      this.activeStoppers.add(stopper);
      src.onended = () => this.activeStoppers.delete(stopper);
      src.start(when);
      src.stop(when + dur + 0.01);
      return;
    }

    // Other percussive hits (toms, timbale, agogo)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const base = note >= 65 ? 540 : 220;
    osc.frequency.setValueAtTime(base, when);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, when + 0.08);
    gain.gain.setValueAtTime(amp * 0.45, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
    osc.connect(gain);
    gain.connect(this.destination);
    const stopper = () => {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Ignore
      }
      this.activeStoppers.delete(stopper);
    };
    this.activeStoppers.add(stopper);
    osc.onended = () => this.activeStoppers.delete(stopper);
    osc.start(when);
    osc.stop(when + 0.1);
  }
}
