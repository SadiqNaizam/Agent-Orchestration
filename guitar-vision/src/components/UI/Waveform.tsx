import { useEffect, useRef } from 'react'

interface WaveformProps {
  data: Float32Array | null
  color?: string
  height?: number
}

export function Waveform({ data, color = '#00FF88', height = 80 }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    ctx.clearRect(0, 0, width, height)

    if (!data) {
      ctx.strokeStyle = color + '33'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()
      return
    }

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.shadowBlur = 8
    ctx.shadowColor = color
    ctx.beginPath()

    const sliceWidth = width / data.length
    let x = 0
    for (let i = 0; i < data.length; i++) {
      const y = ((data[i] + 1) / 2) * height
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
      x += sliceWidth
    }
    ctx.stroke()
  }, [data, color, height])

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={height}
      className="w-full rounded-lg bg-black/30"
      style={{ height }}
    />
  )
}
