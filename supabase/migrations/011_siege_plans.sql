-- 공성전 요일별 공략 저장/조회

CREATE TABLE IF NOT EXISTS public.siege_plans (
  id BIGSERIAL PRIMARY KEY,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  speed_order TEXT NOT NULL DEFAULT '',
  round1 TEXT NOT NULL DEFAULT '',
  round2 TEXT NOT NULL DEFAULT '',
  round3 TEXT NOT NULL DEFAULT '',
  author_id UUID NOT NULL REFERENCES public.profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siege_plans_day_created
  ON public.siege_plans (day_of_week, created_at DESC);

ALTER TABLE public.siege_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS siege_plans_select_all ON public.siege_plans;
CREATE POLICY siege_plans_select_all
  ON public.siege_plans FOR SELECT
  USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON public.siege_plans FROM anon, authenticated;
GRANT SELECT ON public.siege_plans TO anon;

CREATE OR REPLACE FUNCTION public.app_insert_siege_plan(
  p_session_token TEXT,
  p_day SMALLINT,
  p_speed_order TEXT,
  p_round1 TEXT,
  p_round2 TEXT,
  p_round3 TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
BEGIN
  uid := public.user_id_from_session(p_session_token);
  IF uid IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_day < 1 OR p_day > 7 THEN
    RAISE EXCEPTION 'invalid day';
  END IF;

  INSERT INTO public.siege_plans (
    day_of_week,
    speed_order,
    round1,
    round2,
    round3,
    author_id
  ) VALUES (
    p_day,
    COALESCE(TRIM(p_speed_order), ''),
    COALESCE(TRIM(p_round1), ''),
    COALESCE(TRIM(p_round2), ''),
    COALESCE(TRIM(p_round3), ''),
    uid
  );
END;
$$;

DROP FUNCTION IF EXISTS public.siege_plans_by_day(SMALLINT);

CREATE OR REPLACE FUNCTION public.siege_plans_by_day(p_day SMALLINT)
RETURNS TABLE (
  id BIGINT,
  day_of_week SMALLINT,
  speed_order TEXT,
  round1 TEXT,
  round2 TEXT,
  round3 TEXT,
  author_id UUID,
  author_name TEXT,
  author_username TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.day_of_week,
    s.speed_order,
    s.round1,
    s.round2,
    s.round3,
    s.author_id,
    p.display_name AS author_name,
    p.username AS author_username,
    s.created_at
  FROM public.siege_plans s
  JOIN public.profiles p ON p.id = s.author_id
  WHERE s.day_of_week = p_day
  ORDER BY s.created_at DESC, s.id DESC;
$$;

GRANT EXECUTE ON FUNCTION public.app_insert_siege_plan(TEXT, SMALLINT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.siege_plans_by_day(SMALLINT) TO anon;
