type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
}

export function LoadoutSelectField({ id, label, value, onChange, options }: Props) {
  const trimmed = value.trim()
  const showLegacy = Boolean(trimmed) && !options.includes(trimmed)

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="field-input ac-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">선택</option>
        {showLegacy ? (
          <option value={trimmed}>{trimmed} (기존 값)</option>
        ) : null}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
