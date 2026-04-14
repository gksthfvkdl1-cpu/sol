-- Supabase SQL Editor에서 한 번 실행하거나, CLI 마이그레이션으로 적용하세요.
-- 이후 Authentication에서 이메일 확인을 끄거나(개발), Site URL을 Pages 주소로 맞추세요.

-- 확장 (필요 시)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  rejected BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 로그인/관리자 규칙 (프론트: RPC get_public_auth_config)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_public_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  admin_username_contains TEXT NOT NULL DEFAULT 'gksthfvkdl',
  admin_email_exact TEXT NOT NULL DEFAULT 'gksthfvkdl@naver.com',
  signup_forbid_username_contains TEXT NOT NULL DEFAULT 'gksthfvkdl',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.auth_public_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.auth_public_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_public_config_select ON public.auth_public_config;
CREATE POLICY auth_public_config_select ON public.auth_public_config
  FOR SELECT USING (TRUE);

GRANT SELECT ON public.auth_public_config TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_auth_config()
RETURNS TABLE (
  admin_username_contains TEXT,
  admin_email_exact TEXT,
  signup_forbid_username_contains TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.admin_username_contains, c.admin_email_exact, c.signup_forbid_username_contains
  FROM public.auth_public_config c
  WHERE c.id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_auth_config() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (
      p.is_admin OR
      (
        TRIM(BOTH FROM cfg.admin_username_contains) <> '' AND
        POSITION(
          LOWER(TRIM(cfg.admin_username_contains)) IN LOWER(TRIM(p.username))
        ) > 0
      )
    )
    FROM public.profiles p
    CROSS JOIN public.auth_public_config cfg
    WHERE p.id = auth.uid() AND cfg.id = 1
  ), FALSE)
  OR EXISTS (
    SELECT 1
    FROM auth.users u
    INNER JOIN public.auth_public_config cfg ON cfg.id = 1
    WHERE u.id = auth.uid()
    AND LOWER(TRIM(u.email::text)) = LOWER(TRIM(cfg.admin_email_exact))
  );
$$;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (
    id = auth.uid() OR public.is_admin()
  );

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.profile_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.approved := OLD.approved;
    NEW.rejected := OLD.rejected;
    NEW.is_admin := OLD.is_admin;
    NEW.username := OLD.username;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_update_guard ON public.profiles;
CREATE TRIGGER profile_update_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.profile_update_guard();

-- ---------------------------------------------------------------------------
-- matchups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matchups (
  id BIGSERIAL PRIMARY KEY,
  defense1 TEXT NOT NULL,
  defense2 TEXT NOT NULL,
  defense3 TEXT NOT NULL,
  attack1 TEXT NOT NULL,
  attack2 TEXT NOT NULL,
  attack3 TEXT NOT NULL,
  skill_order TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  win INTEGER NOT NULL DEFAULT 0,
  lose INTEGER NOT NULL DEFAULT 0,
  author_id UUID NOT NULL REFERENCES public.profiles (id)
);

CREATE INDEX IF NOT EXISTS idx_matchups_def ON public.matchups (defense1, defense2, defense3);

ALTER TABLE public.matchups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matchups_select_all ON public.matchups;
CREATE POLICY matchups_select_all ON public.matchups
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS matchups_insert_auth ON public.matchups;
CREATE POLICY matchups_insert_auth ON public.matchups
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS matchups_delete_admin ON public.matchups;
CREATE POLICY matchups_delete_admin ON public.matchups
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- matchup_edit_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matchup_edit_requests (
  id BIGSERIAL PRIMARY KEY,
  matchup_id BIGINT NOT NULL REFERENCES public.matchups (id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles (id),
  skill_order TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.matchup_edit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS edit_req_select ON public.matchup_edit_requests;
CREATE POLICY edit_req_select ON public.matchup_edit_requests
  FOR SELECT USING (
    public.is_admin() OR requester_id = auth.uid()
  );

DROP POLICY IF EXISTS edit_req_insert ON public.matchup_edit_requests;
CREATE POLICY edit_req_insert ON public.matchup_edit_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 신규 가입 시 profiles 자동 생성
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    FALSE
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION '이미 사용 중인 아이디입니다.';
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPC: 영웅 이름 목록
-- ---------------------------------------------------------------------------
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
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.hero_names() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: 공략 검색 (제외 필터는 앱에서 후처리하거나 p_exclude 사용)
-- ---------------------------------------------------------------------------
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
    (p_d1 IS NULL OR TRIM(p_d1) = '' OR m.defense1 ILIKE '%' || TRIM(p_d1) || '%')
    AND (p_d2 IS NULL OR TRIM(p_d2) = '' OR m.defense2 ILIKE '%' || TRIM(p_d2) || '%')
    AND (p_d3 IS NULL OR TRIM(p_d3) = '' OR m.defense3 ILIKE '%' || TRIM(p_d3) || '%')
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

GRANT EXECUTE ON FUNCTION public.search_matchups(TEXT, TEXT, TEXT, TEXT[]) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: 투표
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vote_matchup(p_id BIGINT, p_outcome TEXT)
RETURNS public.matchups
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.matchups;
BEGIN
  IF p_outcome NOT IN ('win', 'lose') THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;
  IF p_outcome = 'win' THEN
    UPDATE public.matchups SET win = win + 1 WHERE id = p_id RETURNING * INTO r;
  ELSE
    UPDATE public.matchups SET lose = lose + 1 WHERE id = p_id RETURNING * INTO r;
  END IF;
  IF r IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;
  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_matchup(BIGINT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 관리자: 가입 승인 / 거절
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_profile_approved(p_user_id UUID, p_approved BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_approved THEN
    UPDATE public.profiles SET approved = TRUE, rejected = FALSE WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles SET rejected = TRUE WHERE id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_profile_approved(UUID, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 관리자: 수정 신청 승인 / 거절
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_edit_request(p_req_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.matchup_edit_requests;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO r FROM public.matchup_edit_requests WHERE id = p_req_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found';
  END IF;
  UPDATE public.matchups
  SET skill_order = TRIM(r.skill_order), notes = TRIM(r.notes)
  WHERE id = r.matchup_id;
  UPDATE public.matchup_edit_requests SET status = 'approved' WHERE id = p_req_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_edit_request(p_req_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.matchup_edit_requests SET status = 'rejected' WHERE id = p_req_id AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_edit_request(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_edit_request(BIGINT) TO authenticated;
