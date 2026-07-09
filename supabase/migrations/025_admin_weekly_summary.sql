-- 관리자: 주간 요약 (이번 주 공략·대기 신청·접속 사용자)

CREATE OR REPLACE FUNCTION public.app_admin_weekly_summary(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placeholder CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
  ws DATE;
  we DATE;
  yesterday DATE;
  j JSONB;
BEGIN
  IF NOT public.is_admin_session_token(p_session_token) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  ws := public.year_week_start(NOW());
  we := ws + 6;
  yesterday := public.vote_calendar_date_seoul(NOW()) - 1;

  SELECT jsonb_build_object(
    'week_start', ws,
    'week_end', we,
    'new_matchups_this_week', (
      SELECT COUNT(*)::INT
      FROM public.matchups m
      WHERE public.year_week_start(m.created_at) = ws
    ),
    'pending_signups', (
      SELECT COUNT(*)::INT
      FROM public.profiles p
      WHERE p.id <> v_placeholder
        AND p.username <> '__deleted_user__'
        AND p.approved = FALSE
        AND p.rejected = FALSE
    ),
    'pending_edit_requests', (
      SELECT COUNT(*)::INT
      FROM public.matchup_edit_requests e
      WHERE e.status = 'pending'
    ),
    'active_users_yesterday', (
      SELECT COUNT(*)::INT
      FROM public.profiles p
      WHERE p.id <> v_placeholder
        AND p.username <> '__deleted_user__'
        AND p.last_seen_at IS NOT NULL
        AND public.vote_calendar_date_seoul(p.last_seen_at) = yesterday
    ),
    'active_users_this_week', (
      SELECT COUNT(*)::INT
      FROM public.profiles p
      WHERE p.id <> v_placeholder
        AND p.username <> '__deleted_user__'
        AND p.last_seen_at IS NOT NULL
        AND public.year_week_start(p.last_seen_at) = ws
    )
  ) INTO j;

  RETURN j;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_admin_weekly_summary(TEXT) TO anon;
