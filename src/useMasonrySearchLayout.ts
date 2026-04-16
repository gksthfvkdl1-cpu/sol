import { useCallback, useLayoutEffect, useRef } from 'react'

/** `guide.css` 의 `.guide-grid` / `.guide-grid--results` 미디어쿼리과 동일 */
function masonryColumnCount(): number {
  if (typeof window === 'undefined') return 3
  const w = window.innerWidth
  if (w <= 560) return 1
  if (w <= 960) return 2
  return 3
}

function readGapPx(root: HTMLElement): number {
  const raw = getComputedStyle(root).getPropertyValue('--masonry-gap').trim()
  const m = raw.match(/^([\d.]+)rem$/i)
  if (m) {
    const rem = parseFloat(m[1])
    const fs = parseFloat(getComputedStyle(document.documentElement).fontSize)
    return rem * (Number.isFinite(fs) ? fs : 16)
  }
  return 13.6
}

/**
 * 검색 결과 카드: 행 단위 CSS Grid 대신, 항상 가장 낮은 열에 다음 카드를 붙여 빈칸을 없앰.
 * DOM 순서(등록 순)는 유지하고, 배치만 masonry.
 */
export function useMasonrySearchLayout(layoutKey: string) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  const layout = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const cards = [...root.querySelectorAll<HTMLElement>('.guide-match-card')]
    if (cards.length === 0) {
      root.style.height = '0px'
      return
    }

    const cols = masonryColumnCount()
    const gap = readGapPx(root)
    const w = root.clientWidth
    const colW = cols > 0 ? (w - gap * Math.max(0, cols - 1)) / cols : w

    for (const c of cards) {
      c.style.visibility = 'hidden'
      c.style.position = 'absolute'
      c.style.left = '0'
      c.style.top = '0'
      c.style.width = `${colW}px`
      c.style.boxSizing = 'border-box'
    }

    const heights = cards.map((c) => c.getBoundingClientRect().height)
    const colHeights = new Array(cols).fill(0)

    for (let idx = 0; idx < cards.length; idx++) {
      const card = cards[idx]
      const h = heights[idx] ?? card.getBoundingClientRect().height
      let col = 0
      let minH = colHeights[0] ?? 0
      for (let j = 1; j < cols; j++) {
        const ch = colHeights[j] ?? 0
        if (ch < minH) {
          minH = ch
          col = j
        }
      }
      card.style.left = `${col * (colW + gap)}px`
      card.style.top = `${colHeights[col]}px`
      card.style.visibility = 'visible'
      colHeights[col] += h + gap
    }

    const totalH = Math.max(0, ...colHeights) - (colHeights.some((x) => x > 0) ? gap : 0)
    root.style.height = `${Math.max(0, totalH)}px`
  }, [])

  useLayoutEffect(() => {
    layout()
    const root = rootRef.current
    if (!root) return

    const ro = new ResizeObserver(() => {
      layout()
    })
    ro.observe(root)
    for (const c of root.querySelectorAll('.guide-match-card')) {
      ro.observe(c)
    }

    const onResize = () => layout()
    window.addEventListener('resize', onResize)

    const id = window.requestAnimationFrame(() => layout())
    return () => {
      window.cancelAnimationFrame(id)
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [layout, layoutKey])

  return rootRef
}
