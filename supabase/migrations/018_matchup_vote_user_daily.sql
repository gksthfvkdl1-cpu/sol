-- 사용자별 일일 승/패 클릭 집계 (Asia/Seoul 달력 기준)

CREATE TABLE IF NOT EXISTS public.matchup_vote_user_daily (
  vote_date DATE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  matchup_id BIGINT NOT NULL REFERENCES public.matchups (id) ON DELETE CASCADE,
  win_cnt INTEGER NOT NULL DEFAULT 0 CHECK (win_cnt >= 0),
  lose_cnt INTEGER NOT NULL DEFAULT 0 CHECK (lose_cnt >= 0),
  PRIMARY KEY (vote_date, user_id, matchup_id)
);

CREATE INDEX IF NOT EXISTS matchup_vote_user_daily_user_date_idx
  ON public.matchup_vote_user_daily (user_id, vote_date DESC);

CREATE INDEX IF NOT EXISTS matchup_vote_user_daily_date_idx
  ON public.matchup_vote_user_daily (vote_date DESC);

ALTER TABLE public.matchup_vote_user_daily ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.vote_matchup(
  p_id BIGINT,
  p_outcome TEXT,
  p_session_token TEXT DEFAULT NULL
)
RETURNS public.matchups
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.matchups;
  ws DATE;
  vd DATE;
  uid UUID;
BEGIN
  IF p_outcome NOT IN ('win', 'lose') THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;

  ws := public.year_week_start(NOW());
  vd := public.vote_calendar_date_seoul(NOW());

  IF p_session_token IS NOT NULL AND LENGTH(TRIM(p_session_token)) > 0 THEN
    uid := public.user_id_from_session(p_session_token);
  END IF;

  IF p_outcome = 'win' THEN
    UPDATE public.matchups SET win = win + 1 WHERE id = p_id RETURNING * INTO r;
    INSERT INTO public.matchup_weekly_votes (matchup_id, week_start, win, lose)
    VALUES (p_id, ws, 1, 0)
    ON CONFLICT (matchup_id, week_start)
    DO UPDATE SET win = public.matchup_weekly_votes.win + 1;
    INSERT INTO public.matchup_vote_daily (matchup_id, vote_date, win_cnt, lose_cnt)
    VALUES (p_id, vd, 1, 0)
    ON CONFLICT (matchup_id, vote_date)
    DO UPDATE SET win_cnt = public.matchup_vote_daily.win_cnt + 1;

    IF uid IS NOT NULL THEN
      INSERT INTO public.matchup_vote_user_daily (vote_date, user_id, matchup_id, win_cnt, lose_cnt)
      VALUES (vd, uid, p_id, 1, 0)
      ON CONFLICT (vote_date, user_id, matchup_id)
      DO UPDATE SET win_cnt = public.matchup_vote_user_daily.win_cnt + 1;
    END IF;
  ELSE
    UPDATE public.matchups SET lose = lose + 1 WHERE id = p_id RETURNING * INTO r;
    INSERT INTO public.matchup_weekly_votes (matchup_id, week_start, win, lose)
    VALUES (p_id, ws, 0, 1)
    ON CONFLICT (matchup_id, week_start)
    DO UPDATE SET lose = public.matchup_weekly_votes.lose + 1;
    INSERT INTO public.matchup_vote_daily (matchup_id, vote_date, win_cnt, lose_cnt)
    VALUES (p_id, vd, 0, 1)
    ON CONFLICT (matchup_id, vote_date)
    DO UPDATE SET lose_cnt = public.matchup_vote_daily.lose_cnt + 1;

    IF uid IS NOT NULL THEN
      INSERT INTO public.matchup_vote_user_daily (vote_date, user_id, matchup_id, win_cnt, lose_cnt)
      VALUES (vd, uid, p_id, 0, 1)
      ON CONFLICT (vote_date, user_id, matchup_id)
      DO UPDATE SET lose_cnt = public.matchup_vote_user_daily.lose_cnt + 1;
    END IF;
  END IF;

  IF r IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;

  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_vote_user_daily(
  p_session_token TEXT,
  p_vote_date DATE
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  win_cnt INTEGER,
  lose_cnt INTEGER,
  total_cnt INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.username,
    p.display_name,
    COALESCE(SUM(v.win_cnt), 0)::INT AS win_cnt,
    COALESCE(SUM(v.lose_cnt), 0)::INT AS lose_cnt,
    COALESCE(SUM(v.win_cnt + v.lose_cnt), 0)::INT AS total_cnt
  FROM public.matchup_vote_user_daily v
  JOIN public.profiles p ON p.id = v.user_id
  WHERE v.vote_date = p_vote_date
  GROUP BY p.id, p.username, p.display_name
  ORDER BY total_cnt DESC, win_cnt DESC, p.display_name ASC, p.username ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_vote_user_daily(TEXT, DATE)
  TO anon, authenticated;
