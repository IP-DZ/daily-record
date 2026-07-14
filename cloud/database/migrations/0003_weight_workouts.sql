CREATE TABLE public.weight_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT auth.uid(),
  entry_date date NOT NULL,
  weight_kg numeric NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT weight_entries_authenticated_owner CHECK (user_id IS NOT NULL AND btrim(user_id) <> ''),
  CONSTRAINT weight_entries_weight_range CHECK (weight_kg >= 30 AND weight_kg <= 350),
  CONSTRAINT weight_entries_note_length CHECK (char_length(note) <= 500)
);

CREATE TABLE public.workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT auth.uid(),
  workout_date date NOT NULL,
  body_parts text[] NOT NULL,
  duration_minutes integer,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT workouts_authenticated_owner CHECK (user_id IS NOT NULL AND btrim(user_id) <> ''),
  CONSTRAINT workouts_body_parts_present CHECK (array_length(body_parts, 1) >= 1),
  CONSTRAINT workouts_duration_range CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 0 AND 600),
  CONSTRAINT workouts_note_length CHECK (char_length(note) <= 500)
);

CREATE TABLE public.workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  user_id text NOT NULL DEFAULT auth.uid(),
  exercise_order integer NOT NULL,
  name text NOT NULL,
  CONSTRAINT workout_exercises_authenticated_owner CHECK (user_id IS NOT NULL AND btrim(user_id) <> ''),
  CONSTRAINT workout_exercises_order_range CHECK (exercise_order BETWEEN 1 AND 1000),
  CONSTRAINT workout_exercises_name_present CHECK (btrim(name) <> '' AND char_length(name) <= 80)
);

CREATE TABLE public.workout_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
  user_id text NOT NULL DEFAULT auth.uid(),
  set_order integer NOT NULL,
  weight_kg numeric NOT NULL,
  reps integer NOT NULL,
  completed boolean NOT NULL,
  CONSTRAINT workout_sets_authenticated_owner CHECK (user_id IS NOT NULL AND btrim(user_id) <> ''),
  CONSTRAINT workout_sets_order_range CHECK (set_order BETWEEN 1 AND 1000),
  CONSTRAINT workout_sets_weight_range CHECK (weight_kg >= 0 AND weight_kg <= 1000),
  CONSTRAINT workout_sets_reps_range CHECK (reps BETWEEN 0 AND 1000)
);

CREATE INDEX weight_entries_user_date_created_idx
  ON public.weight_entries (user_id, entry_date, created_at DESC);

CREATE INDEX workouts_user_date_created_idx
  ON public.workouts (user_id, workout_date, created_at DESC);

CREATE INDEX workout_exercises_workout_order_idx
  ON public.workout_exercises (workout_id, exercise_order, id);

CREATE INDEX workout_sets_exercise_order_idx
  ON public.workout_sets (exercise_id, set_order, id);

ALTER TABLE public.weight_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY weight_entries_select_own ON public.weight_entries
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY weight_entries_insert_own ON public.weight_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY weight_entries_update_own ON public.weight_entries
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY weight_entries_delete_own ON public.weight_entries
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY workouts_select_own ON public.workouts
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY workouts_insert_own ON public.workouts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY workouts_update_own ON public.workouts
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY workouts_delete_own ON public.workouts
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY workout_exercises_select_own ON public.workout_exercises
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY workout_exercises_insert_own ON public.workout_exercises
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY workout_exercises_update_own ON public.workout_exercises
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY workout_exercises_delete_own ON public.workout_exercises
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY workout_sets_select_own ON public.workout_sets
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY workout_sets_insert_own ON public.workout_sets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY workout_sets_update_own ON public.workout_sets
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY workout_sets_delete_own ON public.workout_sets
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.weight_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workouts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workout_exercises FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workout_sets FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.weight_entries TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.workouts TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.workout_exercises TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.workout_sets TO service_role;

CREATE FUNCTION public.list_my_weight_entries(start_date text, end_date text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  requested_start date;
  requested_end date;
  result jsonb;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF start_date IS NULL
     OR end_date IS NULL
     OR start_date !~ '^\d{4}-\d{2}-\d{2}$'
     OR end_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid weight date range' USING ERRCODE = '22023';
  END IF;

  requested_start := start_date::date;
  requested_end := end_date::date;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', entry.id,
        'entryDate', to_char(entry.entry_date, 'YYYY-MM-DD'),
        'weightKg', entry.weight_kg,
        'note', entry.note,
        'createdAt', entry.created_at,
        'updatedAt', entry.updated_at
      )
      ORDER BY entry.entry_date, entry.created_at, entry.id
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.weight_entries AS entry
  WHERE entry.user_id = current_user_id
    AND entry.entry_date BETWEEN requested_start AND requested_end;

  RETURN result;
END;
$$;

CREATE FUNCTION public.create_my_weight_entry(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  submitted_payload jsonb := payload;
  inserted_entry public.weight_entries%ROWTYPE;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(submitted_payload) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload)) NOT BETWEEN 2 AND 3
     OR NOT (submitted_payload ?& ARRAY['entryDate', 'weightKg'])
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(submitted_payload) AS payload_key(key)
       WHERE payload_key.key NOT IN ('entryDate', 'weightKg', 'note')
     )
     OR submitted_payload ?| ARRAY['user_id', 'userId', 'email']
     OR jsonb_typeof(submitted_payload -> 'entryDate') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'weightKg') IS DISTINCT FROM 'number'
     OR (submitted_payload ? 'note' AND jsonb_typeof(submitted_payload -> 'note') IS DISTINCT FROM 'string')
     OR submitted_payload ->> 'entryDate' !~ '^\d{4}-\d{2}-\d{2}$'
     OR (submitted_payload ->> 'weightKg')::numeric < 30
     OR (submitted_payload ->> 'weightKg')::numeric > 350
     OR char_length(COALESCE(submitted_payload ->> 'note', '')) > 500 THEN
    RAISE EXCEPTION 'invalid weight payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.weight_entries (user_id, entry_date, weight_kg, note)
  VALUES (
    current_user_id,
    (submitted_payload ->> 'entryDate')::date,
    (submitted_payload ->> 'weightKg')::numeric,
    COALESCE(submitted_payload ->> 'note', '')
  )
  RETURNING * INTO inserted_entry;

  RETURN jsonb_build_object(
    'id', inserted_entry.id,
    'entryDate', to_char(inserted_entry.entry_date, 'YYYY-MM-DD'),
    'weightKg', inserted_entry.weight_kg,
    'note', inserted_entry.note,
    'createdAt', inserted_entry.created_at,
    'updatedAt', inserted_entry.updated_at
  );
END;
$$;

CREATE FUNCTION public.update_my_weight_entry(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  submitted_payload jsonb := payload;
  updated_entry public.weight_entries%ROWTYPE;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(submitted_payload) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload)) NOT BETWEEN 3 AND 4
     OR NOT (submitted_payload ?& ARRAY['id', 'entryDate', 'weightKg'])
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(submitted_payload) AS payload_key(key)
       WHERE payload_key.key NOT IN ('id', 'entryDate', 'weightKg', 'note')
     )
     OR submitted_payload ?| ARRAY['user_id', 'userId', 'email']
     OR jsonb_typeof(submitted_payload -> 'id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'entryDate') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'weightKg') IS DISTINCT FROM 'number'
     OR (submitted_payload ? 'note' AND jsonb_typeof(submitted_payload -> 'note') IS DISTINCT FROM 'string')
     OR btrim(submitted_payload ->> 'id') = ''
     OR submitted_payload ->> 'entryDate' !~ '^\d{4}-\d{2}-\d{2}$'
     OR (submitted_payload ->> 'weightKg')::numeric < 30
     OR (submitted_payload ->> 'weightKg')::numeric > 350
     OR char_length(COALESCE(submitted_payload ->> 'note', '')) > 500 THEN
    RAISE EXCEPTION 'invalid weight payload' USING ERRCODE = '22023';
  END IF;

  UPDATE public.weight_entries
  SET entry_date = (submitted_payload ->> 'entryDate')::date,
      weight_kg = (submitted_payload ->> 'weightKg')::numeric,
      note = COALESCE(submitted_payload ->> 'note', ''),
      updated_at = statement_timestamp()
  WHERE user_id = current_user_id
    AND id = (submitted_payload ->> 'id')::uuid
  RETURNING * INTO updated_entry;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'weight entry not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', updated_entry.id,
    'entryDate', to_char(updated_entry.entry_date, 'YYYY-MM-DD'),
    'weightKg', updated_entry.weight_kg,
    'note', updated_entry.note,
    'createdAt', updated_entry.created_at,
    'updatedAt', updated_entry.updated_at
  );
END;
$$;

CREATE FUNCTION public.delete_my_weight_entry(entry_id uuid)
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

  DELETE FROM public.weight_entries
  WHERE user_id = current_user_id
    AND id = entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'weight entry not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE FUNCTION public.list_my_workouts(start_date text, end_date text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  requested_start date;
  requested_end date;
  result jsonb;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF start_date IS NULL
     OR end_date IS NULL
     OR start_date !~ '^\d{4}-\d{2}-\d{2}$'
     OR end_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid workout date range' USING ERRCODE = '22023';
  END IF;

  requested_start := start_date::date;
  requested_end := end_date::date;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', workout.id,
        'workoutDate', to_char(workout.workout_date, 'YYYY-MM-DD'),
        'bodyParts', to_jsonb(workout.body_parts),
        'durationMinutes', workout.duration_minutes,
        'note', workout.note,
        'exercises', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', exercise.id,
              'name', exercise.name,
              'order', exercise.exercise_order,
              'sets', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', workout_set.id,
                    'order', workout_set.set_order,
                    'weightKg', workout_set.weight_kg,
                    'reps', workout_set.reps,
                    'completed', workout_set.completed
                  )
                  ORDER BY workout_set.set_order, workout_set.id
                )
                FROM public.workout_sets AS workout_set
                WHERE workout_set.exercise_id = exercise.id
              ), '[]'::jsonb)
            )
            ORDER BY exercise.exercise_order, exercise.id
          )
          FROM public.workout_exercises AS exercise
          WHERE exercise.workout_id = workout.id
        ), '[]'::jsonb),
        'volumeKg', COALESCE((
          SELECT sum(workout_set.weight_kg * workout_set.reps)
          FROM public.workout_exercises AS exercise
          JOIN public.workout_sets AS workout_set ON workout_set.exercise_id = exercise.id
          WHERE exercise.workout_id = workout.id
            AND workout_set.completed
        ), 0),
        'createdAt', workout.created_at,
        'updatedAt', workout.updated_at
      )
      ORDER BY workout.workout_date, workout.created_at, workout.id
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.workouts AS workout
  WHERE workout.user_id = current_user_id
    AND workout.workout_date BETWEEN requested_start AND requested_end;

  RETURN result;
END;
$$;

CREATE FUNCTION public.create_my_workout(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  submitted_payload jsonb := payload;
  inserted_workout public.workouts%ROWTYPE;
  inserted_exercise public.workout_exercises%ROWTYPE;
  exercise_payload jsonb;
  set_payload jsonb;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(submitted_payload) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload)) NOT BETWEEN 4 AND 5
     OR NOT (submitted_payload ?& ARRAY['workoutDate', 'bodyParts', 'durationMinutes', 'exercises'])
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(submitted_payload) AS payload_key(key)
       WHERE payload_key.key NOT IN ('workoutDate', 'bodyParts', 'durationMinutes', 'note', 'exercises')
     )
     OR submitted_payload ?| ARRAY['user_id', 'userId', 'email']
     OR jsonb_typeof(submitted_payload -> 'workoutDate') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'bodyParts') IS DISTINCT FROM 'array'
     OR jsonb_typeof(submitted_payload -> 'exercises') IS DISTINCT FROM 'array'
     OR (submitted_payload ? 'note' AND jsonb_typeof(submitted_payload -> 'note') IS DISTINCT FROM 'string')
     OR submitted_payload ->> 'workoutDate' !~ '^\d{4}-\d{2}-\d{2}$'
     OR char_length(COALESCE(submitted_payload ->> 'note', '')) > 500
     OR jsonb_array_length(submitted_payload -> 'bodyParts') = 0
     OR jsonb_array_length(submitted_payload -> 'exercises') = 0
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(submitted_payload -> 'bodyParts') AS body_part(value)
       WHERE jsonb_typeof(body_part.value) IS DISTINCT FROM 'string'
          OR btrim(body_part.value #>> '{}') = ''
          OR char_length(body_part.value #>> '{}') > 80
     )
     OR NOT (
       jsonb_typeof(submitted_payload -> 'durationMinutes') = 'null'
       OR (
         jsonb_typeof(submitted_payload -> 'durationMinutes') = 'number'
         AND (submitted_payload ->> 'durationMinutes')::numeric = trunc((submitted_payload ->> 'durationMinutes')::numeric)
         AND (submitted_payload ->> 'durationMinutes')::integer BETWEEN 0 AND 600
       )
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(submitted_payload -> 'exercises') AS exercise(value)
       WHERE jsonb_typeof(exercise.value) IS DISTINCT FROM 'object'
          OR (SELECT count(*) FROM jsonb_object_keys(exercise.value)) <> 4
          OR NOT (exercise.value ?& ARRAY['id', 'name', 'order', 'sets'])
          OR exercise.value ?| ARRAY['user_id', 'userId', 'email']
          OR jsonb_typeof(exercise.value -> 'id') IS DISTINCT FROM 'string'
          OR jsonb_typeof(exercise.value -> 'name') IS DISTINCT FROM 'string'
          OR jsonb_typeof(exercise.value -> 'order') IS DISTINCT FROM 'number'
          OR jsonb_typeof(exercise.value -> 'sets') IS DISTINCT FROM 'array'
          OR btrim(exercise.value ->> 'id') = ''
          OR btrim(exercise.value ->> 'name') = ''
          OR char_length(exercise.value ->> 'name') > 80
          OR (exercise.value ->> 'order')::numeric <> trunc((exercise.value ->> 'order')::numeric)
          OR (exercise.value ->> 'order')::integer NOT BETWEEN 1 AND 1000
          OR jsonb_array_length(exercise.value -> 'sets') = 0
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(exercise.value -> 'sets') AS workout_set(value)
            WHERE jsonb_typeof(workout_set.value) IS DISTINCT FROM 'object'
               OR (SELECT count(*) FROM jsonb_object_keys(workout_set.value)) <> 5
               OR NOT (workout_set.value ?& ARRAY['id', 'order', 'weightKg', 'reps', 'completed'])
               OR workout_set.value ?| ARRAY['user_id', 'userId', 'email']
               OR jsonb_typeof(workout_set.value -> 'id') IS DISTINCT FROM 'string'
               OR jsonb_typeof(workout_set.value -> 'order') IS DISTINCT FROM 'number'
               OR jsonb_typeof(workout_set.value -> 'weightKg') IS DISTINCT FROM 'number'
               OR jsonb_typeof(workout_set.value -> 'reps') IS DISTINCT FROM 'number'
               OR jsonb_typeof(workout_set.value -> 'completed') IS DISTINCT FROM 'boolean'
               OR btrim(workout_set.value ->> 'id') = ''
               OR (workout_set.value ->> 'order')::numeric <> trunc((workout_set.value ->> 'order')::numeric)
               OR (workout_set.value ->> 'order')::integer NOT BETWEEN 1 AND 1000
               OR (workout_set.value ->> 'weightKg')::numeric < 0
               OR (workout_set.value ->> 'weightKg')::numeric > 1000
               OR (workout_set.value ->> 'reps')::numeric <> trunc((workout_set.value ->> 'reps')::numeric)
               OR (workout_set.value ->> 'reps')::integer NOT BETWEEN 0 AND 1000
          )
     ) THEN
    RAISE EXCEPTION 'invalid workout payload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workouts (user_id, workout_date, body_parts, duration_minutes, note)
  VALUES (
    current_user_id,
    (submitted_payload ->> 'workoutDate')::date,
    ARRAY(SELECT jsonb_array_elements_text(submitted_payload -> 'bodyParts')),
    CASE
      WHEN jsonb_typeof(submitted_payload -> 'durationMinutes') = 'null' THEN NULL
      ELSE (submitted_payload ->> 'durationMinutes')::integer
    END,
    COALESCE(submitted_payload ->> 'note', '')
  )
  RETURNING * INTO inserted_workout;

  FOR exercise_payload IN SELECT value FROM jsonb_array_elements(submitted_payload -> 'exercises')
  LOOP
    INSERT INTO public.workout_exercises (workout_id, user_id, exercise_order, name)
    VALUES (
      inserted_workout.id,
      current_user_id,
      (exercise_payload ->> 'order')::integer,
      exercise_payload ->> 'name'
    )
    RETURNING * INTO inserted_exercise;

    FOR set_payload IN SELECT value FROM jsonb_array_elements(exercise_payload -> 'sets')
    LOOP
      INSERT INTO public.workout_sets (exercise_id, user_id, set_order, weight_kg, reps, completed)
      VALUES (
        inserted_exercise.id,
        current_user_id,
        (set_payload ->> 'order')::integer,
        (set_payload ->> 'weightKg')::numeric,
        (set_payload ->> 'reps')::integer,
        (set_payload ->> 'completed')::boolean
      );
    END LOOP;
  END LOOP;

  RETURN (
    SELECT selected_workouts.value
    FROM jsonb_array_elements(public.list_my_workouts(
      to_char(inserted_workout.workout_date, 'YYYY-MM-DD'),
      to_char(inserted_workout.workout_date, 'YYYY-MM-DD')
    )) AS selected_workouts(value)
    WHERE selected_workouts.value ->> 'id' = inserted_workout.id::text
  );
END;
$$;

CREATE FUNCTION public.update_my_workout(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  submitted_payload jsonb := payload;
  updated_workout public.workouts%ROWTYPE;
  inserted_exercise public.workout_exercises%ROWTYPE;
  exercise_payload jsonb;
  set_payload jsonb;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(submitted_payload) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(submitted_payload)) NOT BETWEEN 5 AND 6
     OR NOT (submitted_payload ?& ARRAY['id', 'workoutDate', 'bodyParts', 'durationMinutes', 'exercises'])
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(submitted_payload) AS payload_key(key)
       WHERE payload_key.key NOT IN ('id', 'workoutDate', 'bodyParts', 'durationMinutes', 'note', 'exercises')
     )
     OR submitted_payload ?| ARRAY['user_id', 'userId', 'email']
     OR jsonb_typeof(submitted_payload -> 'id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'workoutDate') IS DISTINCT FROM 'string'
     OR jsonb_typeof(submitted_payload -> 'bodyParts') IS DISTINCT FROM 'array'
     OR jsonb_typeof(submitted_payload -> 'exercises') IS DISTINCT FROM 'array'
     OR (submitted_payload ? 'note' AND jsonb_typeof(submitted_payload -> 'note') IS DISTINCT FROM 'string')
     OR btrim(submitted_payload ->> 'id') = ''
     OR submitted_payload ->> 'workoutDate' !~ '^\d{4}-\d{2}-\d{2}$'
     OR char_length(COALESCE(submitted_payload ->> 'note', '')) > 500
     OR jsonb_array_length(submitted_payload -> 'bodyParts') = 0
     OR jsonb_array_length(submitted_payload -> 'exercises') = 0
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(submitted_payload -> 'bodyParts') AS body_part(value)
       WHERE jsonb_typeof(body_part.value) IS DISTINCT FROM 'string'
          OR btrim(body_part.value #>> '{}') = ''
          OR char_length(body_part.value #>> '{}') > 80
     )
     OR NOT (
       jsonb_typeof(submitted_payload -> 'durationMinutes') = 'null'
       OR (
         jsonb_typeof(submitted_payload -> 'durationMinutes') = 'number'
         AND (submitted_payload ->> 'durationMinutes')::numeric = trunc((submitted_payload ->> 'durationMinutes')::numeric)
         AND (submitted_payload ->> 'durationMinutes')::integer BETWEEN 0 AND 600
       )
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(submitted_payload -> 'exercises') AS exercise(value)
       WHERE jsonb_typeof(exercise.value) IS DISTINCT FROM 'object'
          OR (SELECT count(*) FROM jsonb_object_keys(exercise.value)) <> 4
          OR NOT (exercise.value ?& ARRAY['id', 'name', 'order', 'sets'])
          OR exercise.value ?| ARRAY['user_id', 'userId', 'email']
          OR jsonb_typeof(exercise.value -> 'id') IS DISTINCT FROM 'string'
          OR jsonb_typeof(exercise.value -> 'name') IS DISTINCT FROM 'string'
          OR jsonb_typeof(exercise.value -> 'order') IS DISTINCT FROM 'number'
          OR jsonb_typeof(exercise.value -> 'sets') IS DISTINCT FROM 'array'
          OR btrim(exercise.value ->> 'id') = ''
          OR btrim(exercise.value ->> 'name') = ''
          OR char_length(exercise.value ->> 'name') > 80
          OR (exercise.value ->> 'order')::numeric <> trunc((exercise.value ->> 'order')::numeric)
          OR (exercise.value ->> 'order')::integer NOT BETWEEN 1 AND 1000
          OR jsonb_array_length(exercise.value -> 'sets') = 0
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(exercise.value -> 'sets') AS workout_set(value)
            WHERE jsonb_typeof(workout_set.value) IS DISTINCT FROM 'object'
               OR (SELECT count(*) FROM jsonb_object_keys(workout_set.value)) <> 5
               OR NOT (workout_set.value ?& ARRAY['id', 'order', 'weightKg', 'reps', 'completed'])
               OR workout_set.value ?| ARRAY['user_id', 'userId', 'email']
               OR jsonb_typeof(workout_set.value -> 'id') IS DISTINCT FROM 'string'
               OR jsonb_typeof(workout_set.value -> 'order') IS DISTINCT FROM 'number'
               OR jsonb_typeof(workout_set.value -> 'weightKg') IS DISTINCT FROM 'number'
               OR jsonb_typeof(workout_set.value -> 'reps') IS DISTINCT FROM 'number'
               OR jsonb_typeof(workout_set.value -> 'completed') IS DISTINCT FROM 'boolean'
               OR btrim(workout_set.value ->> 'id') = ''
               OR (workout_set.value ->> 'order')::numeric <> trunc((workout_set.value ->> 'order')::numeric)
               OR (workout_set.value ->> 'order')::integer NOT BETWEEN 1 AND 1000
               OR (workout_set.value ->> 'weightKg')::numeric < 0
               OR (workout_set.value ->> 'weightKg')::numeric > 1000
               OR (workout_set.value ->> 'reps')::numeric <> trunc((workout_set.value ->> 'reps')::numeric)
               OR (workout_set.value ->> 'reps')::integer NOT BETWEEN 0 AND 1000
          )
     ) THEN
    RAISE EXCEPTION 'invalid workout payload' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workouts
  SET workout_date = (submitted_payload ->> 'workoutDate')::date,
      body_parts = ARRAY(SELECT jsonb_array_elements_text(submitted_payload -> 'bodyParts')),
      duration_minutes = CASE
        WHEN jsonb_typeof(submitted_payload -> 'durationMinutes') = 'null' THEN NULL
        ELSE (submitted_payload ->> 'durationMinutes')::integer
      END,
      note = COALESCE(submitted_payload ->> 'note', ''),
      updated_at = statement_timestamp()
  WHERE user_id = current_user_id
    AND id = (submitted_payload ->> 'id')::uuid
  RETURNING * INTO updated_workout;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workout not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.workout_exercises
  WHERE workout_id = updated_workout.id
    AND user_id = current_user_id;

  FOR exercise_payload IN SELECT value FROM jsonb_array_elements(submitted_payload -> 'exercises')
  LOOP
    INSERT INTO public.workout_exercises (workout_id, user_id, exercise_order, name)
    VALUES (
      updated_workout.id,
      current_user_id,
      (exercise_payload ->> 'order')::integer,
      exercise_payload ->> 'name'
    )
    RETURNING * INTO inserted_exercise;

    FOR set_payload IN SELECT value FROM jsonb_array_elements(exercise_payload -> 'sets')
    LOOP
      INSERT INTO public.workout_sets (exercise_id, user_id, set_order, weight_kg, reps, completed)
      VALUES (
        inserted_exercise.id,
        current_user_id,
        (set_payload ->> 'order')::integer,
        (set_payload ->> 'weightKg')::numeric,
        (set_payload ->> 'reps')::integer,
        (set_payload ->> 'completed')::boolean
      );
    END LOOP;
  END LOOP;

  RETURN (
    SELECT selected_workouts.value
    FROM jsonb_array_elements(public.list_my_workouts(
      to_char(updated_workout.workout_date, 'YYYY-MM-DD'),
      to_char(updated_workout.workout_date, 'YYYY-MM-DD')
    )) AS selected_workouts(value)
    WHERE selected_workouts.value ->> 'id' = updated_workout.id::text
  );
END;
$$;

CREATE FUNCTION public.delete_my_workout(workout_id uuid)
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

  DELETE FROM public.workouts
  WHERE user_id = current_user_id
    AND id = workout_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workout not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE FUNCTION public.copy_my_latest_workout(target_workout_date text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  current_user_id text := auth.uid();
  target_date date;
  source_workout public.workouts%ROWTYPE;
  copied_workout public.workouts%ROWTYPE;
  source_exercise public.workout_exercises%ROWTYPE;
  copied_exercise public.workout_exercises%ROWTYPE;
  source_set public.workout_sets%ROWTYPE;
BEGIN
  IF current_user_id IS NULL OR btrim(current_user_id) = '' THEN
    RAISE EXCEPTION 'authenticated user is required' USING ERRCODE = '28000';
  END IF;

  IF target_workout_date IS NULL OR target_workout_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid workout date' USING ERRCODE = '22023';
  END IF;

  target_date := target_workout_date::date;

  SELECT *
  INTO source_workout
  FROM public.workouts
  WHERE user_id = current_user_id
    AND workout_date <= target_date
  ORDER BY workout_date DESC, created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workout not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.workouts (user_id, workout_date, body_parts, duration_minutes, note)
  VALUES (
    current_user_id,
    target_date,
    source_workout.body_parts,
    source_workout.duration_minutes,
    source_workout.note
  )
  RETURNING * INTO copied_workout;

  FOR source_exercise IN
    SELECT *
    FROM public.workout_exercises
    WHERE workout_id = source_workout.id
      AND user_id = current_user_id
    ORDER BY exercise_order, id
  LOOP
    INSERT INTO public.workout_exercises (workout_id, user_id, exercise_order, name)
    VALUES (copied_workout.id, current_user_id, source_exercise.exercise_order, source_exercise.name)
    RETURNING * INTO copied_exercise;

    FOR source_set IN
      SELECT *
      FROM public.workout_sets
      WHERE exercise_id = source_exercise.id
        AND user_id = current_user_id
      ORDER BY set_order, id
    LOOP
      INSERT INTO public.workout_sets (exercise_id, user_id, set_order, weight_kg, reps, completed)
      VALUES (
        copied_exercise.id,
        current_user_id,
        source_set.set_order,
        source_set.weight_kg,
        source_set.reps,
        source_set.completed
      );
    END LOOP;
  END LOOP;

  RETURN (
    SELECT selected_workouts.value
    FROM jsonb_array_elements(public.list_my_workouts(
      to_char(copied_workout.workout_date, 'YYYY-MM-DD'),
      to_char(copied_workout.workout_date, 'YYYY-MM-DD')
    )) AS selected_workouts(value)
    WHERE selected_workouts.value ->> 'id' = copied_workout.id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_weight_entries(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_my_weight_entry(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_my_weight_entry(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_my_weight_entry(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_workouts(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_my_workout(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_my_workout(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_my_workout(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.copy_my_latest_workout(text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_my_weight_entries(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_weight_entry(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_weight_entry(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_weight_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_workouts(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_workout(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_workout(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_workout(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_my_latest_workout(text) TO authenticated;
