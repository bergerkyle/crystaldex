import { useEffect, useRef, useState } from 'react'
import { spriteUrl } from './pokemon'

const FRAME_MS = 100 // duration of each animation frame
const REPEAT_DELAY_MS = 1000 // pause on the resting frame between loops
const SCALE = 2 // display sprites at 2x for visibility

// Renders a Pokémon's sprites: the front image is a vertical stack of square
// animation frames (frame size == image width). If there is more than one
// frame it plays as a looping animation; otherwise it shows the single frame.
// The back image is a single sprite rendered as-is.
export function PokemonSprite({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [frontError, setFrontError] = useState(false)
  const [backError, setBackError] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    setFrontError(false)

    const img = new Image()
    let timer: number | undefined
    let cancelled = false

    img.onload = () => {
      if (cancelled) return

      const frameSize = img.naturalWidth
      const frameCount = Math.max(1, Math.round(img.naturalHeight / frameSize))

      canvas.width = frameSize
      canvas.height = frameSize
      canvas.style.width = `${frameSize * SCALE}px`
      canvas.style.height = `${frameSize * SCALE}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false

      let frame = 0
      const draw = () => {
        ctx.clearRect(0, 0, frameSize, frameSize)
        ctx.drawImage(
          img,
          0,
          frame * frameSize,
          frameSize,
          frameSize,
          0,
          0,
          frameSize,
          frameSize,
        )

        if (frameCount <= 1) return

        // Rest on frame 0 for the repeat delay, then step through the rest.
        const delay = frame === 0 ? REPEAT_DELAY_MS : FRAME_MS
        frame = (frame + 1) % frameCount
        timer = window.setTimeout(draw, delay)
      }
      draw()
    }
    img.onerror = () => {
      if (!cancelled) setFrontError(true)
    }
    img.src = spriteUrl(name, 'front')

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [name])

  if (frontError && backError) return null

  return (
    <div className="sprites">
      <canvas
        ref={canvasRef}
        className="sprite sprite-front"
        style={{ display: frontError ? 'none' : undefined }}
        aria-label={`${name} front sprite`}
        role="img"
      />
      {!backError && (
        <img
          className="sprite sprite-back"
          src={spriteUrl(name, 'back')}
          alt={`${name} back sprite`}
          onError={() => setBackError(true)}
        />
      )}
    </div>
  )
}
