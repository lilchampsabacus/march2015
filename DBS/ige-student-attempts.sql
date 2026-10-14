-- Completed IGE papers are available only to the student who submitted them.
create or replace function public.ige_my_attempts(date_from date, date_to date)
returns table(id uuid, mode text, grade integer, started_at timestamptz,
 submitted_at timestamptz, time_used_seconds integer, scores jsonb, result text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if date_from is null or date_to is null or date_from < date '2026-09-24'
    or date_to < date_from or date_to > (now() at time zone 'Asia/Kolkata')::date then
   raise exception 'Choose a valid date range from 24 September 2026';
 end if;
 return query select a.id,a.mode,a.grade,a.started_at,a.submitted_at,
   greatest(0,extract(epoch from a.submitted_at-a.started_at)::integer),a.scores,a.result
 from public.ige_attempts a
 where a.student_id=auth.uid() and a.submitted_at is not null
   and a.started_at >= (date_from::timestamp at time zone 'Asia/Kolkata')
   and a.started_at < ((date_to+1)::timestamp at time zone 'Asia/Kolkata')
 order by a.started_at desc limit 200;
end $$;

create or replace function public.ige_my_attempt_detail(attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.ige_attempts%rowtype;
begin
 if auth.uid() is null or attempt is null then raise exception 'Sign in required'; end if;
 select * into a from public.ige_attempts
 where id=attempt and student_id=auth.uid() and submitted_at is not null;
 if not found then raise exception 'Completed attempt not found'; end if;
 return jsonb_build_object('id',a.id,'mode',a.mode,'grade',a.grade,
  'started_at',a.started_at,'submitted_at',a.submitted_at,
  'scores',a.scores,'result',a.result,'questions',a.questions,'answers',a.responses);
end $$;

revoke all on function public.ige_my_attempts(date,date),public.ige_my_attempt_detail(uuid)
 from public,anon,authenticated;
grant execute on function public.ige_my_attempts(date,date),public.ige_my_attempt_detail(uuid)
 to authenticated;
