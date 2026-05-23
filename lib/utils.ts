import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMatchScore(score: number): { pct: string; tier: 'high' | 'mid' | 'low' } {
  const pct = `${Math.round(score * 100)}%`
  if (score >= 0.9) return { pct, tier: 'high' }
  if (score >= 0.7) return { pct, tier: 'mid' }
  return { pct, tier: 'low' }
}
