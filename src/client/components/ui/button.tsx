import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils.ts'

const buttonVariants = cva(
  'group relative inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-xs font-mono text-[0.7rem] font-500 tracking-[0.18em] uppercase transition-[background-color,color,border-color,transform] duration-200 disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-foreground hover:bg-[oklch(0.85_0.16_63)] active:translate-y-px',
        outline:
          'border border-border-strong text-foreground hover:border-accent hover:text-accent active:translate-y-px',
        ghost: 'text-muted-foreground hover:text-foreground',
      },
      size: {
        default: 'h-12 px-6',
        sm: 'h-9 px-4 text-[0.65rem]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export type ButtonLinkProps = ComponentProps<'a'> & VariantProps<typeof buttonVariants>

export function ButtonLink({ className, variant, size, ...props }: ButtonLinkProps) {
  return <a className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
