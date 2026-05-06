import { JsonIcon, Base64Icon, UuidIcon, HashIcon, PasswordIcon, JwtIcon, SqlIcon, CertIcon, KeyIcon } from './Icons'

export type ToolId = 'json' | 'base64' | 'uuid' | 'hash' | 'password' | 'jwt' | 'sql' | 'cert' | 'privkey'

export interface Tool {
  id: ToolId
  label: string
  description: string
  icon: typeof JsonIcon
  shortcut: string
}

export const TOOLS: Tool[] = [
  { id: 'json',     label: 'JSON',     description: 'Format & Validate', icon: JsonIcon,     shortcut: '1' },
  { id: 'base64',   label: 'Base64',   description: 'Encode / Decode',   icon: Base64Icon,   shortcut: '2' },
  { id: 'uuid',     label: 'UUID',     description: 'Generator',         icon: UuidIcon,     shortcut: '3' },
  { id: 'hash',     label: 'Hash',     description: 'MD5 / SHA',         icon: HashIcon,     shortcut: '4' },
  { id: 'password', label: 'Password', description: 'Generator',         icon: PasswordIcon, shortcut: '5' },
  { id: 'jwt',      label: 'JWT',      description: 'Extractor',         icon: JwtIcon,      shortcut: '6' },
  { id: 'sql',      label: 'SQL',      description: 'Formatter',         icon: SqlIcon,      shortcut: '7' },
  { id: 'cert',     label: 'Cert',     description: 'X.509 Decoder',     icon: CertIcon,     shortcut: '8' },
  { id: 'privkey',  label: 'Priv Key', description: 'Key Inspector',      icon: KeyIcon,      shortcut: '9' },
]

interface SidebarProps {
  active: ToolId
  onSelect: (id: ToolId) => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

export function Sidebar({ active, onSelect, theme, onToggleTheme }: SidebarProps) {
  return (
    <aside
      className="flex flex-col h-full min-h-0 select-none"
      style={{
        width: '200px',
        flexShrink: 0,
        background: 'var(--c-bg)',
        borderRight: '1px solid var(--c-border-subtle)',
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--c-border-subtle)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #5c6cfa, #8b5cf6)' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M3 8h7M3 12h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--c-text)', letterSpacing: '-0.02em' }}>
              DevUtils
            </div>
            <div className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>
              v1.0.3
            </div>
          </div>
        </div>
        <button
          onClick={onToggleTheme}
          className="theme-toggle"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.25" />
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"
                stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M13 8.5A5.5 5.5 0 0 1 7.5 14 5.5 5.5 0 0 1 2 8.5 5.5 5.5 0 0 1 8.5 3a5.5 5.5 0 0 0 4.5 5.5z"
                stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <div className="mb-2 px-3">
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
            Tools
          </span>
        </div>
        <ul className="flex flex-col gap-0.5">
          {TOOLS.map(tool => {
            const Icon = tool.icon
            const isActive = active === tool.id
            return (
              <li key={tool.id}>
                <button
                  onClick={() => onSelect(tool.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-100 text-left cursor-pointer relative"
                  style={{
                    background: isActive ? 'rgba(92, 108, 250, 0.1)' : 'transparent',
                    border: isActive ? '1px solid rgba(92, 108, 250, 0.2)' : '1px solid transparent',
                  }}
                >
                  {isActive && (
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r"
                      style={{ background: 'var(--c-accent)' }}
                    />
                  )}
                  <Icon
                    size={15}
                    style={{ color: isActive ? 'var(--c-accent-2)' : 'var(--c-text-3)' } as React.CSSProperties}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: isActive ? 'var(--c-text)' : 'var(--c-text-2)' }}>
                      {tool.label}
                    </div>
                    <div className="text-xs font-mono" style={{ color: isActive ? 'var(--c-accent-2)' : 'var(--c-text-5)' }}>
                      {tool.description}
                    </div>
                  </div>
                  <kbd
                    className="text-xs font-mono px-1 py-0.5 rounded"
                    style={{
                      color: 'var(--c-text-4)',
                      background: 'var(--c-bg-surface)',
                      border: '1px solid var(--c-border-subtle)',
                      fontSize: '10px',
                    }}
                  >
                    {tool.shortcut}
                  </kbd>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

    </aside>
  )
}
