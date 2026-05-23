import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[hsl(var(--make-purple)/0.1)] text-[hsl(var(--make-purple))]',
        gradient: 'bg-make-gradient text-white',
        outline: 'border border-[hsl(var(--make-purple)/0.3)] text-[hsl(var(--make-purple))]',
        secondary: 'bg-secondary text-secondary-foreground',
        success: 'bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]',
        warning: 'bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]',
        danger: 'bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
