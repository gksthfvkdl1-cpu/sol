-- 펫 컬럼 + 방어 검색: 각 입력값이 방어1·2·3 중 어디에 있어도 매칭

ALTER TABLE public.matchups
  ADD COLUMN IF NOT EXISTS pet TEXT NOT NULL DEFAULT '';

-- 기존 9인자 시그니처 제거 후 10인자로 재정의
DROP FUNCTION IF EXISTS public.app_insert_matchup(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.app_insert_matchup(
  p_session_token TEXT,
  p_defense1 TEXT,
  p_defense2 TEXT,
  p_defense3 TEXT,
  p_attack1 TEXT,
  p_attack2 TEXT,
  p_attack3 TEXT,
  p_pet TEXT,
  p_skill_order TEXT,
  p_notes TEXT
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
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.matchups (
    defense1, defense2, defense3, attack1, attack2, attack3,
    pet, skill_order, notes, author_id
  ) VALUES (
    TRIM(p_defense1), TRIM(p_defense2), TRIM(p_defense3),
    TRIM(p_attack1), TRIM(p_attack2), TRIM(p_attack3),
    COALESCE(TRIM(p_pet), ''),
    COALESCE(TRIM(p_skill_order), ''), COALESCE(TRIM(p_notes), ''),
    uid
  );
END;
$$;

DROP FUNCTION IF EXISTS public.search_matchups(TEXT, TEXT, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.hero_names()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY_AGG(name ORDER BY LOWER(name)),
    ARRAY[]::TEXT[]
  )
  FROM (
    SELECT TRIM(defense1) AS name FROM public.matchups WHERE TRIM(defense1) <> ''
    UNION
    SELECT TRIM(defense2) AS name FROM public.matchups WHERE TRIM(defense2) <> ''
    UNION
    SELECT TRIM(defense3) AS name FROM public.matchups WHERE TRIM(defense3) <> ''
    UNION
    SELECT TRIM(pet) AS name FROM public.matchups WHERE TRIM(pet) <> ''
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.search_matchups(
  p_d1 TEXT,
  p_d2 TEXT,
  p_d3 TEXT,
  p_exclude TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS TABLE (
  id BIGINT,
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
  author_username TEXT
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
    p.username
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
  ORDER BY (m.win + m.lose) DESC, m.win DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_insert_matchup(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.hero_names() TO anon;
GRANT EXECUTE ON FUNCTION public.search_matchups(TEXT, TEXT, TEXT, TEXT[]) TO anon;
