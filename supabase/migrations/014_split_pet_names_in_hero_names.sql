-- hero_names(): pet 컬럼에 "a / b / c" 형태로 저장된 경우 개별 이름으로 분리

CREATE OR REPLACE FUNCTION public.hero_names()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY_AGG(name ORDER BY LOWER(name)),
    ARRAY[]::TEXT[]
  )
  FROM (
    SELECT TRIM(defense1) AS name FROM public.matchups WHERE TRIM(defense1) <> ''
    UNION
    SELECT TRIM(defense2) AS name FROM public.matchups WHERE TRIM(defense2) <> ''
    UNION
    SELECT TRIM(defense3) AS name FROM public.matchups WHERE TRIM(defense3) <> ''
    UNION
    SELECT TRIM(attack1) AS name FROM public.matchups WHERE TRIM(attack1) <> ''
    UNION
    SELECT TRIM(attack2) AS name FROM public.matchups WHERE TRIM(attack2) <> ''
    UNION
    SELECT TRIM(attack3) AS name FROM public.matchups WHERE TRIM(attack3) <> ''
    UNION
    SELECT TRIM(x.pet_name) AS name
    FROM public.matchups m
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(m.pet, ''), '\s*/\s*') AS x(pet_name)
    WHERE TRIM(x.pet_name) <> ''
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.hero_names() TO anon, authenticated;
