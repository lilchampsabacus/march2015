-- The owner dashboard counts completed daily practice, other practice reports,
-- and complete three-round formula sessions as practice.
create or replace function public.staff_active_student_practice_overview()
returns table (user_id uuid, student_name text, level integer, batch_name text,
  centre_id smallint, centre_name text, last_practice_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_user_is_staff() then
    raise exception 'Staff access required';
  end if;

  return query
  with practice_events as (
    select r.user_id, r.indian_time as practised_at from public.reports r
    union all
    select d.user_id, coalesce(d.completed_at, d.updated_at, d.created_at)
    from public.official_daily_practice d where d.status = 'completed'
    union all
    select f.user_id, max(f.created_at)
    from public.level1and2_practice f
    where f.session_id is not null
    group by f.user_id, f.session_id
    having count(distinct f.round_number) >= 3
  ), latest as (
    select e.user_id, max(e.practised_at) as practised_at
    from practice_events e group by e.user_id
  )
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Student'),
    p.current_level, p.batch_name, p.centre_id, c.short_name, l.practised_at
  from public.profiles p
  left join public.centres c on c.id = p.centre_id
  left join latest l on l.user_id = p.id
  where p.role = 'student' and p.is_active is true and p.student_status = 'active'
  order by lower(coalesce(p.batch_name, '')), p.current_level,
    lower(coalesce(p.full_name, 'Student'));
end;
$$;
revoke execute on function public.staff_active_student_practice_overview() from public, anon;
grant execute on function public.staff_active_student_practice_overview() to authenticated;
