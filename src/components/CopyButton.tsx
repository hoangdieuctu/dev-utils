import { CheckIcon, ClipboardIcon } from './Icons'

interface CopyButtonProps {
  text: string
  copyKey?: string
  copied: string | null
  onCopy: (text: string, key?: string) => void
  label?: string
  className?: string
}

export function CopyButton({ text, copyKey = 'default', copied, onCopy, label = 'Copy', className = '' }: CopyButtonProps) {
  const isCopied = copied === copyKey

  return (
    <button
      onClick={() => onCopy(text, copyKey)}
      className={`copy-btn ${isCopied ? 'copied' : ''} ${className}`}
      disabled={!text}
      style={{ opacity: !text ? 0.4 : 1 }}
    >
      {isCopied ? <CheckIcon size={12} /> : <ClipboardIcon size={12} />}
      {isCopied ? 'Copied!' : label}
    </button>
  )
}
