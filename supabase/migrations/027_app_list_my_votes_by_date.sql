-- 일반 유저: 본인 일일 승/패 클릭 기록 (덱 단위) 조회

CREATE OR REPLACE FUNCTION public.app_list_my_votes_by_date(
  p_session_token TEXT,
  p_vote_date DATE DEFAULT NULL
)
RETURNS TABLE (
  matchup_id BIGINT,
  defense1 TEXT,
  defense2 TEXT,
  defense3 TEXT,
  attack1 TEXT,
  attack2 TEXT,
  attack3 TEXT,
  pet TEXT,
  equipment TEXT,
  formation TEXT,
  skill_order TEXT,
  notes TEXT,
  win_cnt INTEGER,
  lose_cnt INTEGER,
  vote_date DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
  vd DATE;
BEGIN
  uid := public.user_id_from_session(p_session_token);
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  vd := COALESCE(p_vote_date, public.vote_calendar_date_seoul(NOW()));

  RETURN QUERY
  SELECT
    m.id AS matchup_id,
    m.defense1,
    m.defense2,
    m.defense3,
    m.attack1,
    m.attack2,
    m.attack3,
    COALESCE(m.pet, '')::TEXT AS pet,
    COALESCE(m.equipment, '')::TEXT AS equipment,
    COALESCE(m.formation, '')::TEXT AS formation,
    COALESCE(m.skill_order, '')::TEXT AS skill_order,
    COALESCE(m.notes, '')::TEXT AS notes,
    v.win_cnt,
    v.lose_cnt,
    v.vote_date
  FROM public.matchup_vote_user_daily v
  JOIN public.matchups m ON m.id = v.matchup_id
  WHERE v.user_id = uid
    AND v.vote_date = vd
  ORDER BY (v.win_cnt + v.lose_cnt) DESC, v.win_cnt DESC, m.id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_list_my_votes_by_date(TEXT, DATE)
  TO anon, authenticated;
