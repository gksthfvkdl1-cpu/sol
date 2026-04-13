import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import './AutocompleteField.css'

type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  disabled?: boolean
  placeholder?: string
  maxSuggestions?: number
}

export function AutocompleteField({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
  maxSuggestions = 5,
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    const unique = new Map<string, string>()
    for (const raw of options) {
      const v = raw.trim()
      if (!v) continue
      const key = v.toLowerCase()
      if (!unique.has(key)) unique.set(key, v)
    }
    const deduped = Array.from(unique.values())
    const filtered = q
      ? deduped.filter((o) => o.toLowerCase().includes(q))
      : []
    return filtered.slice(0, maxSuggestions)
  }, [value, options, maxSuggestions])

  const showPanel = open && suggestions.length > 0 && !disabled

  useEffect(() => {
    function onDocMouseDown(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  useEffect(() => {
    if (activeIndex >= suggestions.length) {
      setActiveIndex(suggestions.length > 0 ? suggestions.length - 1 : -1)
    }
  }, [activeIndex, suggestions.length])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setActiveIndex(-1)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (e.key === 'ArrowDown') {
      if (!open) setOpen(true)
      setActiveIndex((i) => {
        const next = i < 0 ? 0 : Math.min(i + 1, Math.max(suggestions.length - 1, 0))
        return next
      })
      e.preventDefault()
      return
    }

    if (e.key === 'ArrowUp' && open && suggestions.length > 0) {
      setActiveIndex((i) => Math.max(i - 1, 0))
      e.preventDefault()
      return
    }

    if (e.key === 'Escape' && open) {
      setOpen(false)
      setActiveIndex(-1)
      e.preventDefault()
      return
    }

    if (e.key === 'Enter' && open && activeIndex >= 0 && suggestions[activeIndex]) {
      pick(suggestions[activeIndex])
      e.preventDefault()
    }
  }

  return (
    <div className="field ac-field" ref={wrapRef}>
      <label htmlFor={id}>{label}</label>
      <div className="ac-wrap">
        <input
          id={id}
          type="text"
          className="field-input ac-input"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {showPanel && (
          <ul id={listId} className="ac-panel" role="listbox">
            {suggestions.map((s, idx) => (
              <li
                key={`${s}-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                className={
                  'ac-item' + (idx === activeIndex ? ' ac-item--active' : '')
                }
                onMouseDown={(ev) => ev.preventDefault()}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => pick(s)}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
