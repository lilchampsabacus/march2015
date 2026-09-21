begin;
drop function if exists public.staff_practice_followup_overview();
create function public.staff_practice_followup_overview()
returns table (user_id uuid,student_name text,level integer,batch_name text,centre_id smallint,centre_name text,last_practice_at timestamptz,last_practice_date date,practice_dates date[],practice_type text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_user_is_staff() then raise exception 'Staff access required'; end if;
  return query
  with regular_practice as (
    select r.user_id,max(r.indian_time) last_at,
      coalesce(array_agg(distinct (r.indian_time at time zone 'Asia/Kolkata')::date order by (r.indian_time at time zone 'Asia/Kolkata')::date) filter(where r.indian_time>=now()-interval '35 days'),'{}'::date[]) dates
    from public.reports r group by r.user_id
  ), formula_sessions as (
    select l.user_id,l.session_id,min(l.created_at) practised_at,(min(l.created_at) at time zone 'Asia/Kolkata')::date practice_date
    from public.level1and2_practice l where l.session_id is not null
    group by l.user_id,l.session_id having count(distinct l.round_number)>=3
  ), formula_practice as (
    select f.user_id,max(f.practised_at) last_at,
      coalesce(array_agg(distinct f.practice_date order by f.practice_date) filter(where f.practised_at>=now()-interval '35 days'),'{}'::date[]) dates
    from formula_sessions f group by f.user_id
  )
  select p.id,coalesce(nullif(btrim(p.full_name),''),'Student'),p.current_level,p.batch_name,p.centre_id,c.short_name,
    case when p.current_level=1 then fp.last_at else rp.last_at end,
    (case when p.current_level=1 then fp.last_at else rp.last_at end at time zone 'Asia/Kolkata')::date,
    case when p.current_level=1 then coalesce(fp.dates,'{}'::date[]) else coalesce(rp.dates,'{}'::date[]) end,
    case when p.current_level=1 then 'Formula Practice' else 'Daily Practice' end
  from public.profiles p left join public.centres c on c.id=p.centre_id
  left join regular_practice rp on rp.user_id=p.id left join formula_practice fp on fp.user_id=p.id
  where p.role='student' and p.is_active is true and p.student_status='active'
  order by lower(coalesce(p.batch_name,'')),p.current_level,lower(coalesce(p.full_name,'Student'));
end;$$;
revoke execute on function public.staff_practice_followup_overview() from public,anon;
grant execute on function public.staff_practice_followup_overview() to authenticated;
commit;
