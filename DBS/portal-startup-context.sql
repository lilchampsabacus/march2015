-- Apply before the matching login.html / level-access.js deployment.
-- One fresh, read-only account and practice-level check after password sign-in.
begin;
create or replace function public.portal_startup_context()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  p record;
  v_levels jsonb := null;
begin
  if v_uid is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  select id, full_name, current_level, role, is_active
    into p from public.profiles where id = v_uid;
  if not found then
    raise exception 'Account profile not found';
  end if;
  if p.is_active is true and p.role = 'student'
     and p.current_level between 1 and 8 then
    -- Derives the student's batch from auth.uid(), with existing status checks.
    v_levels := public.student_practice_settings_get();
  end if;
  return jsonb_build_object('profile', to_jsonb(p), 'practice_levels', v_levels);
end;
$function$;
revoke all on function public.portal_startup_context() from public, anon;
grant execute on function public.portal_startup_context() to authenticated;
comment on function public.portal_startup_context() is
  'Fresh authenticated portal entry; caller RLS and existing student batch controls.';
notify pgrst, 'reload schema';
commit;
