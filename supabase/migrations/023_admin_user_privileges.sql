-- 관리자: 가입 사용자 is_admin 부여/해제 (OR 규칙 유지)

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
          'created_at', p.created_at
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

CREATE OR REPLACE FUNCTION public.app_admin_set_user_admin(
  p_session_token TEXT,
  p_user_id UUID,
  p_is_admin BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placeholder CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
  v_target public.profiles%ROWTYPE;
  v_remaining INT;
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL OR p_user_id = v_placeholder THEN
    RAISE EXCEPTION 'invalid_user';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_target.username = '__deleted_user__' THEN
    RAISE EXCEPTION 'invalid_user';
  END IF;

  IF NOT COALESCE(p_is_admin, FALSE) THEN
    SELECT COUNT(*)::INT INTO v_remaining
    FROM public.profiles p
    WHERE p.id <> v_placeholder
      AND p.username <> '__deleted_user__'
      AND (
        CASE
          WHEN p.id = p_user_id THEN public.username_is_privileged(p.username)
          ELSE public.is_privileged_profile_rec(p)
        END
      );

    IF v_remaining < 1 THEN
      RAISE EXCEPTION 'last_admin';
    END IF;
  END IF;

  UPDATE public.profiles
  SET is_admin = COALESCE(p_is_admin, FALSE)
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_admin_list_users(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_admin_set_user_admin(TEXT, UUID, BOOLEAN) TO anon;
