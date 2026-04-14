-- 같은 방어·공격 조합(각 슬롯 순서 무관) + 같은 펫 → 하나의 matchup_group_id 로 묶음

CREATE OR REPLACE FUNCTION public.normalize_three_slots(a TEXT, b TEXT, c TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT COALESCE(
    string_agg(LOWER(TRIM(v)), '|' ORDER BY LOWER(TRIM(v)))
    FROM unnest(
      ARRAY[
        COALESCE(a, ''),
        COALESCE(b, ''),
        COALESCE(c, '')
      ]
    ) AS u(v)
    WHERE TRIM(v) <> '';
$$;

ALTER TABLE public.matchups
  ADD COLUMN IF NOT EXISTS matchup_group_id UUID;

UPDATE public.matchups
SET matchup_group_id = gen_random_uuid()
WHERE matchup_group_id IS NULL;

ALTER TABLE public.matchups
  ALTER COLUMN matchup_group_id SET NOT NULL;

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
  gid UUID;
BEGIN
  uid := public.user_id_from_session(p_session_token);
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT m.matchup_group_id INTO gid
  FROM public.matchups m
  WHERE public.normalize_three_slots(m.defense1, m.defense2, m.defense3)
      = public.normalize_three_slots(p_defense1, p_defense2, p_defense3)
    AND public.normalize_three_slots(m.attack1, m.attack2, m.attack3)
      = public.normalize_three_slots(p_attack1, p_attack2, p_attack3)
    AND LOWER(TRIM(COALESCE(m.pet, ''))) = LOWER(TRIM(COALESCE(p_pet, '')))
  LIMIT 1;

  IF gid IS NULL THEN
    gid := gen_random_uuid();
  END IF;

  INSERT INTO public.matchups (
    defense1, defense2, defense3, attack1, attack2, attack3,
    pet, skill_order, notes, author_id, matchup_group_id
  ) VALUES (
    TRIM(p_defense1), TRIM(p_defense2), TRIM(p_defense3),
    TRIM(p_attack1), TRIM(p_attack2), TRIM(p_attack3),
    COALESCE(TRIM(p_pet), ''),
    COALESCE(TRIM(p_skill_order), ''), COALESCE(TRIM(p_notes), ''),
    uid,
    gid
  );
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
  ORDER BY m.matchup_group_id, m.id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_insert_matchup(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.search_matchups(TEXT, TEXT, TEXT, TEXT[]) TO anon;
