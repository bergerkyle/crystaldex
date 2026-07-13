import { useEffect, useRef, useState } from 'react'

const FRAME_MS = 100 // duration of each animation frame
const REPEAT_DELAY_MS = 1000 // pause on the resting frame between loops
const DISPLAY_SIZE = 112

interface AnimatedFrontSpriteProps {
  front: string
  className?: string
  ariaLabel?: string
  displaySize?: number
  onError?: () => void
}

// Renders a front sprite sheet (stacked square frames) into a looping canvas.
export function AnimatedFrontSprite({
  front,
  className,
  ariaLabel = 'front sprite',
  displaySize = DISPLAY_SIZE,
  onError,
}: AnimatedFrontSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const img = new Image()
    let timer: number | undefined
    let cancelled = false

    img.onload = () => {
      if (cancelled) return

      const frameSize = img.naturalWidth
      const frameCount = Math.max(1, Math.round(img.naturalHeight / frameSize))

      canvas.width = frameSize
      canvas.height = frameSize
      canvas.style.width = `${displaySize}px`
      canvas.style.height = `${displaySize}px`

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
      if (!cancelled) onError?.()
    }

    img.src = front

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [front, onError, displaySize])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label={ariaLabel}
      role="img"
    />
  )
}

// Renders a Pokémon's sprites: the front image is a vertical stack of square
// animation frames (frame size == image width). If there is more than one
// frame it plays as a looping animation; otherwise it shows the single frame.
// The back image is a single sprite rendered as-is.
export function PokemonSprite({ front, back }: { front: string; back: string }) {
  const [frontError, setFrontError] = useState(false)
  const [backError, setBackError] = useState(false)

  useEffect(() => {
    setFrontError(false)
  }, [front])

  if (frontError && backError) return null

  return (
    <div className="sprites">
      {!frontError && (
        <AnimatedFrontSprite
          front={front}
          className="sprite sprite-front"
          onError={() => setFrontError(true)}
        />
      )}
      {!backError && (
        <img
          className="sprite sprite-back"
          src={back}
          alt="back sprite"
          onError={() => setBackError(true)}
        />
      )}
    </div>
  )
}
