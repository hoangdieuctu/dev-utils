import type React from 'react'

interface IconProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function ClipboardIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <rect x="5" y="2" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 4H3.5A1.5 1.5 0 0 0 2 5.5v7A1.5 1.5 0 0 0 3.5 14H9a1.5 1.5 0 0 0 1.5-1.5V12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

export function CheckIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function JsonIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <path d="M4 2.5C3 2.5 2.5 3 2.5 4v2c0 1-.5 1.5-1.5 1.5C2 7.5 2.5 8 2.5 9v2c0 1 .5 1.5 1.5 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M12 2.5c1 0 1.5.5 1.5 1.5v2c0 1 .5 1.5 1.5 1.5-1 0-1.5.5-1.5 1.5v2c0 1-.5 1.5-1.5 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
    </svg>
  )
}

export function Base64Icon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <rect x="1.5" y="5" width="5.5" height="6" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="9" y="5" width="5.5" height="6" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <path d="M7 8h2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M10 3l2 2-2 2M6 3L4 5l2 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function UuidIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="5" cy="8" r="1" fill="currentColor" />
      <circle cx="11" cy="8" r="1" fill="currentColor" />
    </svg>
  )
}

export function HashIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <path d="M5.5 2v12M10.5 2v12M2 5.5h12M2 10.5h12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

export function RefreshIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 4.5 2.3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M13.5 2v3h-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PasswordIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" />
    </svg>
  )
}

export function JwtIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <rect x="1.5" y="2.5" width="13" height="3" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="1.5" y="6.5" width="13" height="3" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="1.5" y="10.5" width="13" height="3" rx="1" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

export function SqlIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <ellipse cx="8" cy="4.5" rx="5.5" ry="2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2.5 4.5v3c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2v-3" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2.5 7.5v3c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2v-3" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

export function CertIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 5h6M5 8h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="10.5" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M10.5 12.5V14.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

export function KeyIcon({ size = 16, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <circle cx="6" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8.5 9.5l5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M11 11.5l1.5 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
