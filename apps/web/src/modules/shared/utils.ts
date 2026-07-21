import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { useSyncExternalStore } from 'react'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function useIsDesktop(breakpoint = 768) {
  return useSyncExternalStore(
    cb => {
      const mq = window.matchMedia(`(min-width: ${breakpoint}px)`)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(`(min-width: ${breakpoint}px)`).matches,
    () => true,
  )
}
