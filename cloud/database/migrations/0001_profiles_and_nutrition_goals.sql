CREATE TABLE public.profiles (
  user_id text PRIMARY KEY DEFAULT auth.uid(),
  payload jsonb NOT NULL,
  goal_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT profiles_authenticated_owner CHECK (user_id IS NOT NULL AND btrim(user_id) <> ''),
  CONSTRAINT profiles_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT profiles_schema_version CHECK (payload @> '{"schemaVersion": 1}'::jsonb),
  CONSTRAINT profiles_goal_version_positive CHECK (goal_version > 0)
);

CREATE TABLE public.nutrition_goals (
  user_id text NOT NULL DEFAULT auth.uid(),
  version integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (user_id, version),
  CONSTRAINT nutrition_goals_profile_fk
    FOREIGN KEY (user_id) REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  CONSTRAINT nutrition_goals_authenticated_owner CHECK (user_id IS NOT NULL AND btrim(user_id) <> ''),
  CONSTRAINT nutrition_goals_version_positive CHECK (version > 0),
  CONSTRAINT nutrition_goals_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX nutrition_goals_user_created_idx
  ON public.nutrition_goals (user_id, created_at DESC);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY profiles_delete_own ON public.profiles
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY nutrition_goals_select_own ON public.nutrition_goals
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY nutrition_goals_insert_own ON public.nutrition_goals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY nutrition_goals_update_own ON public.nutrition_goals
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY nutrition_goals_delete_own ON public.nutrition_goals
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.profiles, public.nutrition_goals FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.profiles, public.nutrition_goals TO service_role;

CREATE FUNCTION public.save_my_profile_settings(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  submitted_payload jsonb := payload;
  next_version integer;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  -- Validate the JSON shape in stages so no cast is evaluated before its type guard.
  IF jsonb_typeof(submitted_payload) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload)) <> 5
     OR NOT (submitted_payload ?& ARRAY[
       'schemaVersion',
       'inputs',
       'trainingDaysPerWeek',
       'trainingExperience',
       'targets'
     ])
     OR jsonb_typeof(submitted_payload -> 'schemaVersion') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'inputs') IS DISTINCT FROM 'object'
     OR jsonb_typeof(submitted_payload -> 'trainingDaysPerWeek') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'trainingExperience') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'targets') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid profile settings payload' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM jsonb_object_keys(submitted_payload -> 'inputs')) <> 8
     OR NOT ((submitted_payload -> 'inputs') ?& ARRAY[
       'age',
       'sex',
       'heightCm',
       'weightKg',
       'activityLevel',
       'proteinGramsPerKg',
       'fatCalorieRatio',
       'surplusRatio'
     ])
     OR jsonb_typeof(submitted_payload -> 'inputs' -> 'age') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'inputs' -> 'sex') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'inputs' -> 'heightCm') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'inputs' -> 'weightKg') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'inputs' -> 'activityLevel') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'inputs' -> 'proteinGramsPerKg') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'inputs' -> 'fatCalorieRatio') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'inputs' -> 'surplusRatio') IS DISTINCT FROM 'number'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload -> 'targets')) <> 6
     OR NOT ((submitted_payload -> 'targets') ?& ARRAY[
       'restingKcal',
       'maintenanceKcal',
       'caloriesKcal',
       'proteinGrams',
       'fatGrams',
       'carbsGrams'
     ])
     OR jsonb_typeof(submitted_payload -> 'targets' -> 'restingKcal') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'targets' -> 'maintenanceKcal') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'targets' -> 'caloriesKcal') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'targets' -> 'proteinGrams') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'targets' -> 'fatGrams') IS DISTINCT FROM 'number'
     OR jsonb_typeof(submitted_payload -> 'targets' -> 'carbsGrams') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'invalid profile settings payload' USING ERRCODE = '22023';
  END IF;

  IF (submitted_payload ->> 'schemaVersion')::numeric <> 1
     OR (submitted_payload #>> '{inputs,age}')::numeric <> trunc((submitted_payload #>> '{inputs,age}')::numeric)
     OR (submitted_payload #>> '{inputs,age}')::numeric NOT BETWEEN 18 AND 100
     OR submitted_payload #>> '{inputs,sex}' NOT IN ('male', 'female')
     OR (submitted_payload #>> '{inputs,heightCm}')::numeric NOT BETWEEN 100 AND 250
     OR (submitted_payload #>> '{inputs,weightKg}')::numeric NOT BETWEEN 30 AND 350
     OR submitted_payload #>> '{inputs,activityLevel}' NOT IN ('sedentary', 'light', 'moderate', 'high', 'veryHigh')
     OR (submitted_payload #>> '{inputs,proteinGramsPerKg}')::numeric NOT BETWEEN 1.6 AND 2.2
     OR (submitted_payload #>> '{inputs,fatCalorieRatio}')::numeric NOT BETWEEN 0.15 AND 0.4
     OR (submitted_payload #>> '{inputs,surplusRatio}')::numeric NOT BETWEEN 0 AND 0.3
     OR (submitted_payload ->> 'trainingDaysPerWeek')::numeric <> trunc((submitted_payload ->> 'trainingDaysPerWeek')::numeric)
     OR (submitted_payload ->> 'trainingDaysPerWeek')::numeric NOT BETWEEN 0 AND 7
     OR submitted_payload ->> 'trainingExperience' NOT IN ('beginner', 'intermediate', 'advanced')
     OR (submitted_payload #>> '{targets,restingKcal}')::numeric < 0
     OR (submitted_payload #>> '{targets,maintenanceKcal}')::numeric < 0
     OR (submitted_payload #>> '{targets,caloriesKcal}')::numeric < 0
     OR (submitted_payload #>> '{targets,proteinGrams}')::numeric < 0
     OR (submitted_payload #>> '{targets,fatGrams}')::numeric < 0
     OR (submitted_payload #>> '{targets,carbsGrams}')::numeric < 0
     -- Zod finite() accepts every finite JavaScript number, whose exact ceiling is Number.MAX_VALUE.
     OR (submitted_payload #>> '{targets,restingKcal}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{targets,maintenanceKcal}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{targets,caloriesKcal}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{targets,proteinGrams}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{targets,fatGrams}')::numeric > 1.7976931348623157e308::numeric
     OR (submitted_payload #>> '{targets,carbsGrams}')::numeric > 1.7976931348623157e308::numeric THEN
    RAISE EXCEPTION 'invalid profile settings payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.profiles (user_id, payload)
  VALUES (current_user_id, submitted_payload)
  ON CONFLICT (user_id) DO UPDATE
    SET payload = EXCLUDED.payload,
        goal_version = public.profiles.goal_version + 1,
        updated_at = statement_timestamp()
  RETURNING goal_version INTO next_version;

  INSERT INTO public.nutrition_goals (user_id, version, payload)
  VALUES (current_user_id, next_version, submitted_payload -> 'targets');

  RETURN next_version;
END;
$$;

CREATE FUNCTION public.load_my_profile_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  settings jsonb;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  SELECT profile.payload
  INTO settings
  FROM public.profiles AS profile
  WHERE profile.user_id = current_user_id;

  RETURN settings;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_profile_settings(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.load_my_profile_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_profile_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.load_my_profile_settings() TO authenticated;
