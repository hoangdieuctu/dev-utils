import { useState, useEffect, useCallback } from 'react'

export function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? (JSON.parse(stored) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // storage quota or private browsing — silently ignore
    }
  }, [key, state])

  const set = useCallback((value: T | ((prev: T) => T)) => {
    setState(value)
  }, [])

  return [state, set]
}
