CREATE FUNCTION public.delete_my_application_data()
RETURNS jsonb
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

  DELETE FROM public.ai_analyses
  WHERE user_id = current_user_id;

  DELETE FROM public.meals
  WHERE user_id = current_user_id;

  DELETE FROM public.weight_entries
  WHERE user_id = current_user_id;

  DELETE FROM public.workouts
  WHERE user_id = current_user_id;

  DELETE FROM public.profiles
  WHERE user_id = current_user_id;

  RETURN jsonb_build_object('deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_application_data() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_application_data() TO authenticated;
