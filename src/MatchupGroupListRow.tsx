import { HeroPortraitStrip } from './HeroPortraitStrip.tsx'
import type { MatchupGroup, MatchupGroupCardProps } from './MatchupGroupCard.tsx'

type Props = Pick<
  MatchupGroupCardProps,
  | 'group'
  | 'portraitUrlByKey'
  | 'isAdmin'
  | 'deleteBusyId'
  | 'onStartEdit'
  | 'onDelete'
  | 'onVote'
> & {
  selected?: boolean
  onSelect?: (group: MatchupGroup) => void
  dense?: boolean
}

function winRatePct(win: number, lose: number): string {
  const t = Number(win) + Number(lose)
  if (t <= 0) return '—'
  return `${Math.round((Number(win) / t) * 100)}%`
}

export function MatchupGroupListRow({
  group: g,
  portraitUrlByKey,
  isAdmin,
  deleteBusyId,
  onStartEdit,
  onDelete,
  onVote,
  selected = false,
  onSelect,
  dense = false,
}: Props) {
  const h = g.header
  const m = g.strategies[0]
  const sumW = g.strategies.reduce((s, x) => s + x.win, 0)
  const sumL = g.strategies.reduce((s, x) => s + x.lose, 0)
  if (!m) return null

  const author =
    m.author_name || m.author_username || `user-${m.author_id.slice(0, 8)}`

  return (
    <article
      className={
        selected
          ? 'match-list-row match-list-row--selected'
          : dense
            ? 'match-list-row match-list-row--dense'
            : 'match-list-row'
      }
    >
      <button
        type="button"
        className="match-list-row-main"
        onClick={() => onSelect?.(g)}
      >
        <span className="match-list-rate">{winRatePct(sumW, sumL)}</span>
        <span className="match-list-teams">
          <span className="match-list-team">
            <span className="match-list-tag">VS</span>
            <HeroPortraitStrip
              names={[h.defense1, h.defense2, h.defense3]}
              portraitUrlByKey={portraitUrlByKey}
            />
          </span>
          <span className="match-list-team">
            <span className="match-list-tag match-list-tag--atk">ATK</span>
            <HeroPortraitStrip
              names={[h.attack1, h.attack2, h.attack3]}
              portraitUrlByKey={portraitUrlByKey}
            />
          </span>
        </span>
        <span className="match-list-meta">
          <span className="match-list-skill">
            {m.skill_order ? `⚡ ${m.skill_order}` : '스킬 없음'}
          </span>
          <span className="match-list-notes">
            {m.notes?.trim() ? m.notes : '코멘트 없음'}
          </span>
          <span className="match-list-foot">
            {m.win}승 {m.lose}패 · By {author}
          </span>
        </span>
      </button>
      <div className="match-list-row-actions">
        <button type="button" className="guide-btn-ghost" onClick={() => onStartEdit(m)}>
          수정
        </button>
        {isAdmin ? (
          <button
            type="button"
            className="guide-btn-ghost"
            disabled={deleteBusyId === m.id}
            onClick={() => void onDelete(m.id)}
          >
            {deleteBusyId === m.id ? '삭제 중…' : '삭제'}
          </button>
        ) : null}
        <button
          type="button"
          className="guide-vote-win match-list-vote"
          onClick={() => void onVote(m.id, 'win')}
        >
          승리
        </button>
        <button
          type="button"
          className="guide-vote-lose match-list-vote"
          onClick={() => void onVote(m.id, 'lose')}
        >
          패배
        </button>
      </div>
    </article>
  )
}
