import { cn } from '@/lib/utils'

interface MakeLogoProps {
  className?: string
  showWordmark?: boolean
}

/**
 * Make brand mark — gradient tipping-dominos approximation rendered in SVG so we don't
 * ship the official PNG until brand assets are formally licensed for in-product use.
 * Keep proportions tight; this is the only place the gradient is drawn as a fill,
 * everywhere else use `bg-make-gradient`.
 */
export function MakeLogo({ className, showWordmark = true }: MakeLogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <defs>
          <linearGradient id="make-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6C1FE5" />
            <stop offset="50%" stopColor="#C03FCC" />
            <stop offset="100%" stopColor="#FF1F8E" />
          </linearGradient>
        </defs>
        <rect x="3" y="6" width="9" height="20" rx="2" fill="url(#make-grad)" transform="rotate(-12 7.5 16)" />
        <rect x="15" y="6" width="9" height="20" rx="2" fill="url(#make-grad)" transform="rotate(8 19.5 16)" />
      </svg>
      {showWordmark && (
        <span className="text-base font-semibold tracking-tightish text-foreground">Scenario KB</span>
      )}
    </div>
  )
}
