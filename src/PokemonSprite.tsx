import { useEffect, useRef, useState } from 'react'
import type { ShinyPalette } from './pokemon'

const FRAME_MS = 100 // duration of each animation frame
const REPEAT_DELAY_MS = 1000 // pause on the resting frame between loops
const DISPLAY_SIZE = 112

interface AnimatedFrontSpriteProps {
  front: string
  className?: string
  ariaLabel?: string
  displaySize?: number
  shiny?: boolean
  shinyPalette?: ShinyPalette | null
  onError?: () => void
}

function parseHexColor(color: string): [number, number, number] | null {
  const match = color.match(/^#([0-9a-f]{6})$/i)
  if (!match) return null
  const hex = match[1]
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

function colorKey(red: number, green: number, blue: number): string {
  return `${red},${green},${blue}`
}

function luminance([red, green, blue]: [number, number, number]): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function recolorSprite(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shinyPalette?: ShinyPalette | null,
): void {
  if (!shinyPalette) return
  const shinyColor1 = parseHexColor(shinyPalette.color1)
  const shinyColor2 = parseHexColor(shinyPalette.color2)
  if (!shinyColor1 || !shinyColor2) return

  const imageData = ctx.getImageData(0, 0, width, height)
  const pixels = imageData.data
  const colorCounts = new Map<string, number>()

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue
    const key = colorKey(pixels[i], pixels[i + 1], pixels[i + 2])
    colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1)
  }

  if (colorCounts.size < 4) return

  const dominantColors = [...colorCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([key]) => {
      const [red, green, blue] = key
        .split(',')
        .map((value) => Number.parseInt(value, 10)) as [number, number, number]
      return [red, green, blue] as [number, number, number]
    })
    .sort((left, right) => luminance(right) - luminance(left))

  const middleColors = dominantColors.slice(1, -1)
  if (middleColors.length < 2) return

  // In Crystal sprites, these middle shades are color1 (lighter) and
  // color2 (darker), regardless of whether black/white are reversed.
  const sourceColor1 = colorKey(...middleColors[0])
  const sourceColor2 = colorKey(...middleColors[middleColors.length - 1])
  const targetBySource = new Map<string, [number, number, number]>([
    [sourceColor1, shinyColor1],
    [sourceColor2, shinyColor2],
  ])

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue
    const replacement = targetBySource.get(
      colorKey(pixels[i], pixels[i + 1], pixels[i + 2]),
    )
    if (!replacement) continue
    pixels[i] = replacement[0]
    pixels[i + 1] = replacement[1]
    pixels[i + 2] = replacement[2]
  }

  ctx.putImageData(imageData, 0, 0)
}

interface StaticSpriteProps {
  src: string
  className?: string
  ariaLabel?: string
  displaySize?: number
  shiny?: boolean
  shinyPalette?: ShinyPalette | null
  onError?: () => void
}

function StaticSpriteCanvas({
  src,
  className,
  ariaLabel = 'sprite',
  displaySize = DISPLAY_SIZE,
  shiny,
  shinyPalette,
  onError,
}: StaticSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const img = new Image()
    let cancelled = false

    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return

      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.style.width = `${displaySize}px`
      canvas.style.height = `${displaySize}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false

      ctx.clearRect(0, 0, img.naturalWidth, img.naturalHeight)
      ctx.drawImage(img, 0, 0)
      if (shiny) {
        recolorSprite(ctx, img.naturalWidth, img.naturalHeight, shinyPalette)
      }
    }

    img.onerror = () => {
      if (!cancelled) onError?.()
    }

    img.src = src

    return () => {
      cancelled = true
    }
  }, [src, onError, displaySize, shiny, shinyPalette])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label={ariaLabel}
      role="img"
    />
  )
}

// Renders a front sprite sheet (stacked square frames) into a looping canvas.
export function AnimatedFrontSprite({
  front,
  className,
  ariaLabel = 'front sprite',
  displaySize = DISPLAY_SIZE,
  shiny,
  shinyPalette,
  onError,
}: AnimatedFrontSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const img = new Image()
    let timer: number | undefined
    let cancelled = false
    img.crossOrigin = 'anonymous'

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

        if (shiny) {
          recolorSprite(ctx, frameSize, frameSize, shinyPalette)
        }

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
  }, [front, onError, displaySize, shiny, shinyPalette])

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
export function PokemonSprite({
  front,
  back,
  shiny = false,
  shinyPalette = null,
}: {
  front: string
  back: string
  shiny?: boolean
  shinyPalette?: ShinyPalette | null
}) {
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
          shiny={shiny}
          shinyPalette={shinyPalette}
          onError={() => setFrontError(true)}
        />
      )}
      {!backError && (
        <StaticSpriteCanvas
          className="sprite sprite-back"
          src={back}
          ariaLabel="back sprite"
          shiny={shiny}
          shinyPalette={shinyPalette}
          onError={() => setBackError(true)}
        />
      )}
    </div>
  )
}
