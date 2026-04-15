import { portraitKey } from './lib/portraitKey.ts'

type Props = {
  names: string[]
  portraitUrlByKey: Readonly<Record<string, string>>
  /** 고정 칸 수(예: 펫은 3칸 고정). 실제 데이터가 부족하면 오른쪽 칸을 빈칸으로 채움 */
  fixedColumns?: number
}

export function HeroPortraitStrip({
  names,
  portraitUrlByKey,
  fixedColumns,
}: Props) {
  const slots = names
    .map((n) => {
      const label = n.trim()
      const key = portraitKey(n)
      const url = key ? portraitUrlByKey[key] : undefined
      return { label, key, url }
    })
    .filter((x) => Boolean(x.label))

  const requestedCols = Math.max(1, Number(fixedColumns ?? 0))
  const colCount = Math.max(requestedCols, slots.length || 1)
  const padCount = Math.max(0, colCount - slots.length)

  return (
    <div
      className="guide-portrait-strip"
      style={{
        gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
      }}
    >
      {slots.map(({ label, key, url }) => (
        <div key={key || label || 'empty'} className="guide-portrait-slot">
          {url ? (
            <img
              className="guide-portrait-img"
              src={url}
              alt={label || '캐릭터'}
              title={label}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="guide-portrait-fallback" title={label || '—'}>
              {label ? label.slice(0, 4) : '—'}
            </div>
          )}
          {label ? <span className="guide-portrait-label">{label}</span> : null}
        </div>
      ))}
      {Array.from({ length: padCount }).map((_, idx) => (
        <div
          key={`pad-${idx}`}
          className="guide-portrait-slot guide-portrait-slot--pad"
          aria-hidden
        />
      ))}
    </div>
  )
}
