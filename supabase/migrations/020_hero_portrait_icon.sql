-- 캐릭터 인게임 슬롯 아이콘 URL 컬럼 + 일반 사용자 등록/삭제 RPC
-- 기존 image_url(=큰 일러스트)는 검색 카드 표시용으로 유지하고,
-- 자동 등록(스샷 분석)에서 dHash 비교에는 인게임 아이콘과 가까운 icon_url 을 우선 사용한다.
-- 권한 정책: A안(자유 편집) — 로그인된 사용자라면 누구나 추가/덮어쓰기/삭제 가능.

-- ---------------------------------------------------------------------------
-- 1) 컬럼 추가
-- ---------------------------------------------------------------------------
ALTER TABLE public.hero_portraits
  ADD COLUMN IF NOT EXISTS icon_url TEXT NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- 2) hero_portraits_map: image_url + icon_url 모두 노출
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.hero_portraits_map();

CREATE OR REPLACE FUNCTION public.hero_portraits_map()
RETURNS TABLE (hero_key TEXT, image_url TEXT, icon_url TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.hero_key, h.image_url, h.icon_url FROM public.hero_portraits h;
$$;

GRANT EXECUTE ON FUNCTION public.hero_portraits_map() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) admin_list_hero_portraits: icon_url 추가 반환 (일반 로그인 사용자 허용)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_hero_portraits(TEXT);

CREATE OR REPLACE FUNCTION public.admin_list_hero_portraits(p_session_token TEXT)
RETURNS TABLE (
  hero_key TEXT,
  display_name TEXT,
  image_url TEXT,
  icon_url TEXT,
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
  SELECT h.hero_key, h.display_name, h.image_url, h.icon_url, h.updated_at
  FROM public.hero_portraits h
  ORDER BY LOWER(h.display_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_hero_portraits(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) 아이콘 단독 upsert: 누구나(로그인) 등록 가능
--   - 해당 캐릭터가 hero_portraits 에 없으면 image_url='' 으로 새 행 삽입
--   - 있으면 icon_url 만 갱신
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_hero_portrait_icon(
  p_session_token TEXT,
  p_display_name TEXT,
  p_icon_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
  k TEXT := LOWER(TRIM(COALESCE(p_display_name, '')));
  u TEXT := TRIM(COALESCE(p_icon_url, ''));
  d TEXT := TRIM(COALESCE(p_display_name, ''));
BEGIN
  uid := public.user_id_from_session(p_session_token);
  IF uid IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF k = '' OR u = '' OR d = '' THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  INSERT INTO public.hero_portraits (hero_key, display_name, image_url, icon_url, updated_at)
  VALUES (k, d, '', u, NOW())
  ON CONFLICT (hero_key) DO UPDATE SET
    display_name = CASE
      WHEN public.hero_portraits.display_name IS NULL OR public.hero_portraits.display_name = ''
        THEN EXCLUDED.display_name
      ELSE public.hero_portraits.display_name
    END,
    icon_url = EXCLUDED.icon_url,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_hero_portrait_icon(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) 아이콘 단독 삭제(=icon_url 비우기). 본 행이 image_url 도 비어 있으면 행 자체 제거.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_hero_portrait_icon(
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
  IF k = '' THEN RAISE EXCEPTION 'invalid_input'; END IF;
  UPDATE public.hero_portraits SET icon_url = '', updated_at = NOW()
  WHERE hero_key = k;
  DELETE FROM public.hero_portraits
  WHERE hero_key = k AND COALESCE(image_url, '') = '' AND COALESCE(icon_url, '') = '';
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_hero_portrait_icon(TEXT, TEXT) TO anon, authenticated;
