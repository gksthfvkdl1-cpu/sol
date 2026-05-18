-- 스샷 자동 등록용 한 방 RPC: 같은 (방어·공격·펫) 조합 존재 시 가장 인기 있는 행에 투표,
-- 없으면 신규 matchups 행 생성(스킬/메모 빈값) 후 그 행에 투표.

CREATE OR REPLACE FUNCTION public.app_find_or_create_matchup_and_vote(
  p_session_token TEXT,
  p_defense1 TEXT,
  p_defense2 TEXT,
  p_defense3 TEXT,
  p_attack1 TEXT,
  p_attack2 TEXT,
  p_attack3 TEXT,
  p_pet TEXT,
  p_outcome TEXT
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
  outcome TEXT := LOWER(TRIM(COALESCE(p_outcome, '')));
BEGIN
  IF outcome NOT IN ('win', 'lose') THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;

  uid := public.user_id_from_session(p_session_token);
  IF uid IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 같은 정규화 조합(슬롯 순서 무관)을 가진 행 중 가장 인기 있는 행 선택
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
    -- 같은 조합의 그룹 ID 재사용(다른 펫이나 슬롯 순서로 생긴 행이 있을 수 있어 안전 차원)
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
      pet, skill_order, notes,
      author_id, matchup_group_id
    ) VALUES (
      d1, d2, d3,
      a1, a2, a3,
      pet, '', '',
      uid, gid
    )
    RETURNING id INTO target_id;
  END IF;

  RETURN public.vote_matchup(target_id, outcome, p_session_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_find_or_create_matchup_and_vote(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;
