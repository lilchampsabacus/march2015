-- The lowest-scoring section determines the paper result for every grade.
-- 10/10 in every section: Distinction; 9 or above: Credit;
-- 7 or above: Pass; below 7 in any section: Fail.
create or replace function public.ige_finish(attempt uuid,answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.ige_attempts%rowtype; sec text; correct integer;
 local_scores jsonb='{}'::jsonb; outcome text='Distinction';
begin
 if auth.uid() is null or jsonb_typeof(answers)<>'array' then raise exception 'Invalid submission'; end if;
 select * into a from public.ige_attempts where id=attempt and student_id=auth.uid() for update;
 if not found then raise exception 'Attempt not found'; end if;
 if a.submitted_at is not null then return jsonb_build_object('scores',a.scores,'result',a.result); end if;
 if jsonb_array_length(answers)<>jsonb_array_length(a.questions) then raise exception 'Answer count mismatch'; end if;
 if now()>a.started_at+make_interval(secs=>a.duration_seconds+60) then
  raise exception 'Time expired. Please start a new attempt';
 end if;
 for sec in select distinct x->>'section' from jsonb_array_elements(a.questions) x loop
  select count(*) into correct from jsonb_array_elements(a.questions) with ordinality q(v,ord)
  where v->>'section'=sec and jsonb_typeof(answers->((ord-1)::integer))='number'
    and (answers->>((ord-1)::integer))::numeric=(v->>'answer')::numeric;
  local_scores:=local_scores||jsonb_build_object(sec,correct);
  if correct<7 then outcome:='Fail';
  elsif outcome<>'Fail' and correct<9 then outcome:='Pass';
  elsif outcome not in ('Fail','Pass') and correct<10 then outcome:='Credit'; end if;
 end loop;
 update public.ige_attempts set submitted_at=now(),responses=answers,scores=local_scores,result=outcome where id=attempt;
 return jsonb_build_object('scores',local_scores,'result',outcome,'questions',a.questions,'answers',answers);
end $$;
revoke all on function public.ige_finish(uuid,jsonb) from public,anon;
grant execute on function public.ige_finish(uuid,jsonb) to authenticated;

-- Make the student and teacher reports agree with the corrected rule.
with reassessed as (
 select a.id,
   case when exists(select 1 from jsonb_each_text(a.scores) s where s.value::integer<7) then 'Fail'
        when exists(select 1 from jsonb_each_text(a.scores) s where s.value::integer<9) then 'Pass'
        when exists(select 1 from jsonb_each_text(a.scores) s where s.value::integer<10) then 'Credit'
        else 'Distinction' end as corrected_result
 from public.ige_attempts a where a.submitted_at is not null and a.scores is not null
)
update public.ige_attempts a set result=r.corrected_result
from reassessed r where a.id=r.id and a.result is distinct from r.corrected_result;
