CREATE TABLE public.meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT auth.uid(),
  meal_date date NOT NULL,
  name text NOT NULL,
  amount text NOT NULL,
  calories_kcal numeric NOT NULL,
  protein_grams numeric NOT NULL,
  fat_grams numeric NOT NULL,
  carbs_grams numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT meals_authenticated_owner CHECK (user_id IS NOT NULL AND btrim(user_id) <> ''),
  CONSTRAINT meals_name_present CHECK (btrim(name) <> '' AND char_length(name) <= 80),
  CONSTRAINT meals_amount_present CHECK (btrim(amount) <> '' AND char_length(amount) <= 80),
  CONSTRAINT meals_nutrition_nonnegative CHECK (
    calories_kcal >= 0
    AND protein_grams >= 0
    AND fat_grams >= 0
    AND carbs_grams >= 0
  ),
  CONSTRAINT meals_nutrition_js_finite CHECK (
    calories_kcal <= 1.7976931348623157e308::numeric
    AND protein_grams <= 1.7976931348623157e308::numeric
    AND fat_grams <= 1.7976931348623157e308::numeric
    AND carbs_grams <= 1.7976931348623157e308::numeric
  )
);

CREATE INDEX meals_user_date_created_idx
  ON public.meals (user_id, meal_date, created_at DESC);

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY meals_select_own ON public.meals
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY meals_insert_own ON public.meals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY meals_update_own ON public.meals
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY meals_delete_own ON public.meals
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.meals FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.meals TO service_role;

CREATE FUNCTION public.list_my_meals_by_date(meal_date text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  requested_date date;
  result jsonb;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF meal_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid meal date' USING ERRCODE = '22023';
  END IF;

  requested_date := meal_date::date;

  WITH selected_meals AS (
    SELECT meal.id,
           meal.meal_date,
           meal.name,
           meal.amount,
           meal.calories_kcal,
           meal.protein_grams,
           meal.fat_grams,
           meal.carbs_grams,
           meal.created_at,
           meal.updated_at
    FROM public.meals AS meal
    WHERE meal.user_id = current_user_id
      AND meal.meal_date = requested_date
    ORDER BY meal.created_at, meal.id
  )
  SELECT jsonb_build_object(
    'meals',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', selected_meal.id,
          'mealDate', to_char(selected_meal.meal_date, 'YYYY-MM-DD'),
          'name', selected_meal.name,
          'amount', selected_meal.amount,
          'nutrition', jsonb_build_object(
            'caloriesKcal', selected_meal.calories_kcal,
            'proteinGrams', selected_meal.protein_grams,
            'fatGrams', selected_meal.fat_grams,
            'carbsGrams', selected_meal.carbs_grams
          ),
          'createdAt', selected_meal.created_at,
          'updatedAt', selected_meal.updated_at
        )
      ),
      '[]'::jsonb
    ),
    'totals',
    jsonb_build_object(
      'caloriesKcal', COALESCE(sum(selected_meal.calories_kcal), 0),
      'proteinGrams', COALESCE(sum(selected_meal.protein_grams), 0),
      'fatGrams', COALESCE(sum(selected_meal.fat_grams), 0),
      'carbsGrams', COALESCE(sum(selected_meal.carbs_grams), 0)
    )
  )
  INTO result
  FROM selected_meals AS selected_meal;

  RETURN result;
END;
$$;

CREATE FUNCTION public.create_my_meal(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  submitted_payload jsonb := payload;
  inserted_meal public.meals%ROWTYPE;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(submitted_payload) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload)) <> 4
     OR NOT (submitted_payload ?& ARRAY['mealDate', 'name', 'amount', 'nutrition'])
     OR jsonb_typeof(submitted_payload -> 'mealDate') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'amount') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'nutrition') IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload -> 'nutrition')) <> 4
     OR NOT ((submitted_payload -> 'nutrition') ?& ARRAY[
       'caloriesKcal',
       'proteinGrams',
       'fatGrams',
       'carbsGrams'
     ])
     OR jsonb_typeof(submitted_payload -> 'nutrition' -> 'caloriesKcal') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'nutrition' -> 'proteinGrams') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'nutrition' -> 'fatGrams') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'nutrition' -> 'carbsGrams') IS DISTINCT FROM 'number'
     OR btrim(submitted_payload ->> 'name') = ''
     OR char_length(submitted_payload ->> 'name') > 80
     OR btrim(submitted_payload ->> 'amount') = ''
     OR char_length(submitted_payload ->> 'amount') > 80
     OR submitted_payload ->> 'mealDate' !~ '^\d{4}-\d{2}-\d{2}$'
     OR (submitted_payload #>> '{nutrition,caloriesKcal}')::numeric < 0
     OR (submitted_payload #>> '{nutrition,proteinGrams}')::numeric < 0
     OR (submitted_payload #>> '{nutrition,fatGrams}')::numeric < 0
     OR (submitted_payload #>> '{nutrition,carbsGrams}')::numeric < 0
     OR (submitted_payload #>> '{nutrition,caloriesKcal}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{nutrition,proteinGrams}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{nutrition,fatGrams}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{nutrition,carbsGrams}')::numeric > 1.7976931348623157e308::numeric THEN
    RAISE EXCEPTION 'invalid meal payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.meals (
    user_id,
    meal_date,
    name,
    amount,
    calories_kcal,
    protein_grams,
    fat_grams,
    carbs_grams
  )
  VALUES (
    current_user_id,
    (submitted_payload ->> 'mealDate')::date,
    submitted_payload ->> 'name',
    submitted_payload ->> 'amount',
    (submitted_payload #>> '{nutrition,caloriesKcal}')::numeric,
    (submitted_payload #>> '{nutrition,proteinGrams}')::numeric,
    (submitted_payload #>> '{nutrition,fatGrams}')::numeric,
    (submitted_payload #>> '{nutrition,carbsGrams}')::numeric
  )
  RETURNING * INTO inserted_meal;

  RETURN jsonb_build_object(
    'id', inserted_meal.id,
    'mealDate', to_char(inserted_meal.meal_date, 'YYYY-MM-DD'),
    'name', inserted_meal.name,
    'amount', inserted_meal.amount,
    'nutrition', jsonb_build_object(
      'caloriesKcal', inserted_meal.calories_kcal,
      'proteinGrams', inserted_meal.protein_grams,
      'fatGrams', inserted_meal.fat_grams,
      'carbsGrams', inserted_meal.carbs_grams
    ),
    'createdAt', inserted_meal.created_at,
    'updatedAt', inserted_meal.updated_at
  );
END;
$$;

CREATE FUNCTION public.update_my_meal(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  submitted_payload jsonb := payload;
  updated_meal public.meals%ROWTYPE;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(submitted_payload) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload)) <> 5
     OR NOT (submitted_payload ?& ARRAY['id', 'mealDate', 'name', 'amount', 'nutrition'])
     OR jsonb_typeof(submitted_payload -> 'id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'mealDate') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'amount') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'nutrition') IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload -> 'nutrition')) <> 4
     OR NOT ((submitted_payload -> 'nutrition') ?& ARRAY[
       'caloriesKcal',
       'proteinGrams',
       'fatGrams',
       'carbsGrams'
     ])
     OR jsonb_typeof(submitted_payload -> 'nutrition' -> 'caloriesKcal') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'nutrition' -> 'proteinGrams') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'nutrition' -> 'fatGrams') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'nutrition' -> 'carbsGrams') IS DISTINCT FROM 'number'
     OR btrim(submitted_payload ->> 'id') = ''
     OR btrim(submitted_payload ->> 'name') = ''
     OR char_length(submitted_payload ->> 'name') > 80
     OR btrim(submitted_payload ->> 'amount') = ''
     OR char_length(submitted_payload ->> 'amount') > 80
     OR submitted_payload ->> 'mealDate' !~ '^\d{4}-\d{2}-\d{2}$'
     OR (submitted_payload #>> '{nutrition,caloriesKcal}')::numeric < 0
     OR (submitted_payload #>> '{nutrition,proteinGrams}')::numeric < 0
     OR (submitted_payload #>> '{nutrition,fatGrams}')::numeric < 0
     OR (submitted_payload #>> '{nutrition,carbsGrams}')::numeric < 0
     OR (submitted_payload #>> '{nutrition,caloriesKcal}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{nutrition,proteinGrams}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{nutrition,fatGrams}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{nutrition,carbsGrams}')::numeric > 1.7976931348623157e308::numeric THEN
    RAISE EXCEPTION 'invalid meal payload' USING ERRCODE = '22023';
  END IF;

  UPDATE public.meals
  SET meal_date = (submitted_payload ->> 'mealDate')::date,
      name = submitted_payload ->> 'name',
      amount = submitted_payload ->> 'amount',
      calories_kcal = (submitted_payload #>> '{nutrition,caloriesKcal}')::numeric,
      protein_grams = (submitted_payload #>> '{nutrition,proteinGrams}')::numeric,
      fat_grams = (submitted_payload #>> '{nutrition,fatGrams}')::numeric,
      carbs_grams = (submitted_payload #>> '{nutrition,carbsGrams}')::numeric,
      updated_at = statement_timestamp()
  WHERE user_id = current_user_id
    AND id = (submitted_payload ->> 'id')::uuid
  RETURNING * INTO updated_meal;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'meal not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', updated_meal.id,
    'mealDate', to_char(updated_meal.meal_date, 'YYYY-MM-DD'),
    'name', updated_meal.name,
    'amount', updated_meal.amount,
    'nutrition', jsonb_build_object(
      'caloriesKcal', updated_meal.calories_kcal,
      'proteinGrams', updated_meal.protein_grams,
      'fatGrams', updated_meal.fat_grams,
      'carbsGrams', updated_meal.carbs_grams
    ),
    'createdAt', updated_meal.created_at,
    'updatedAt', updated_meal.updated_at
  );
END;
$$;

CREATE FUNCTION public.delete_my_meal(meal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.meals
  WHERE user_id = current_user_id
    AND id = meal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'meal not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE FUNCTION public.copy_my_meal(meal_id uuid, target_meal_date text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  source_meal public.meals%ROWTYPE;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF target_meal_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid meal payload' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO source_meal
  FROM public.meals
  WHERE user_id = current_user_id
    AND id = meal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'meal not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.create_my_meal(jsonb_build_object(
    'mealDate', target_meal_date,
    'name', source_meal.name,
    'amount', source_meal.amount,
    'nutrition', jsonb_build_object(
      'caloriesKcal', source_meal.calories_kcal,
      'proteinGrams', source_meal.protein_grams,
      'fatGrams', source_meal.fat_grams,
      'carbsGrams', source_meal.carbs_grams
    )
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_meals_by_date(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_my_meal(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_my_meal(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_meal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.copy_my_meal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_meals_by_date(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_meal(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_meal(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_meal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_my_meal(uuid, text) TO authenticated;
