-- 기존 DB용: 로그인/관리자 규칙을 테이블 + RPC로 관리
-- Supabase SQL Editor에서 한 번 실행

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
