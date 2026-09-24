-- The IGE report includes the name, exam start and finish, and actual time used.
create or replace function public.ige_staff_report_v2()
returns table(student_name text,student_level integer,batch_name text,centre_id smallint,
 centre_name text,mode text,grade integer,started_at timestamptz,submitted_at timestamptz,
 time_used_seconds integer,scores jsonb,result text)
language plpgsql security definer set search_path='' as $$
begin
 if not public.current_user_is_staff() then raise exception 'Staff access required'; end if;
 return query select p.full_name,a.student_level,a.batch_name,a.centre_id,c.short_name,
  a.mode,a.grade,a.started_at,a.submitted_at,
  greatest(0,extract(epoch from a.submitted_at-a.started_at)::integer),a.scores,a.result
 from public.ige_attempts a join public.profiles p on p.id=a.student_id
 left join public.centres c on c.id=a.centre_id where a.submitted_at is not null
 order by a.started_at desc limit 5000;
end $$;
revoke all on function public.ige_staff_report_v2() from public,anon;
grant execute on function public.ige_staff_report_v2() to authenticated;
