-- 기존 DB용: 아이디 gksthfvkdl 접두사 + gksthfvkdl@naver.com 이메일 관리자 인식
-- Supabase SQL Editor에서 한 번 실행

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
      LOWER(TRIM(p.username)) LIKE 'gksthfvkdl%'
    )
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ), FALSE)
  OR EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
    AND LOWER(TRIM(u.email::text)) = 'gksthfvkdl@naver.com'
  );
$$;
