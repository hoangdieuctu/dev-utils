import { useState, useCallback } from 'react'

export function useCopy(timeout = 1800) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = useCallback(async (text: string, key = 'default') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), timeout)
    } catch {
      // fallback
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(key)
      setTimeout(() => setCopied(null), timeout)
    }
  }, [timeout])

  return { copied, copy }
}
