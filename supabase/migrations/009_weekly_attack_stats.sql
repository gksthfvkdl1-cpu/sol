-- 투표를 주차(월~일) 단위로 누적하고, 주차별 공격 통계를 제공

CREATE TABLE IF NOT EXISTS public.matchup_weekly_votes (
  matchup_id BIGINT NOT NULL REFERENCES public.matchups (id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  win INTEGER NOT NULL DEFAULT 0,
  lose INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (matchup_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_matchup_weekly_votes_week_start
  ON public.matchup_weekly_votes (week_start);

CREATE OR REPLACE FUNCTION public.vote_matchup(p_id BIGINT, p_outcome TEXT)
RETURNS public.matchups
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.matchups;
  ws DATE;
BEGIN
  IF p_outcome NOT IN ('win', 'lose') THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;

  ws := date_trunc('week', NOW())::date; -- ISO 기준 월요일

  IF p_outcome = 'win' THEN
    UPDATE public.matchups SET win = win + 1 WHERE id = p_id RETURNING * INTO r;
    INSERT INTO public.matchup_weekly_votes (matchup_id, week_start, win, lose)
    VALUES (p_id, ws, 1, 0)
    ON CONFLICT (matchup_id, week_start)
    DO UPDATE SET win = public.matchup_weekly_votes.win + 1;
  ELSE
    UPDATE public.matchups SET lose = lose + 1 WHERE id = p_id RETURNING * INTO r;
    INSERT INTO public.matchup_weekly_votes (matchup_id, week_start, win, lose)
    VALUES (p_id, ws, 0, 1)
    ON CONFLICT (matchup_id, week_start)
    DO UPDATE SET lose = public.matchup_weekly_votes.lose + 1;
  END IF;

  IF r IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;

  RETURN r;
END;
$$;

DROP FUNCTION IF EXISTS public.attack_stats_weekly(DATE);

CREATE OR REPLACE FUNCTION public.attack_stats_weekly(p_week_start DATE)
RETURNS TABLE (
  group_key TEXT,
  defense1 TEXT,
  defense2 TEXT,
  defense3 TEXT,
  attack1 TEXT,
  attack2 TEXT,
  attack3 TEXT,
  pet TEXT,
  win INTEGER,
  lose INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_match AS (
    SELECT
      m.id,
      m.defense1,
      m.defense2,
      m.defense3,
      m.attack1,
      m.attack2,
      m.attack3,
      COALESCE(m.pet, '') AS pet,
      COALESCE(wv.win, 0)::int AS win,
      COALESCE(wv.lose, 0)::int AS lose,
      public.normalize_three_slots(m.defense1, m.defense2, m.defense3) AS d_key,
      public.normalize_three_slots(m.attack1, m.attack2, m.attack3) AS a_key,
      LOWER(TRIM(COALESCE(m.pet, ''))) AS p_key
    FROM public.matchups m
    LEFT JOIN public.matchup_weekly_votes wv
      ON wv.matchup_id = m.id
      AND wv.week_start = p_week_start
  ),
  grouped AS (
    SELECT
      d_key,
      a_key,
      p_key,
      SUM(win)::int AS win,
      SUM(lose)::int AS lose
    FROM per_match
    GROUP BY d_key, a_key, p_key
  ),
  representative AS (
    SELECT DISTINCT ON (d_key, a_key, p_key)
      d_key,
      a_key,
      p_key,
      defense1,
      defense2,
      defense3,
      attack1,
      attack2,
      attack3,
      pet
    FROM per_match
    ORDER BY d_key, a_key, p_key, id
  )
  SELECT
    (g.d_key || '::' || g.a_key || '::' || g.p_key) AS group_key,
    r.defense1,
    r.defense2,
    r.defense3,
    r.attack1,
    r.attack2,
    r.attack3,
    r.pet,
    g.win,
    g.lose
  FROM grouped g
  JOIN representative r USING (d_key, a_key, p_key)
  WHERE (g.win + g.lose) > 0
  ORDER BY
    CASE WHEN (g.win + g.lose) > 0 THEN (g.win::numeric / (g.win + g.lose)) ELSE 0 END DESC,
    (g.win + g.lose) DESC,
    g.win DESC;
$$;

GRANT EXECUTE ON FUNCTION public.vote_matchup(BIGINT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.attack_stats_weekly(DATE) TO anon;
