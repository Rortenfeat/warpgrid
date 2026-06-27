import { useCallback, useRef } from 'react'

/**
 * Returns a stable function identity that always calls the latest version of
 * `fn`. Useful for canvas event/render helpers that read fresh state without
 * forcing effect re-subscription on every render.
 */
export function useCallbackRef<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: Args) => ref.current(...args), [])
}
