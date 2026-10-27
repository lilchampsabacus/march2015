-- Li'l Champs batch-wise syllabus controls.
-- Install in the production Supabase project used by lilchampsabacus.co.in,
-- NOT the separate national-abacus-platform test project.
-- Do not run against a different Supabase project.
BEGIN;

CREATE TABLE IF NOT EXISTS public.batch_practice_controls (
  centre_id smallint NOT NULL REFERENCES public.centres(id) ON DELETE CASCADE,
  batch_name text NOT NULL CHECK (batch_name = btrim(batch_name) AND length(batch_name) BETWEEN 1 AND 150),
  plusminus_level smallint NOT NULL CHECK (plusminus_level BETWEEN 1 AND 8),
  multiplication_level smallint NOT NULL CHECK (multiplication_level BETWEEN 1 AND 8),
  division_level smallint NOT NULL CHECK (division_level BETWEEN 1 AND 8),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (centre_id, batch_name)
);
ALTER TABLE public.batch_practice_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.batch_practice_controls FROM PUBLIC, anon, authenticated;

-- Only the signed-in student can read their own resolved plan.
-- Missing batch settings fall back to that student's official level.
CREATE OR REPLACE FUNCTION public.student_practice_settings_get()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  p record;
  c record;
BEGIN
  SELECT current_level, centre_id, btrim(coalesce(batch_name,'')) AS batch_name
    INTO p FROM public.profiles
   WHERE id = auth.uid() AND role = 'student' AND is_active IS TRUE
     AND student_status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active student required'; END IF;
  IF p.current_level IS NULL OR p.current_level NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'Student level is not configured';
  END IF;
  SELECT plusminus_level, multiplication_level, division_level, updated_at
    INTO c FROM public.batch_practice_controls
   WHERE centre_id = p.centre_id AND batch_name = p.batch_name;
  RETURN jsonb_build_object(
    'official_level', p.current_level,
    'plusminus', COALESCE(c.plusminus_level, p.current_level),
    'multiplication', COALESCE(c.multiplication_level, p.current_level),
    'division', COALESCE(c.division_level, p.current_level),
    'configured', FOUND,
    'updated_at', c.updated_at
  );
END;
$$;

-- A teacher sees only batches assigned to them for today's date (India time).
-- Admins see active batches in their existing organization/centre management scope.
CREATE OR REPLACE FUNCTION public.batch_practice_settings_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
BEGIN
  SELECT role INTO v_role FROM public.profiles
    WHERE id = auth.uid() AND is_active IS TRUE AND role IN ('admin','teacher');
  IF v_role IS NULL THEN RAISE EXCEPTION 'Staff access required'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(z) ORDER BY z.centre_name,z.batch_name),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT p.centre_id, btrim(p.batch_name) AS batch_name,
           c.short_name AS centre_name,
           min(p.current_level) AS min_level,
           max(p.current_level) AS max_level,
           count(*) AS student_count,
           ctrl.plusminus_level,
           ctrl.multiplication_level,
           ctrl.division_level,
           ctrl.updated_at
    FROM public.profiles p
    JOIN public.centres c ON c.id = p.centre_id
    LEFT JOIN public.batch_practice_controls ctrl
      ON ctrl.centre_id = p.centre_id AND ctrl.batch_name = btrim(p.batch_name)
    WHERE p.role = 'student' AND p.is_active IS TRUE
      AND p.student_status = 'active'
      AND p.centre_id IS NOT NULL AND btrim(coalesce(p.batch_name,'')) <> ''
      AND (
        v_role = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.teacher_batch_assignments a
           WHERE a.teacher_id = auth.uid() AND a.centre_id = p.centre_id
             AND a.batch_name = btrim(p.batch_name)
             AND v_today >= a.starts_on
             AND (a.ends_on IS NULL OR v_today <= a.ends_on)
        )
      )
    GROUP BY p.centre_id,btrim(p.batch_name),c.short_name,
             ctrl.plusminus_level,ctrl.multiplication_level,
             ctrl.division_level,ctrl.updated_at
  ) z;
  RETURN v_result;
END;
$$;

-- Authorized staff can change ONLY practice levels, never the official student level.
CREATE OR REPLACE FUNCTION public.batch_practice_settings_save(
  p_centre smallint, p_batch text,
  p_plusminus smallint, p_multiplication smallint, p_division smallint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role text;
  v_batch text := btrim(coalesce(p_batch,''));
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_min_level integer;
  v_max_level integer;
BEGIN
  SELECT role INTO v_role FROM public.profiles
   WHERE id = auth.uid() AND is_active IS TRUE AND role IN ('admin','teacher');
  IF v_role IS NULL THEN RAISE EXCEPTION 'Staff access required'; END IF;
  IF p_centre IS NULL OR length(v_batch) NOT BETWEEN 1 AND 150
    OR p_plusminus NOT BETWEEN 1 AND 8 OR p_multiplication NOT BETWEEN 1 AND 8
    OR p_division NOT BETWEEN 1 AND 8
    OR p_plusminus IS NULL OR p_multiplication IS NULL OR p_division IS NULL
  THEN RAISE EXCEPTION 'Invalid practice settings'; END IF;

  IF v_role = 'teacher' AND NOT EXISTS (
    SELECT 1 FROM public.teacher_batch_assignments a
    WHERE a.teacher_id = auth.uid() AND a.centre_id = p_centre
      AND a.batch_name = v_batch
      AND v_today >= a.starts_on AND (a.ends_on IS NULL OR v_today <= a.ends_on)
  ) THEN RAISE EXCEPTION 'Batch not assigned to teacher'; END IF;

  SELECT min(current_level), max(current_level) INTO v_min_level,v_max_level
  FROM public.profiles WHERE centre_id = p_centre
    AND btrim(coalesce(batch_name,'')) = v_batch AND role = 'student'
    AND is_active IS TRUE AND student_status = 'active';

  IF v_min_level IS NULL OR v_min_level NOT BETWEEN 1 AND 8
    OR v_min_level <> v_max_level THEN
    RAISE EXCEPTION 'Batch must have active students all at the same official level';
  END IF;
  IF p_plusminus > v_min_level OR p_multiplication > v_min_level
    OR p_division > v_min_level THEN
    RAISE EXCEPTION 'Practice level cannot exceed the official student level';
  END IF;

  INSERT INTO public.batch_practice_controls
    (centre_id,batch_name,plusminus_level,multiplication_level,division_level,updated_by,updated_at)
  VALUES (p_centre,v_batch,p_plusminus,p_multiplication,p_division,auth.uid(),now())
  ON CONFLICT (centre_id,batch_name) DO UPDATE
    SET plusminus_level = EXCLUDED.plusminus_level,
        multiplication_level = EXCLUDED.multiplication_level,
        division_level = EXCLUDED.division_level,
        updated_by = auth.uid(), updated_at = now();
  RETURN jsonb_build_object('saved',true,'centre_id',p_centre,'batch_name',v_batch);
END;
$$;

REVOKE ALL ON FUNCTION public.student_practice_settings_get() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.batch_practice_settings_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.batch_practice_settings_save(smallint,text,smallint,smallint,smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_practice_settings_get() TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_practice_settings_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_practice_settings_save(smallint,text,smallint,smallint,smallint) TO authenticated;
COMMIT;
