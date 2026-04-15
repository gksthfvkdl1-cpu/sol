-- 캐릭터 초상화 URL (Cloudinary 등) 저장 + 공개 조회 / 관리자 upsert

CREATE TABLE IF NOT EXISTS public.hero_portraits (
  hero_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.hero_portraits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hero_portraits_deny ON public.hero_portraits;
CREATE POLICY hero_portraits_deny ON public.hero_portraits FOR ALL USING (FALSE);

REVOKE ALL ON public.hero_portraits FROM anon, authenticated;

-- hero_names: 공격 슬롯 이름도 자동완성에 포함
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
    SELECT TRIM(pet) AS name FROM public.matchups WHERE TRIM(pet) <> ''
  ) t;
$$;

-- 관리자 UI: 슬롯별로 등장한 이름 목록 (p_slot: d1,d2,d3,a1,a2,a3,pet)
CREATE OR REPLACE FUNCTION public.hero_names_by_slot(p_slot TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s TEXT := LOWER(TRIM(COALESCE(p_slot, '')));
BEGIN
  IF s = 'd1' THEN
    RETURN COALESCE((
      SELECT ARRAY_AGG(x.n ORDER BY x.n)
      FROM (
        SELECT DISTINCT TRIM(defense1) AS n FROM public.matchups
        WHERE TRIM(defense1) <> ''
      ) x
    ), ARRAY[]::TEXT[]);
  ELSIF s = 'd2' THEN
    RETURN COALESCE((
      SELECT ARRAY_AGG(x.n ORDER BY x.n)
      FROM (
        SELECT DISTINCT TRIM(defense2) AS n FROM public.matchups
        WHERE TRIM(defense2) <> ''
      ) x
    ), ARRAY[]::TEXT[]);
  ELSIF s = 'd3' THEN
    RETURN COALESCE((
      SELECT ARRAY_AGG(x.n ORDER BY x.n)
      FROM (
        SELECT DISTINCT TRIM(defense3) AS n FROM public.matchups
        WHERE TRIM(defense3) <> ''
      ) x
    ), ARRAY[]::TEXT[]);
  ELSIF s = 'a1' THEN
    RETURN COALESCE((
      SELECT ARRAY_AGG(x.n ORDER BY x.n)
      FROM (
        SELECT DISTINCT TRIM(attack1) AS n FROM public.matchups
        WHERE TRIM(attack1) <> ''
      ) x
    ), ARRAY[]::TEXT[]);
  ELSIF s = 'a2' THEN
    RETURN COALESCE((
      SELECT ARRAY_AGG(x.n ORDER BY x.n)
      FROM (
        SELECT DISTINCT TRIM(attack2) AS n FROM public.matchups
        WHERE TRIM(attack2) <> ''
      ) x
    ), ARRAY[]::TEXT[]);
  ELSIF s = 'a3' THEN
    RETURN COALESCE((
      SELECT ARRAY_AGG(x.n ORDER BY x.n)
      FROM (
        SELECT DISTINCT TRIM(attack3) AS n FROM public.matchups
        WHERE TRIM(attack3) <> ''
      ) x
    ), ARRAY[]::TEXT[]);
  ELSIF s = 'pet' THEN
    RETURN COALESCE((
      SELECT ARRAY_AGG(x.n ORDER BY x.n)
      FROM (
        SELECT DISTINCT TRIM(pet) AS n FROM public.matchups
        WHERE TRIM(pet) <> ''
      ) x
    ), ARRAY[]::TEXT[]);
  END IF;
  RETURN ARRAY[]::TEXT[];
END;
$$;

CREATE OR REPLACE FUNCTION public.hero_portraits_map()
RETURNS TABLE (hero_key TEXT, image_url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.hero_key, h.image_url FROM public.hero_portraits h;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_hero_portraits(p_session_token TEXT)
RETURNS TABLE (
  hero_key TEXT,
  display_name TEXT,
  image_url TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT h.hero_key, h.display_name, h.image_url, h.updated_at
  FROM public.hero_portraits h
  ORDER BY LOWER(h.display_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_hero_portrait(
  p_session_token TEXT,
  p_display_name TEXT,
  p_image_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k TEXT := LOWER(TRIM(COALESCE(p_display_name, '')));
  u TEXT := TRIM(COALESCE(p_image_url, ''));
  d TEXT := TRIM(COALESCE(p_display_name, ''));
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF k = '' OR u = '' OR d = '' THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  INSERT INTO public.hero_portraits (hero_key, display_name, image_url, updated_at)
  VALUES (k, d, u, NOW())
  ON CONFLICT (hero_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    image_url = EXCLUDED.image_url,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_hero_portrait(
  p_session_token TEXT,
  p_display_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k TEXT := LOWER(TRIM(COALESCE(p_display_name, '')));
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF k = '' THEN RAISE EXCEPTION 'invalid_input'; END IF;
  DELETE FROM public.hero_portraits WHERE hero_key = k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hero_names() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hero_names_by_slot(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hero_portraits_map() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_hero_portraits(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_hero_portrait(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_hero_portrait(TEXT, TEXT) TO anon;
