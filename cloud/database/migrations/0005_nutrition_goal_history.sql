ALTER TABLE public.nutrition_goals
  ADD COLUMN effective_date date;

UPDATE public.nutrition_goals
SET effective_date = created_at::date
WHERE effective_date IS NULL;

ALTER TABLE public.nutrition_goals
  ALTER COLUMN effective_date SET NOT NULL,
  ALTER COLUMN effective_date SET DEFAULT CURRENT_DATE;

CREATE INDEX nutrition_goals_user_effective_idx
  ON public.nutrition_goals (user_id, effective_date DESC, version DESC);

CREATE FUNCTION public.list_my_nutrition_goals_by_date_range(start_date text, end_date text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  start_day date;
  end_day date;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF start_date !~ '^\d{4}-\d{2}-\d{2}$'
     OR end_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid date range' USING ERRCODE = '22007';
  END IF;

  start_day := start_date::date;
  end_day := end_date::date;

  IF start_day > end_day THEN
    RAISE EXCEPTION 'invalid date range' USING ERRCODE = '22007';
  END IF;

  RETURN COALESCE((
    WITH selected AS (
      SELECT goal.user_id, goal.version, goal.effective_date, goal.payload, goal.created_at
      FROM public.nutrition_goals AS goal
      WHERE goal.user_id = current_user_id
        AND goal.effective_date BETWEEN start_day AND end_day
      UNION
      SELECT coverage.user_id, coverage.version, coverage.effective_date, coverage.payload, coverage.created_at
      FROM (
        SELECT goal.user_id, goal.version, goal.effective_date, goal.payload, goal.created_at
        FROM public.nutrition_goals AS goal
        WHERE goal.user_id = current_user_id
          AND goal.effective_date <= start_day
        ORDER BY goal.effective_date DESC, goal.version DESC
        LIMIT 1
      ) AS coverage
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'version', selected.version,
        'effectiveDate', to_char(selected.effective_date, 'YYYY-MM-DD'),
        'targets', selected.payload,
        'createdAt', selected.created_at
      )
      ORDER BY selected.effective_date, selected.version
    )
    FROM selected
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_nutrition_goals_by_date_range(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_nutrition_goals_by_date_range(text, text) TO authenticated;
