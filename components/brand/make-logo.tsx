import { cn } from '@/lib/utils'

interface MakeLogoProps {
  className?: string
  showWordmark?: boolean
}

/**
 * Renders /public/make-logo.svg. Drop the official Make logomark SVG at
 * `public/make-logo.svg` and every surface in the app picks it up.
 *
 * Wordmark text is "Scenario KB" (the product name) — not Make's
 * registered wordmark — so swapping the asset doesn't require a wordmark.
 */
export function MakeLogo({ className, showWordmark = true }: MakeLogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/make-logo.png" alt="Make" className="h-7 w-7 shrink-0" />
      {showWordmark && (
        <span className="text-base font-semibold tracking-tightish text-foreground">
          Scenario KB
        </span>
      )}
    </div>
  )
}
