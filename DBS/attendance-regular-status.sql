-- Return existing regular lecture for a selected batch/date to prevent repeated entry.
-- The unique index one_regular_lecture remains the final duplicate guard.
create or replace function public.attendance_regular_status(p_centre smallint,p_batch text,p_date date)
returns jsonb language sql security definer set search_path=public as $$
  select (
    select jsonb_build_object(
      'id',l.id,'date',l.lecture_date,'batch',l.batch_name,
      'present',count(*) filter (where a.status='present'),
      'absent',count(*) filter (where a.status='absent')
    )
    from public.class_lectures l
    join public.lecture_attendance a on a.lecture_id=l.id
    where l.centre_id=p_centre and l.batch_name=p_batch
      and l.lecture_date=p_date and l.kind='regular'
    group by l.id
  )
  where public.attendance_actor()='admin'
    or (public.attendance_actor()='teacher' and exists(
      select 1 from public.teacher_batch_assignments t
      where t.teacher_id=auth.uid() and t.centre_id=p_centre
        and t.batch_name=p_batch and p_date>=t.starts_on
        and (t.ends_on is null or p_date<=t.ends_on)
    ));
$$;
revoke all on function public.attendance_regular_status(smallint,text,date) from public;
grant execute on function public.attendance_regular_status(smallint,text,date) to authenticated;
