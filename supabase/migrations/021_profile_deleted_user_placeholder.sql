-- 프로필 삭제 시 매치업/공략/수정 요청의 작성자(FK) 참조를 자동으로
-- 자리표시 프로필("나간사람") 로 옮긴다. NULL 로 두면 NOT NULL/RLS 정책과 충돌하므로
-- 별도 자리표시 행을 두는 방식이 가장 단순하고 정합성이 좋다.
--
-- 005_postgres_session_auth.sql 이후로 profiles 가 auth.users 를 FK 로 참조하지 않으므로
-- profiles 행 하나만 직접 만들면 된다.

-- ---------------------------------------------------------------------------
-- 1) "나간사람" 자리표시 프로필 (고정 UUID = all-zero)
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (
  id, username, display_name, approved, rejected, is_admin, password_hash, created_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '__deleted_user__',
  '나간사람',
  TRUE,
  FALSE,
  FALSE,
  '!disabled-login!',  -- crypt() 와 절대 일치하지 않는 더미 해시
  NOW()
)
ON CONFLICT (id) DO UPDATE
  SET username = EXCLUDED.username,
      display_name = EXCLUDED.display_name,
      approved = EXCLUDED.approved,
      rejected = EXCLUDED.rejected,
      is_admin = EXCLUDED.is_admin;

-- ---------------------------------------------------------------------------
-- 2) 프로필 삭제 시 자식 테이블 FK 를 자리표시 프로필로 재할당
--    SECURITY DEFINER 로 RLS 를 우회한다.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile_delete_reassign_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placeholder CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF OLD.id = v_placeholder THEN
    RAISE EXCEPTION '"나간사람" 자리표시 프로필은 삭제할 수 없습니다';
  END IF;

  UPDATE public.matchups
    SET author_id = v_placeholder
    WHERE author_id = OLD.id;

  UPDATE public.siege_plans
    SET author_id = v_placeholder
    WHERE author_id = OLD.id;

  UPDATE public.matchup_edit_requests
    SET requester_id = v_placeholder
    WHERE requester_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS profile_delete_reassign_refs_tr ON public.profiles;
CREATE TRIGGER profile_delete_reassign_refs_tr
BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profile_delete_reassign_refs();
