import type { ImpactEvent } from "./throws";

/**
 * Sonido sintetizado: sin archivos que descargar. Cada golpe horneado dispara
 * una rafaga corta de ruido filtrado mas un "toc" tonal, con la fuerza real
 * del impacto en la simulacion.
 */
export class DiceSound {
  private context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private scheduled: AudioScheduledSourceNode[] = [];

  /** Llamar dentro de un gesto del usuario: los navegadores lo exigen. */
  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      const length = Math.floor(this.context.sampleRate * 0.08);
      this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
      const channel = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  play(events: ImpactEvent[]) {
    this.stop();
    const { context, noise } = this;
    if (!context || !noise) return;
    const start = context.currentTime + 0.01;
    for (const event of events) {
      const when = start + event.t;
      const strength = Math.max(0.04, event.v) ** 1.4;
      const pitch = 0.85 + Math.random() * 0.4;

      const burst = context.createBufferSource();
      burst.buffer = noise;
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1500 * pitch + 1400 * strength;
      band.Q.value = 1.1;
      const burstGain = context.createGain();
      burstGain.gain.setValueAtTime(0.5 * strength, when);
      burstGain.gain.exponentialRampToValueAtTime(0.0008, when + 0.06);
      burst.connect(band).connect(burstGain).connect(context.destination);
      burst.start(when);

      const tone = context.createOscillator();
      tone.type = "sine";
      tone.frequency.setValueAtTime(620 * pitch, when);
      tone.frequency.exponentialRampToValueAtTime(320 * pitch, when + 0.04);
      const toneGain = context.createGain();
      toneGain.gain.setValueAtTime(0.28 * strength, when);
      toneGain.gain.exponentialRampToValueAtTime(0.0008, when + 0.05);
      tone.connect(toneGain).connect(context.destination);
      tone.start(when);
      tone.stop(when + 0.06);

      this.scheduled.push(burst, tone);
    }
  }

  stop() {
    for (const node of this.scheduled) {
      try {
        node.stop();
      } catch {
        // Ya habia terminado.
      }
    }
    this.scheduled = [];
  }
}
