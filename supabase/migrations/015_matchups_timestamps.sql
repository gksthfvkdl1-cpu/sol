-- 공략 카드용 등록/수정 시각 (검색 RPC 반영, 관리자 승인 시 수정 시각 갱신)

ALTER TABLE public.matchups
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.matchups
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.approve_edit_request(
  p_session_token TEXT,
  p_req_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.matchup_edit_requests;
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO r FROM public.matchup_edit_requests WHERE id = p_req_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
  UPDATE public.matchups
  SET
    skill_order = TRIM(r.skill_order),
    notes = TRIM(r.notes),
    updated_at = NOW()
  WHERE id = r.matchup_id;
  UPDATE public.matchup_edit_requests SET status = 'approved' WHERE id = p_req_id;
END;
$$;

DROP FUNCTION IF EXISTS public.search_matchups(TEXT, TEXT, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.search_matchups(
  p_d1 TEXT,
  p_d2 TEXT,
  p_d3 TEXT,
  p_exclude TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS TABLE (
  id BIGINT,
  matchup_group_id UUID,
  defense1 TEXT,
  defense2 TEXT,
  defense3 TEXT,
  attack1 TEXT,
  attack2 TEXT,
  attack3 TEXT,
  pet TEXT,
  skill_order TEXT,
  notes TEXT,
  win INTEGER,
  lose INTEGER,
  author_id UUID,
  author_name TEXT,
  author_username TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.matchup_group_id,
    m.defense1,
    m.defense2,
    m.defense3,
    m.attack1,
    m.attack2,
    m.attack3,
    m.pet,
    m.skill_order,
    m.notes,
    m.win,
    m.lose,
    m.author_id,
    p.display_name,
    p.username,
    m.created_at,
    m.updated_at
  FROM public.matchups m
  JOIN public.profiles p ON p.id = m.author_id
  WHERE
    (p_d1 IS NULL OR TRIM(p_d1) = '' OR (
      m.defense1 ILIKE '%' || TRIM(p_d1) || '%'
      OR m.defense2 ILIKE '%' || TRIM(p_d1) || '%'
      OR m.defense3 ILIKE '%' || TRIM(p_d1) || '%'
    ))
    AND (p_d2 IS NULL OR TRIM(p_d2) = '' OR (
      m.defense1 ILIKE '%' || TRIM(p_d2) || '%'
      OR m.defense2 ILIKE '%' || TRIM(p_d2) || '%'
      OR m.defense3 ILIKE '%' || TRIM(p_d2) || '%'
    ))
    AND (p_d3 IS NULL OR TRIM(p_d3) = '' OR (
      m.defense1 ILIKE '%' || TRIM(p_d3) || '%'
      OR m.defense2 ILIKE '%' || TRIM(p_d3) || '%'
      OR m.defense3 ILIKE '%' || TRIM(p_d3) || '%'
    ))
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p_exclude, ARRAY[]::TEXT[])) AS ex(term)
      WHERE TRIM(term) <> ''
        AND (
          m.attack1 ILIKE '%' || TRIM(term) || '%'
          OR m.attack2 ILIKE '%' || TRIM(term) || '%'
          OR m.attack3 ILIKE '%' || TRIM(term) || '%'
        )
    )
  ORDER BY m.matchup_group_id, m.id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_matchups(TEXT, TEXT, TEXT, TEXT[]) TO anon;
