-- 스샷 자동 등록: 장비·진형(선택) 전달

DROP FUNCTION IF EXISTS public.app_find_or_create_matchup_and_vote(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.app_find_or_create_matchup_and_vote(
  p_session_token TEXT,
  p_defense1 TEXT,
  p_defense2 TEXT,
  p_defense3 TEXT,
  p_attack1 TEXT,
  p_attack2 TEXT,
  p_attack3 TEXT,
  p_pet TEXT,
  p_outcome TEXT,
  p_equipment TEXT DEFAULT '',
  p_formation TEXT DEFAULT ''
)
RETURNS public.matchups
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
  target_id BIGINT;
  gid UUID;
  d1 TEXT := TRIM(COALESCE(p_defense1, ''));
  d2 TEXT := TRIM(COALESCE(p_defense2, ''));
  d3 TEXT := TRIM(COALESCE(p_defense3, ''));
  a1 TEXT := TRIM(COALESCE(p_attack1, ''));
  a2 TEXT := TRIM(COALESCE(p_attack2, ''));
  a3 TEXT := TRIM(COALESCE(p_attack3, ''));
  pet TEXT := COALESCE(TRIM(p_pet), '');
  eq TEXT := COALESCE(TRIM(p_equipment), '');
  fm TEXT := COALESCE(TRIM(p_formation), '');
  outcome TEXT := LOWER(TRIM(COALESCE(p_outcome, '')));
BEGIN
  IF outcome NOT IN ('win', 'lose') THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;

  uid := public.user_id_from_session(p_session_token);
  IF uid IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT m.id
  INTO target_id
  FROM public.matchups m
  WHERE public.normalize_three_slots(m.defense1, m.defense2, m.defense3)
      = public.normalize_three_slots(d1, d2, d3)
    AND public.normalize_three_slots(m.attack1, m.attack2, m.attack3)
      = public.normalize_three_slots(a1, a2, a3)
    AND LOWER(TRIM(COALESCE(m.pet, ''))) = LOWER(pet)
  ORDER BY (m.win + m.lose) DESC, m.id ASC
  LIMIT 1;

  IF target_id IS NULL THEN
    SELECT m.matchup_group_id
    INTO gid
    FROM public.matchups m
    WHERE public.normalize_three_slots(m.defense1, m.defense2, m.defense3)
        = public.normalize_three_slots(d1, d2, d3)
      AND public.normalize_three_slots(m.attack1, m.attack2, m.attack3)
        = public.normalize_three_slots(a1, a2, a3)
    LIMIT 1;

    IF gid IS NULL THEN
      gid := gen_random_uuid();
    END IF;

    INSERT INTO public.matchups (
      defense1, defense2, defense3,
      attack1, attack2, attack3,
      pet, equipment, formation, skill_order, notes,
      author_id, matchup_group_id
    ) VALUES (
      d1, d2, d3,
      a1, a2, a3,
      pet, eq, fm, '', '',
      uid, gid
    )
    RETURNING id INTO target_id;
  END IF;

  RETURN public.vote_matchup(target_id, outcome, p_session_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_find_or_create_matchup_and_vote(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon;
