/** Manages Web Audio API context, microphone stream, and analyser node. */
export class AudioEngine {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private buffer: Float32Array | null = null

  async start(): Promise<{ analyser: AnalyserNode; buffer: Float32Array; sampleRate: number }> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    this.context = new AudioContext()
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 4096
    this.analyser.smoothingTimeConstant = 0.1

    this.source = this.context.createMediaStreamSource(this.stream)
    this.source.connect(this.analyser)

    this.buffer = new Float32Array(this.analyser.fftSize)
    return { analyser: this.analyser, buffer: this.buffer, sampleRate: this.context.sampleRate }
  }

  getTimeDomainData(): Float32Array | null {
    if (!this.analyser || !this.buffer) return null
    this.analyser.getFloatTimeDomainData(this.buffer)
    return this.buffer
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null
    const freqData = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(freqData)
    return freqData
  }

  stop(): void {
    this.source?.disconnect()
    this.stream?.getTracks().forEach(t => t.stop())
    this.context?.close()
    this.context = null
    this.analyser = null
    this.source = null
    this.stream = null
    this.buffer = null
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? 44100
  }

  get isRunning(): boolean {
    return this.context !== null
  }
}

export const audioEngine = new AudioEngine()
