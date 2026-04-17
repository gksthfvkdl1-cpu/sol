-- 수정 신청·승인 시 펫(pet) 필드 포함

ALTER TABLE public.matchup_edit_requests
  ADD COLUMN IF NOT EXISTS pet TEXT NOT NULL DEFAULT '';

DROP FUNCTION IF EXISTS public.app_submit_edit_request(TEXT, BIGINT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.app_submit_edit_request(
  p_session_token TEXT,
  p_matchup_id BIGINT,
  p_skill_order TEXT,
  p_notes TEXT,
  p_pet TEXT
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
  INSERT INTO public.matchup_edit_requests (
    matchup_id, requester_id, skill_order, notes, pet, status
  )
  VALUES (
    p_matchup_id,
    uid,
    COALESCE(TRIM(p_skill_order), ''),
    COALESCE(TRIM(p_notes), ''),
    COALESCE(TRIM(p_pet), ''),
    'pending'
  );
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
  SET
    skill_order = TRIM(r.skill_order),
    notes = TRIM(r.notes),
    pet = TRIM(r.pet),
    updated_at = NOW()
  WHERE id = r.matchup_id;
  UPDATE public.matchup_edit_requests SET status = 'approved' WHERE id = p_req_id;
END;
$$;

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
        'pet', e.pet,
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

GRANT EXECUTE ON FUNCTION public.app_submit_edit_request(TEXT, BIGINT, TEXT, TEXT, TEXT) TO anon;
