-- Student/parent IGE attempt report. Returns only the signed-in student's completed attempts.
create or replace function public.ige_student_report(report_date date)
returns table(
  mode text,
  grade integer,
  started_at timestamptz,
  submitted_at timestamptz,
  duration_seconds integer,
  elapsed_seconds integer,
  scores jsonb,
  result text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if report_date is null then
    raise exception 'Date is required';
  end if;

  return query
  select
    a.mode,
    a.grade,
    a.started_at,
    a.submitted_at,
    a.duration_seconds,
    greatest(0, extract(epoch from a.submitted_at - a.started_at)::integer),
    a.scores,
    a.result
  from public.ige_attempts a
  where a.student_id = auth.uid()
    and a.submitted_at is not null
    and a.started_at >= (report_date::timestamp at time zone 'Asia/Kolkata')
    and a.started_at < ((report_date + 1)::timestamp at time zone 'Asia/Kolkata')
  order by a.started_at desc
  limit 100;
end
$$;

revoke all on function public.ige_student_report(date) from public, anon;
grant execute on function public.ige_student_report(date) to authenticated;
