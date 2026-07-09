-- 마지막 접속 시각 (관리자 RPC에서만 조회)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.get_session_profile(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
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

  UPDATE public.user_sessions
  SET expires_at = NOW() + INTERVAL '30 days'
  WHERE token = p_session_token;

  UPDATE public.profiles
  SET last_seen_at = NOW()
  WHERE id = uid;

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

  UPDATE public.profiles
  SET last_seen_at = NOW()
  WHERE id = r.id;

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

CREATE OR REPLACE FUNCTION public.app_admin_list_users(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placeholder CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
  j JSONB;
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'admin_username_contains',
    COALESCE((
      SELECT TRIM(c.admin_username_contains)
      FROM public.auth_public_config c
      WHERE c.id = 1
    ), ''),
    'users',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'username', p.username,
          'display_name', p.display_name,
          'approved', p.approved,
          'rejected', p.rejected,
          'is_admin', p.is_admin,
          'is_rule_admin', public.username_is_privileged(p.username),
          'is_effective_admin', public.is_privileged_profile_rec(p),
          'created_at', p.created_at,
          'last_seen_at', p.last_seen_at
        )
        ORDER BY
          public.is_privileged_profile_rec(p) DESC,
          LOWER(p.username)
      )
      FROM public.profiles p
      WHERE p.id <> v_placeholder
        AND p.username <> '__deleted_user__'
    ), '[]'::jsonb)
  ) INTO j;

  RETURN j;
END;
$$;
