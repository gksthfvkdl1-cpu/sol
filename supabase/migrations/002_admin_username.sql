-- 이미 001_initial.sql 을 적용한 프로젝트용 패치:
-- username 이 gksthfvkdl 인 계정도 관리자로 인식 (is_admin 컬럼 없이도 가능).
-- Supabase SQL Editor에서 한 번 실행하세요.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (p.is_admin OR LOWER(TRIM(p.username)) = 'gksthfvkdl')
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ), FALSE);
$$;

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
