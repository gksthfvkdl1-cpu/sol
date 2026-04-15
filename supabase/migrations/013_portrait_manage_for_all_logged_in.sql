-- 초상화 등록/삭제/목록: 관리자 전용 → 로그인 사용자 전용으로 완화
-- (세션 토큰 유효성은 유지)

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
DECLARE
  uid UUID;
BEGIN
  uid := public.user_id_from_session(p_session_token);
  IF uid IS NULL THEN
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
  uid UUID;
  k TEXT := LOWER(TRIM(COALESCE(p_display_name, '')));
  u TEXT := TRIM(COALESCE(p_image_url, ''));
  d TEXT := TRIM(COALESCE(p_display_name, ''));
BEGIN
  uid := public.user_id_from_session(p_session_token);
  IF uid IS NULL THEN
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
  uid UUID;
  k TEXT := LOWER(TRIM(COALESCE(p_display_name, '')));
BEGIN
  uid := public.user_id_from_session(p_session_token);
  IF uid IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF k = '' THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  DELETE FROM public.hero_portraits WHERE hero_key = k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_hero_portraits(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_hero_portrait(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_hero_portrait(TEXT, TEXT) TO anon;
