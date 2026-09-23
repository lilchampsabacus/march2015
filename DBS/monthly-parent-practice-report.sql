-- Staff-only monthly summary for the parent report. Read-only; existing reports stay unchanged.
create or replace function public.staff_student_monthly_practice(p_student_name text, p_month date)
returns table (
  student_name text, level integer, daily_dates date[], other_dates date[], formula_dates date[],
  daily_correct bigint, daily_attempted bigint
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_user_is_staff() then raise exception 'Staff access required'; end if;
  if p_month is null or p_month <> date_trunc('month',p_month)::date
     or p_month > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Invalid month';
  end if;
  if (select count(*) from public.profiles p
      where p.role='student' and p.is_active is true and p.student_status='active'
        and lower(btrim(p.full_name))=lower(btrim(p_student_name))) > 1 then
    raise exception 'More than one active student has this name';
  end if;
  return query
  with student as (
    select p.id,p.full_name,p.current_level from public.profiles p
    where p.role='student' and p.is_active is true and p.student_status='active'
      and lower(btrim(p.full_name))=lower(btrim(p_student_name))
  ), days as (
    select o.user_id,
      array_agg(distinct o.practice_date order by o.practice_date) filter (where o.status='completed') completed_dates,
      sum((select count(*) from jsonb_array_elements(coalesce(o.responses->'plusminus','[]'::jsonb) || coalesce(o.responses->'multiplication','[]'::jsonb) || coalesce(o.responses->'division','[]'::jsonb)) x where x->>'correct'='true'))::bigint correct,
      sum((select count(*) from jsonb_array_elements(coalesce(o.responses->'plusminus','[]'::jsonb) || coalesce(o.responses->'multiplication','[]'::jsonb) || coalesce(o.responses->'division','[]'::jsonb)) x where x->>'skipped' is distinct from 'true'))::bigint attempted
    from public.official_daily_practice o
    where o.practice_date >= p_month and o.practice_date < (p_month + interval '1 month')::date
    group by o.user_id
  ), extra as (
    select r.user_id,array_agg(distinct (r.indian_time at time zone 'Asia/Kolkata')::date) dates
    from public.reports r
    where r.indian_time >= p_month::timestamp at time zone 'Asia/Kolkata'
      and r.indian_time < (p_month + interval '1 month')::timestamp at time zone 'Asia/Kolkata'
    group by r.user_id
  ), formula_sessions as (
    select l.user_id,(min(l.created_at) at time zone 'Asia/Kolkata')::date practice_day
    from public.level1and2_practice l
    where l.created_at >= p_month::timestamp at time zone 'Asia/Kolkata'
      and l.created_at < (p_month + interval '1 month')::timestamp at time zone 'Asia/Kolkata'
      and l.session_id is not null
    group by l.user_id,l.session_id having count(distinct l.round_number)>=3
  ), formula as (
    select f.user_id,array_agg(distinct f.practice_day order by f.practice_day) dates
    from formula_sessions f group by f.user_id
  )
  select s.full_name,s.current_level,coalesce(d.completed_dates,'{}'::date[]),
         coalesce(e.dates,'{}'::date[]),coalesce(f.dates,'{}'::date[]),
         coalesce(d.correct,0),coalesce(d.attempted,0)
  from student s left join days d on d.user_id=s.id left join extra e on e.user_id=s.id
  left join formula f on f.user_id=s.id;
end;$$;
revoke execute on function public.staff_student_monthly_practice(text,date) from public,anon;
grant execute on function public.staff_student_monthly_practice(text,date) to authenticated;
