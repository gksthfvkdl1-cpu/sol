import { portraitKey } from './lib/portraitKey.ts'

type Props = {
  names: string[]
  portraitUrlByKey: Readonly<Record<string, string>>
  /**
   * 펫처럼 1명만 있을 때도 VS/ATK와 같이 3열을 쓰고, 1열(왼쪽 1/3)에만 표시
   * (미설정 시 1명이면 한 줄 전체 가운데로 모임)
   */
  padToThreeColumns?: boolean
}

export function HeroPortraitStrip({
  names,
  portraitUrlByKey,
  padToThreeColumns = false,
}: Props) {
  const slots = names.map((n) => {
    const label = n.trim()
    const key = portraitKey(n)
    const url = key ? portraitUrlByKey[key] : undefined
    return { label, key, url }
  })

  const useThreeColPad =
    padToThreeColumns && slots.length === 1 && Boolean(slots[0]?.label)
  const colCount = useThreeColPad ? 3 : Math.max(1, slots.length)

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
      {useThreeColPad ? (
        <>
          <div
            className="guide-portrait-slot guide-portrait-slot--pad"
            aria-hidden
          />
          <div
            className="guide-portrait-slot guide-portrait-slot--pad"
            aria-hidden
          />
        </>
      ) : null}
    </div>
  )
}
