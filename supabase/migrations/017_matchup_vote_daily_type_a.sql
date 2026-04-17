-- 타입 A: 일별 승/패 집계(matchup_vote_daily)로 누적 복구.
-- vote_date는 Asia/Seoul 달력 기준.
-- cleanup_matchup_vote_daily_older_than(7)은 vote_date가 7일보다 오래된 행을 삭제하므로,
-- 그 이전 날짜로의 복구는 불가능합니다. Supabase pg_cron 등에서 service_role로 주기 호출.

CREATE OR REPLACE FUNCTION public.vote_calendar_date_seoul(p_ts TIMESTAMPTZ DEFAULT NOW())
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (timezone('Asia/Seoul', p_ts))::DATE;
$$;

CREATE TABLE public.matchup_vote_daily (
  matchup_id BIGINT NOT NULL REFERENCES public.matchups (id) ON DELETE CASCADE,
  vote_date DATE NOT NULL,
  win_cnt INTEGER NOT NULL DEFAULT 0 CHECK (win_cnt >= 0),
  lose_cnt INTEGER NOT NULL DEFAULT 0 CHECK (lose_cnt >= 0),
  PRIMARY KEY (matchup_id, vote_date)
);

CREATE INDEX matchup_vote_daily_vote_date_idx
  ON public.matchup_vote_daily (vote_date);

ALTER TABLE public.matchup_vote_daily ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.matchup_vote_daily IS
  '매치업별 일별 승/패 집계. admin_apply_matchup_totals_as_of_date로 특정일까지 누적 반영.';

INSERT INTO public.matchup_vote_daily (matchup_id, vote_date, win_cnt, lose_cnt)
SELECT
  m.id,
  public.vote_calendar_date_seoul(m.created_at),
  m.win,
  m.lose
FROM public.matchups m
WHERE m.win <> 0 OR m.lose <> 0;

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
  vd DATE;
BEGIN
  IF p_outcome NOT IN ('win', 'lose') THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;

  ws := public.year_week_start(NOW());
  vd := public.vote_calendar_date_seoul(NOW());

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
  END IF;

  IF r IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;

  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_matchup_totals_as_of_date(
  p_session_token TEXT,
  p_matchup_id BIGINT,
  p_as_of_date DATE,
  p_trim_future_daily BOOLEAN DEFAULT TRUE
) RETURNS public.matchups
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.matchups;
  tw INTEGER;
  tl INTEGER;
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_trim_future_daily THEN
    DELETE FROM public.matchup_vote_daily
    WHERE matchup_id = p_matchup_id
      AND vote_date > p_as_of_date;
  END IF;

  SELECT
    COALESCE(SUM(win_cnt), 0)::INT,
    COALESCE(SUM(lose_cnt), 0)::INT
  INTO tw, tl
  FROM public.matchup_vote_daily
  WHERE matchup_id = p_matchup_id
    AND vote_date <= p_as_of_date;

  UPDATE public.matchups
  SET win = tw, lose = tl
  WHERE id = p_matchup_id
  RETURNING * INTO r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;

  DELETE FROM public.matchup_weekly_votes
  WHERE matchup_id = p_matchup_id;

  INSERT INTO public.matchup_weekly_votes (matchup_id, week_start, win, lose)
  SELECT
    d.matchup_id,
    public.year_week_start((d.vote_date::TIMESTAMP WITHOUT TIME ZONE AT TIME ZONE 'Asia/Seoul')),
    SUM(d.win_cnt)::INT,
    SUM(d.lose_cnt)::INT
  FROM public.matchup_vote_daily d
  WHERE d.matchup_id = p_matchup_id
    AND d.vote_date <= p_as_of_date
  GROUP BY
    d.matchup_id,
    public.year_week_start((d.vote_date::TIMESTAMP WITHOUT TIME ZONE AT TIME ZONE 'Asia/Seoul'));

  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_matchup_vote_daily_older_than(p_keep_days INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff DATE;
  n INTEGER;
BEGIN
  IF p_keep_days < 1 THEN
    RAISE EXCEPTION 'invalid keep days';
  END IF;
  cutoff := public.vote_calendar_date_seoul(NOW()) - p_keep_days;
  DELETE FROM public.matchup_vote_daily
  WHERE vote_date < cutoff;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_apply_matchup_totals_as_of_date(TEXT, BIGINT, DATE, BOOLEAN)
  TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.cleanup_matchup_vote_daily_older_than(INTEGER) TO service_role;
  END IF;
END
$$;
