-- 로그인 세션: 앱이 프로필을 조회할 때마다 만료 시각을 연장해
-- 브라우저에 토큰이 남아 있는 동안(로그아웃 전까지) 끊기지 않게 함.

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
