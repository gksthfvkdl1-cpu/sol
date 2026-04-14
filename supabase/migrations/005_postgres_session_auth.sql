-- Supabase Auth(GoTrue) 없이 Postgres 세션 + pgcrypto 비밀번호로만 로그인
-- SQL Editor에서 실행. 기존 프로젝트: profiles 가 auth.users 를 참조하면 FK 제거됨.
-- 기존 행에 password_hash 가 없으면 임시 해시가 들어가므로 로그인 후 비밀번호 변경 RPC를 쓰거나 테이블에서 수정하세요.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- auth.users 트리거 제거
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ---------------------------------------------------------------------------
-- profiles: auth.users FK 제거 + password_hash
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

UPDATE public.profiles
SET password_hash = extensions.crypt('!change-me!', extensions.gen_salt('bf'))
WHERE password_hash IS NULL OR TRIM(password_hash) = '';

ALTER TABLE public.profiles ALTER COLUMN password_hash SET NOT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ---------------------------------------------------------------------------
-- 세션
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions (user_id);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_sessions_none ON public.user_sessions;
CREATE POLICY user_sessions_none ON public.user_sessions FOR ALL USING (FALSE);

-- ---------------------------------------------------------------------------
-- 트리거/구 is_admin() 제거
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS profile_update_guard ON public.profiles;
DROP FUNCTION IF EXISTS public.profile_update_guard();
DROP FUNCTION IF EXISTS public.is_admin();

-- ---------------------------------------------------------------------------
-- 헬퍼
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_id_from_session(p_token TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id
  FROM public.user_sessions s
  WHERE s.token = p_token AND s.expires_at > NOW();
$$;

CREATE OR REPLACE FUNCTION public.username_is_privileged(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.auth_public_config c
    WHERE c.id = 1
    AND TRIM(c.admin_username_contains) <> ''
    AND POSITION(LOWER(TRIM(c.admin_username_contains)) IN LOWER(TRIM(p_username))) > 0
  );
$$;

CREATE OR REPLACE FUNCTION public.is_privileged_profile_rec(p public.profiles)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.is_admin OR public.username_is_privileged(p.username);
$$;

CREATE OR REPLACE FUNCTION public.is_signup_username_blocked(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.auth_public_config c
    WHERE c.id = 1
    AND TRIM(c.signup_forbid_username_contains) <> ''
    AND POSITION(
      LOWER(TRIM(c.signup_forbid_username_contains)) IN LOWER(TRIM(p_username))
    ) > 0
  )
  AND NOT public.username_is_privileged(p_username);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_session_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
  p public.profiles%ROWTYPE;
BEGIN
  uid := public.user_id_from_session(p_token);
  IF uid IS NULL THEN RETURN FALSE; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN public.is_privileged_profile_rec(p);
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS 재정의 (anon 만 사용, 직접 쓰기 금지 → RPC로만)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_deny_all ON public.profiles;
CREATE POLICY profiles_deny_all ON public.profiles FOR ALL USING (FALSE);

DROP POLICY IF EXISTS matchups_select_all ON public.matchups;
DROP POLICY IF EXISTS matchups_insert_auth ON public.matchups;
DROP POLICY IF EXISTS matchups_delete_admin ON public.matchups;
CREATE POLICY matchups_select_all ON public.matchups FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS edit_req_select ON public.matchup_edit_requests;
DROP POLICY IF EXISTS edit_req_insert ON public.matchup_edit_requests;
DROP POLICY IF EXISTS edit_req_deny ON public.matchup_edit_requests;
CREATE POLICY edit_req_deny ON public.matchup_edit_requests FOR ALL USING (FALSE);

REVOKE INSERT, UPDATE, DELETE ON public.matchups FROM anon, authenticated;
REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.matchup_edit_requests FROM anon, authenticated;
GRANT SELECT ON public.matchups TO anon;

-- ---------------------------------------------------------------------------
-- RPC: 회원가입 (Supabase Auth 미사용)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_register(
  p_username TEXT,
  p_password TEXT,
  p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  u TEXT := LOWER(TRIM(p_username));
  d TEXT := TRIM(p_display_name);
BEGIN
  IF LENGTH(u) < 2 OR LENGTH(p_password) < 4 OR LENGTH(d) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF public.is_signup_username_blocked(u) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reserved_username');
  END IF;
  INSERT INTO public.profiles (username, display_name, password_hash, approved, rejected)
  VALUES (
    u,
    d,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    public.username_is_privileged(u),
    FALSE
  );
  RETURN jsonb_build_object(
    'ok', true,
    'auto_approved', public.username_is_privileged(u)
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'username_taken');
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: 로그인
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_login(p_username TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r public.profiles%ROWTYPE;
  tok TEXT;
BEGIN
  SELECT * INTO r FROM public.profiles WHERE LOWER(TRIM(username)) = LOWER(TRIM(p_username));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;
  IF r.password_hash IS NULL OR r.password_hash = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;
  IF r.password_hash <> extensions.crypt(p_password, r.password_hash) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;
  IF r.rejected THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rejected');
  END IF;
  IF NOT r.approved AND NOT public.is_privileged_profile_rec(r) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_approved');
  END IF;
  tok := md5(random()::text || clock_timestamp()::text) ||
    md5(random()::text || clock_timestamp()::text);
  INSERT INTO public.user_sessions (token, user_id, expires_at)
  VALUES (tok, r.id, NOW() + INTERVAL '30 days');
  RETURN jsonb_build_object(
    'ok', true,
    'token', tok,
    'user', jsonb_build_object(
      'id', r.id,
      'username', r.username,
      'display_name', r.display_name,
      'is_admin', public.is_privileged_profile_rec(r)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_logout(p_session_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_sessions WHERE token = p_session_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_session_profile(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
  p public.profiles%ROWTYPE;
BEGIN
  uid := public.user_id_from_session(p_session_token);
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'is_admin', public.is_privileged_profile_rec(p)
  );
END;
$$;

-- privileged 자동 승인 (회원가입 직후에도 필요하면 아래 주석 해제)
-- UPDATE public.profiles SET approved = TRUE WHERE is_privileged_profile_rec(profiles.*) ...

-- ---------------------------------------------------------------------------
-- 앱: 공략 등록/삭제/수정신청
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_insert_matchup(
  p_session_token TEXT,
  p_defense1 TEXT,
  p_defense2 TEXT,
  p_defense3 TEXT,
  p_attack1 TEXT,
  p_attack2 TEXT,
  p_attack3 TEXT,
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
    skill_order, notes, author_id
  ) VALUES (
    TRIM(p_defense1), TRIM(p_defense2), TRIM(p_defense3),
    TRIM(p_attack1), TRIM(p_attack2), TRIM(p_attack3),
    COALESCE(TRIM(p_skill_order), ''), COALESCE(TRIM(p_notes), ''),
    uid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_delete_matchup(
  p_session_token TEXT,
  p_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.matchups WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_submit_edit_request(
  p_session_token TEXT,
  p_matchup_id BIGINT,
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
  INSERT INTO public.matchup_edit_requests (matchup_id, requester_id, skill_order, notes, status)
  VALUES (p_matchup_id, uid, COALESCE(TRIM(p_skill_order), ''), COALESCE(TRIM(p_notes), ''), 'pending');
END;
$$;

-- ---------------------------------------------------------------------------
-- 관리자 패널 한 번에
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 관리자 RPC (세션 토큰)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_profile_approved(
  p_session_token TEXT,
  p_user_id UUID,
  p_approved BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_approved THEN
    UPDATE public.profiles SET approved = TRUE, rejected = FALSE WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles SET rejected = TRUE WHERE id = p_user_id;
  END IF;
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
  SET skill_order = TRIM(r.skill_order), notes = TRIM(r.notes)
  WHERE id = r.matchup_id;
  UPDATE public.matchup_edit_requests SET status = 'approved' WHERE id = p_req_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_edit_request(
  p_session_token TEXT,
  p_req_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.matchup_edit_requests SET status = 'rejected' WHERE id = p_req_id AND status = 'pending';
END;
$$;

-- ---------------------------------------------------------------------------
-- GRANT (anon 만 사용)
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.app_register(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_login(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_logout(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_session_profile(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_insert_matchup(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_delete_matchup(TEXT, BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_submit_edit_request(TEXT, BIGINT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_admin_panel_data(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_approved(TEXT, UUID, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_edit_request(TEXT, BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION public.reject_edit_request(TEXT, BIGINT) TO anon;

-- 기존 RPC 유지
GRANT EXECUTE ON FUNCTION public.hero_names() TO anon;
GRANT EXECUTE ON FUNCTION public.search_matchups(TEXT, TEXT, TEXT, TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION public.vote_matchup(BIGINT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_auth_config() TO anon;

-- DROP old overloads if exist
DROP FUNCTION IF EXISTS public.admin_set_profile_approved(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.approve_edit_request(BIGINT);
DROP FUNCTION IF EXISTS public.reject_edit_request(BIGINT);
