begin;
create or replace function public.staff_practice_followup_overview()
returns table (user_id uuid,student_name text,level integer,batch_name text,centre_id smallint,centre_name text,last_practice_at timestamptz,last_practice_date date,practice_dates date[])
language plpgsql security definer set search_path = '' as $$
begin
  if not public.current_user_is_staff() then raise exception 'Staff access required'; end if;
  return query
  select p.id,coalesce(nullif(btrim(p.full_name),''),'Student'),p.current_level,p.batch_name,p.centre_id,c.short_name,max(r.indian_time),(max(r.indian_time) at time zone 'Asia/Kolkata')::date,
    coalesce(array_agg(distinct (r.indian_time at time zone 'Asia/Kolkata')::date order by (r.indian_time at time zone 'Asia/Kolkata')::date) filter(where r.indian_time>=now()-interval '35 days'),'{}'::date[])
  from public.profiles p left join public.centres c on c.id=p.centre_id left join public.reports r on r.user_id=p.id
  where p.role='student' and p.is_active is true and p.student_status='active'
  group by p.id,p.full_name,p.current_level,p.batch_name,p.centre_id,c.short_name
  order by lower(coalesce(p.batch_name,'')),p.current_level,lower(coalesce(p.full_name,'Student'));
end;$$;
revoke execute on function public.staff_practice_followup_overview() from public,anon;
grant execute on function public.staff_practice_followup_overview() to authenticated;
commit;
