CREATE TABLE public.ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT auth.uid(),
  request_id text NOT NULL,
  meal_date date NOT NULL,
  status text NOT NULL,
  image_object_key text NOT NULL,
  candidates jsonb NOT NULL,
  overall_confidence numeric NOT NULL,
  questions jsonb NOT NULL,
  error_code text,
  confirmed_meal_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT ai_analyses_authenticated_owner CHECK (user_id IS NOT NULL AND btrim(user_id) <> ''),
  CONSTRAINT ai_analyses_request_id_present CHECK (btrim(request_id) <> '' AND char_length(request_id) <= 120),
  CONSTRAINT ai_analyses_status_known CHECK (
    status IN ('processing', 'needs-confirmation', 'failed', 'confirmed', 'discarded')
  ),
  CONSTRAINT ai_analyses_private_image_key CHECK (
    image_object_key LIKE 'users/%'
    AND image_object_key NOT LIKE '%://%'
    AND position('?' in image_object_key) = 0
    AND position('#' in image_object_key) = 0
  ),
  CONSTRAINT ai_analyses_confidence_range CHECK (overall_confidence >= 0 AND overall_confidence <= 1),
  CONSTRAINT ai_analyses_candidates_array CHECK (jsonb_typeof(candidates) = 'array'),
  CONSTRAINT ai_analyses_questions_array CHECK (jsonb_typeof(questions) = 'array')
);

CREATE UNIQUE INDEX ai_analyses_user_request_idx
  ON public.ai_analyses (user_id, request_id);

CREATE INDEX ai_analyses_user_meal_date_created_idx
  ON public.ai_analyses (user_id, meal_date, created_at DESC);

ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_analyses_select_own ON public.ai_analyses
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY ai_analyses_insert_own ON public.ai_analyses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY ai_analyses_update_own ON public.ai_analyses
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY ai_analyses_delete_own ON public.ai_analyses
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.ai_analyses FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.ai_analyses TO service_role;

CREATE FUNCTION public.create_my_photo_meal_analysis(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  submitted_payload jsonb := payload;
  inserted_analysis public.ai_analyses%ROWTYPE;
  existing_analysis public.ai_analyses%ROWTYPE;
  analysis_status text;
  submitted_candidate jsonb;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(submitted_payload) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload)) <> 7
     OR NOT (submitted_payload ?& ARRAY[
       'mealDate',
       'requestId',
       'imageObjectKey',
       'candidates',
       'overallConfidence',
       'questions',
       'errorCode'
     ])
     OR submitted_payload ?| ARRAY['user_id', 'userId', 'email']
     OR jsonb_typeof(submitted_payload -> 'mealDate') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'requestId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'imageObjectKey') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'candidates') IS DISTINCT FROM 'array'
     OR jsonb_array_length(submitted_payload -> 'candidates') > 12
     OR jsonb_typeof(submitted_payload -> 'overallConfidence') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'questions') IS DISTINCT FROM 'array'
     OR jsonb_array_length(submitted_payload -> 'questions') > 5
     OR NOT (
       jsonb_typeof(submitted_payload -> 'errorCode') = 'null'
       OR jsonb_typeof(submitted_payload -> 'errorCode') = 'string'
     )
     OR submitted_payload ->> 'mealDate' !~ '^\d{4}-\d{2}-\d{2}$'
     OR btrim(submitted_payload ->> 'requestId') = ''
     OR char_length(submitted_payload ->> 'requestId') > 120
     OR btrim(submitted_payload ->> 'imageObjectKey') = ''
     OR char_length(submitted_payload ->> 'imageObjectKey') > 500
     OR submitted_payload ->> 'imageObjectKey' NOT LIKE 'users/%'
     OR submitted_payload ->> 'imageObjectKey' LIKE '%://%'
     OR position('?' in submitted_payload ->> 'imageObjectKey') > 0
     OR position('#' in submitted_payload ->> 'imageObjectKey') > 0
     OR (submitted_payload ->> 'overallConfidence')::numeric < 0
     OR (submitted_payload ->> 'overallConfidence')::numeric > 1 THEN
    RAISE EXCEPTION 'invalid photo meal analysis payload' USING ERRCODE = '22023';
  END IF;

  FOR submitted_candidate IN SELECT value FROM jsonb_array_elements(submitted_payload -> 'candidates') AS candidate(value) LOOP
    IF jsonb_typeof(submitted_candidate) IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(submitted_candidate)) <> 7
       OR NOT (submitted_candidate ?& ARRAY['id', 'name', 'estimatedGrams', 'cookingMethod', 'nutrition', 'confidence', 'questions'])
       OR jsonb_typeof(submitted_candidate -> 'id') IS DISTINCT FROM 'string'
       OR btrim(submitted_candidate ->> 'id') = ''
       OR char_length(submitted_candidate ->> 'id') > 120
       OR jsonb_typeof(submitted_candidate -> 'name') IS DISTINCT FROM 'string'
       OR btrim(submitted_candidate ->> 'name') = ''
       OR char_length(submitted_candidate ->> 'name') > 80
       OR jsonb_typeof(submitted_candidate -> 'estimatedGrams') IS DISTINCT FROM 'number'
       OR (submitted_candidate ->> 'estimatedGrams')::numeric < 0
       OR (submitted_candidate ->> 'estimatedGrams')::numeric > 5000
       OR jsonb_typeof(submitted_candidate -> 'cookingMethod') IS DISTINCT FROM 'string'
       OR char_length(submitted_candidate ->> 'cookingMethod') > 80
       OR jsonb_typeof(submitted_candidate -> 'nutrition') IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(submitted_candidate -> 'nutrition')) <> 4
       OR NOT ((submitted_candidate -> 'nutrition') ?& ARRAY['caloriesKcal', 'proteinGrams', 'fatGrams', 'carbsGrams'])
       OR jsonb_typeof(submitted_candidate -> 'confidence') IS DISTINCT FROM 'number'
       OR (submitted_candidate ->> 'confidence')::numeric < 0
       OR (submitted_candidate ->> 'confidence')::numeric > 1
       OR jsonb_typeof(submitted_candidate -> 'questions') IS DISTINCT FROM 'array'
       OR jsonb_array_length(submitted_candidate -> 'questions') > 5
       OR (submitted_candidate #>> '{nutrition,caloriesKcal}')::numeric < 0
       OR (submitted_candidate #>> '{nutrition,proteinGrams}')::numeric < 0
       OR (submitted_candidate #>> '{nutrition,fatGrams}')::numeric < 0
       OR (submitted_candidate #>> '{nutrition,carbsGrams}')::numeric < 0 THEN
      RAISE EXCEPTION 'invalid photo meal analysis payload' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT *
  INTO existing_analysis
  FROM public.ai_analyses
  WHERE user_id = current_user_id
    AND request_id = submitted_payload ->> 'requestId';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', existing_analysis.id,
      'mealDate', to_char(existing_analysis.meal_date, 'YYYY-MM-DD'),
      'requestId', existing_analysis.request_id,
      'status', existing_analysis.status,
      'candidates', existing_analysis.candidates,
      'overallConfidence', existing_analysis.overall_confidence,
      'questions', existing_analysis.questions,
      'imageObjectKey', existing_analysis.image_object_key,
      'errorCode', existing_analysis.error_code,
      'createdAt', existing_analysis.created_at,
      'updatedAt', existing_analysis.updated_at
    );
  END IF;

  analysis_status := CASE
    WHEN jsonb_typeof(submitted_payload -> 'errorCode') = 'string' THEN 'failed'
    ELSE 'needs-confirmation'
  END;

  INSERT INTO public.ai_analyses (
    user_id,
    request_id,
    meal_date,
    status,
    image_object_key,
    candidates,
    overall_confidence,
    questions,
    error_code
  )
  VALUES (
    current_user_id,
    submitted_payload ->> 'requestId',
    (submitted_payload ->> 'mealDate')::date,
    analysis_status,
    submitted_payload ->> 'imageObjectKey',
    submitted_payload -> 'candidates',
    (submitted_payload ->> 'overallConfidence')::numeric,
    submitted_payload -> 'questions',
    NULLIF(submitted_payload ->> 'errorCode', 'null')
  )
  RETURNING * INTO inserted_analysis;

  RETURN jsonb_build_object(
    'id', inserted_analysis.id,
    'mealDate', to_char(inserted_analysis.meal_date, 'YYYY-MM-DD'),
    'requestId', inserted_analysis.request_id,
    'status', inserted_analysis.status,
    'candidates', inserted_analysis.candidates,
    'overallConfidence', inserted_analysis.overall_confidence,
    'questions', inserted_analysis.questions,
    'imageObjectKey', inserted_analysis.image_object_key,
    'errorCode', inserted_analysis.error_code,
    'createdAt', inserted_analysis.created_at,
    'updatedAt', inserted_analysis.updated_at
  );
END;
$$;

CREATE FUNCTION public.get_my_photo_meal_analysis(analysis_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  selected_analysis public.ai_analyses%ROWTYPE;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO selected_analysis
  FROM public.ai_analyses
  WHERE id = analysis_id
    AND user_id = current_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'photo meal analysis not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', selected_analysis.id,
    'mealDate', to_char(selected_analysis.meal_date, 'YYYY-MM-DD'),
    'requestId', selected_analysis.request_id,
    'status', selected_analysis.status,
    'candidates', selected_analysis.candidates,
    'overallConfidence', selected_analysis.overall_confidence,
    'questions', selected_analysis.questions,
    'imageObjectKey', selected_analysis.image_object_key,
    'errorCode', selected_analysis.error_code,
    'createdAt', selected_analysis.created_at,
    'updatedAt', selected_analysis.updated_at
  );
END;
$$;

CREATE FUNCTION public.confirm_my_photo_meal_analysis(analysis_id uuid, meal_date text, items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  selected_analysis public.ai_analyses%ROWTYPE;
  inserted_meal public.meals%ROWTYPE;
  submitted_item jsonb;
  created_meals jsonb := '[]'::jsonb;
  created_meal_ids uuid[] := ARRAY[]::uuid[];
  updated_analysis public.ai_analyses%ROWTYPE;
  item_count integer;
  grams_text text;
  cooking_method text;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF meal_date !~ '^\d{4}-\d{2}-\d{2}$'
     OR jsonb_typeof(items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(items) < 1
     OR jsonb_array_length(items) > 12 THEN
    RAISE EXCEPTION 'invalid photo meal confirmation' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO selected_analysis
  FROM public.ai_analyses
  WHERE id = analysis_id
    AND user_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'photo meal analysis not found' USING ERRCODE = 'P0002';
  END IF;

  IF selected_analysis.status <> 'needs-confirmation' THEN
    RAISE EXCEPTION 'photo meal analysis cannot be confirmed' USING ERRCODE = '22023';
  END IF;

  FOR submitted_item IN SELECT value FROM jsonb_array_elements(items) AS item(value) LOOP
    IF jsonb_typeof(submitted_item) IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(submitted_item)) <> 7
       OR NOT (submitted_item ?& ARRAY['id', 'name', 'estimatedGrams', 'cookingMethod', 'nutrition', 'confidence', 'questions'])
       OR jsonb_typeof(submitted_item -> 'name') IS DISTINCT FROM 'string'
       OR btrim(submitted_item ->> 'name') = ''
       OR char_length(submitted_item ->> 'name') > 80
       OR jsonb_typeof(submitted_item -> 'estimatedGrams') IS DISTINCT FROM 'number'
       OR (submitted_item ->> 'estimatedGrams')::numeric < 0
       OR (submitted_item ->> 'estimatedGrams')::numeric > 5000
       OR jsonb_typeof(submitted_item -> 'cookingMethod') IS DISTINCT FROM 'string'
       OR char_length(submitted_item ->> 'cookingMethod') > 80
       OR jsonb_typeof(submitted_item -> 'nutrition') IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(submitted_item -> 'nutrition')) <> 4
       OR NOT ((submitted_item -> 'nutrition') ?& ARRAY['caloriesKcal', 'proteinGrams', 'fatGrams', 'carbsGrams'])
       OR jsonb_typeof(submitted_item -> 'confidence') IS DISTINCT FROM 'number'
       OR (submitted_item ->> 'confidence')::numeric < 0
       OR (submitted_item ->> 'confidence')::numeric > 1
       OR jsonb_typeof(submitted_item -> 'questions') IS DISTINCT FROM 'array'
       OR jsonb_array_length(submitted_item -> 'questions') > 5
       OR (submitted_item #>> '{nutrition,caloriesKcal}')::numeric < 0
       OR (submitted_item #>> '{nutrition,proteinGrams}')::numeric < 0
       OR (submitted_item #>> '{nutrition,fatGrams}')::numeric < 0
       OR (submitted_item #>> '{nutrition,carbsGrams}')::numeric < 0 THEN
      RAISE EXCEPTION 'invalid photo meal confirmation' USING ERRCODE = '22023';
    END IF;

    grams_text := (submitted_item ->> 'estimatedGrams')::numeric::text || '克';
    cooking_method := btrim(submitted_item ->> 'cookingMethod');

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
      meal_date::date,
      submitted_item ->> 'name',
      CASE WHEN cooking_method = '' THEN grams_text ELSE grams_text || '，' || cooking_method END,
      (submitted_item #>> '{nutrition,caloriesKcal}')::numeric,
      (submitted_item #>> '{nutrition,proteinGrams}')::numeric,
      (submitted_item #>> '{nutrition,fatGrams}')::numeric,
      (submitted_item #>> '{nutrition,carbsGrams}')::numeric
    )
    RETURNING * INTO inserted_meal;

    created_meal_ids := array_append(created_meal_ids, inserted_meal.id);
    created_meals := created_meals || jsonb_build_array(jsonb_build_object(
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
    ));
  END LOOP;

  UPDATE public.ai_analyses
  SET status = 'confirmed',
      confirmed_meal_ids = created_meal_ids,
      updated_at = statement_timestamp()
  WHERE id = analysis_id
    AND user_id = current_user_id
  RETURNING * INTO updated_analysis;

  RETURN jsonb_build_object(
    'analysis',
    jsonb_build_object(
      'id', updated_analysis.id,
      'mealDate', to_char(updated_analysis.meal_date, 'YYYY-MM-DD'),
      'requestId', updated_analysis.request_id,
      'status', updated_analysis.status,
      'candidates', updated_analysis.candidates,
      'overallConfidence', updated_analysis.overall_confidence,
      'questions', updated_analysis.questions,
      'imageObjectKey', updated_analysis.image_object_key,
      'errorCode', updated_analysis.error_code,
      'createdAt', updated_analysis.created_at,
      'updatedAt', updated_analysis.updated_at
    ),
    'meals',
    created_meals
  );
END;
$$;

CREATE FUNCTION public.discard_my_photo_meal_analysis(analysis_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  updated_analysis public.ai_analyses%ROWTYPE;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  UPDATE public.ai_analyses
  SET status = 'discarded',
      updated_at = statement_timestamp()
  WHERE id = analysis_id
    AND user_id = current_user_id
    AND status <> 'confirmed'
  RETURNING * INTO updated_analysis;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'photo meal analysis not found or cannot be discarded' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', updated_analysis.id,
    'mealDate', to_char(updated_analysis.meal_date, 'YYYY-MM-DD'),
    'requestId', updated_analysis.request_id,
    'status', updated_analysis.status,
    'candidates', updated_analysis.candidates,
    'overallConfidence', updated_analysis.overall_confidence,
    'questions', updated_analysis.questions,
    'imageObjectKey', updated_analysis.image_object_key,
    'errorCode', updated_analysis.error_code,
    'createdAt', updated_analysis.created_at,
    'updatedAt', updated_analysis.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_photo_meal_analysis(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_photo_meal_analysis(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_my_photo_meal_analysis(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discard_my_photo_meal_analysis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_photo_meal_analysis(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_photo_meal_analysis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_my_photo_meal_analysis(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_my_photo_meal_analysis(uuid) TO authenticated;
