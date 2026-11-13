import { useEffect, useRef } from 'react'

const FRAME = 16

// Overworld sheets are 2-bit grayscale; map each gray level to a palette slot
// (0 is the transparent background) and draw the first, front-facing frame.
const GRAY_THRESHOLDS = [212, 128, 43]

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

export function TrainerSprite({
  src,
  palette,
  size = 32,
}: {
  src: string
  palette: string | null
  size?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (cancelled || !ctx) return
      ctx.clearRect(0, 0, FRAME, FRAME)
      ctx.drawImage(img, 0, 0, FRAME, FRAME, 0, 0, FRAME, FRAME)
      const colors = palette ? palette.split(',').map(hexToRgb) : null
      const data = ctx.getImageData(0, 0, FRAME, FRAME)
      for (let i = 0; i < data.data.length; i += 4) {
        const found = GRAY_THRESHOLDS.findIndex((t) => data.data[i] >= t)
        const slot = found === -1 ? 3 : found
        if (slot === 0) {
          data.data[i + 3] = 0
        } else if (colors) {
          const [r, g, b] = colors[slot - 1]
          data.data[i] = r
          data.data[i + 1] = g
          data.data[i + 2] = b
        }
      }
      ctx.putImageData(data, 0, 0)
    }
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src, palette])

  return (
    <canvas
      ref={canvasRef}
      className="trainer-table-sprite"
      width={FRAME}
      height={FRAME}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}
