-- 장비·진형 필드 (펫과 동일하게 "이름1 / 이름2 / 이름3" 문자열 저장, 검색 조건에는 미포함)

ALTER TABLE public.matchups
  ADD COLUMN IF NOT EXISTS equipment TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS formation TEXT NOT NULL DEFAULT '';

ALTER TABLE public.matchup_edit_requests
  ADD COLUMN IF NOT EXISTS equipment TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS formation TEXT NOT NULL DEFAULT '';

DROP FUNCTION IF EXISTS public.app_insert_matchup(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.app_insert_matchup(
  p_session_token TEXT,
  p_defense1 TEXT,
  p_defense2 TEXT,
  p_defense3 TEXT,
  p_attack1 TEXT,
  p_attack2 TEXT,
  p_attack3 TEXT,
  p_pet TEXT,
  p_equipment TEXT,
  p_formation TEXT,
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
    pet, equipment, formation, skill_order, notes, author_id, matchup_group_id
  ) VALUES (
    TRIM(p_defense1), TRIM(p_defense2), TRIM(p_defense3),
    TRIM(p_attack1), TRIM(p_attack2), TRIM(p_attack3),
    COALESCE(TRIM(p_pet), ''),
    COALESCE(TRIM(p_equipment), ''),
    COALESCE(TRIM(p_formation), ''),
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
  equipment TEXT,
  formation TEXT,
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
    m.equipment,
    m.formation,
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

DROP FUNCTION IF EXISTS public.app_submit_edit_request(TEXT, BIGINT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.app_submit_edit_request(
  p_session_token TEXT,
  p_matchup_id BIGINT,
  p_skill_order TEXT,
  p_notes TEXT,
  p_pet TEXT,
  p_equipment TEXT,
  p_formation TEXT
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
  INSERT INTO public.matchup_edit_requests (
    matchup_id, requester_id, skill_order, notes, pet, equipment, formation, status
  )
  VALUES (
    p_matchup_id,
    uid,
    COALESCE(TRIM(p_skill_order), ''),
    COALESCE(TRIM(p_notes), ''),
    COALESCE(TRIM(p_pet), ''),
    COALESCE(TRIM(p_equipment), ''),
    COALESCE(TRIM(p_formation), ''),
    'pending'
  );
END;
$$;

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
    pet = TRIM(r.pet),
    equipment = TRIM(r.equipment),
    formation = TRIM(r.formation),
    updated_at = NOW()
  WHERE id = r.matchup_id;
  UPDATE public.matchup_edit_requests SET status = 'approved' WHERE id = p_req_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_admin_panel_data(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j JSONB;
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'pending_signups',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'created_at', p.created_at
      ) ORDER BY p.created_at)
      FROM public.profiles p
      WHERE p.approved = FALSE AND p.rejected = FALSE
    ), '[]'::jsonb),
    'edit_requests',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'matchup_id', e.matchup_id,
        'skill_order', e.skill_order,
        'notes', e.notes,
        'pet', e.pet,
        'equipment', e.equipment,
        'formation', e.formation,
        'created_at', e.created_at,
        'requester_id', e.requester_id,
        'requester_username', rp.username,
        'requester_display_name', rp.display_name,
        'defense1', m.defense1,
        'defense2', m.defense2,
        'defense3', m.defense3
      ) ORDER BY e.id)
      FROM public.matchup_edit_requests e
      JOIN public.matchups m ON m.id = e.matchup_id
      JOIN public.profiles rp ON rp.id = e.requester_id
      WHERE e.status = 'pending'
    ), '[]'::jsonb)
  ) INTO j;
  RETURN j;
END;
$$;

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
    SELECT TRIM(attack1) AS name FROM public.matchups WHERE TRIM(attack1) <> ''
    UNION
    SELECT TRIM(attack2) AS name FROM public.matchups WHERE TRIM(attack2) <> ''
    UNION
    SELECT TRIM(attack3) AS name FROM public.matchups WHERE TRIM(attack3) <> ''
    UNION
    SELECT TRIM(x.pet_name) AS name
    FROM public.matchups m
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(m.pet, ''), '\s*/\s*') AS x(pet_name)
    WHERE TRIM(x.pet_name) <> ''
    UNION
    SELECT TRIM(x.slot_name) AS name
    FROM public.matchups m
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(m.equipment, ''), '\s*/\s*') AS x(slot_name)
    WHERE TRIM(x.slot_name) <> ''
    UNION
    SELECT TRIM(x.slot_name) AS name
    FROM public.matchups m
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(m.formation, ''), '\s*/\s*') AS x(slot_name)
    WHERE TRIM(x.slot_name) <> ''
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.app_insert_matchup(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.search_matchups(TEXT, TEXT, TEXT, TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION public.app_submit_edit_request(TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
