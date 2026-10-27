-- One read-only startup call; all row access stays subject to the caller's RLS.
-- Apply this additive function before deploying the matching daily-practice.js.
-- Requires the existing student_practice_settings_get() batch-level helper.
begin;
create or replace function public.student_daily_practice_context()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  p record;
  v_levels jsonb := null;
  v_assignment jsonb := null;
begin
  if v_uid is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;

  select id, full_name, current_level, role, is_active
    into p from public.profiles where id = v_uid;
  if not found then
    raise exception 'Student profile not found';
  end if;

  if p.is_active is true and p.role = 'student'
     and p.current_level between 2 and 8 then
    -- This existing function validates active student status and derives the batch
    -- from auth.uid(); the client cannot choose another student's batch.
    v_levels := public.student_practice_settings_get();
    select to_jsonb(d) into v_assignment
      from public.official_daily_practice d
     where d.user_id = v_uid and d.practice_date = v_today;
  end if;

  return jsonb_build_object(
    'profile', to_jsonb(p),
    'practice_levels', v_levels,
    'assignment', v_assignment,
    'practice_date', v_today
  );
end;
$function$;
revoke all on function public.student_daily_practice_context() from public, anon;
grant execute on function public.student_daily_practice_context() to authenticated;
comment on function public.student_daily_practice_context() is
  'Read-only current-student Daily Practice startup context; SECURITY INVOKER and existing RLS.';
notify pgrst, 'reload schema';
commit;
