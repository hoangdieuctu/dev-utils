import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'

const MAX = 10

export function useInputHistory(key: string) {
  const [history, setHistory] = useLocalStorage<string[]>(key, [])

  const pushHistory = useCallback((value: string) => {
    if (!value.trim()) return
    setHistory(prev => {
      const filtered = prev.filter(v => v !== value)
      return [value, ...filtered].slice(0, MAX)
    })
  }, [key])

  const clearHistory = useCallback(() => setHistory([]), [key])

  return { history, pushHistory, clearHistory }
}
