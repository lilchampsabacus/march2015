begin;
create table if not exists public.ige_assignments (
  id bigint generated always as identity primary key,
  centre_id smallint not null references public.centres(id),
  batch_name text not null,
  student_level integer not null check (student_level between 1 and 8),
  mode text not null check (mode in ('abacus','mental')),
  grade integer not null check (grade between 1 and 12),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (centre_id,batch_name,student_level,mode),
  check ((mode='mental' and grade<=10) or mode='abacus')
);
create table if not exists public.ige_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  mode text not null check (mode in ('abacus','mental')),
  grade integer not null,
  centre_id smallint,
  batch_name text,
  student_level integer,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_seconds integer not null,
  questions jsonb not null,
  responses jsonb,
  scores jsonb,
  result text check (result in ('Distinction','Credit','Pass','Fail')),
  check (jsonb_typeof(questions)='array')
);
create index if not exists ige_attempts_student_idx on public.ige_attempts(student_id,started_at desc);
create index if not exists ige_attempts_report_idx on public.ige_attempts(centre_id,batch_name,student_level,started_at desc);
alter table public.ige_assignments enable row level security;
alter table public.ige_attempts enable row level security;
revoke all on public.ige_assignments, public.ige_attempts from public,anon,authenticated;

create or replace function public.ige_staff_assignments()
returns table(centre_id smallint,batch_name text,student_level integer,mode text,grade integer,enabled boolean,student_count bigint)
language plpgsql security definer set search_path='' as $$
begin
 if not public.current_user_is_staff() then raise exception 'Staff access required'; end if;
 return query select p.centre_id,p.batch_name,p.current_level,m.mode,
   a.grade,coalesce(a.enabled,false),count(*)
 from public.profiles p cross join (values('abacus'::text),('mental'::text)) m(mode)
 left join public.ige_assignments a on a.centre_id=p.centre_id and a.batch_name=p.batch_name
   and a.student_level=p.current_level and a.mode=m.mode
 where p.role='student' and p.is_active is true and p.student_status='active'
   and p.centre_id is not null and p.batch_name is not null and p.current_level between 1 and 8
 group by p.centre_id,p.batch_name,p.current_level,m.mode,a.grade,a.enabled
 order by p.centre_id,p.batch_name,p.current_level,m.mode;
end $$;

create or replace function public.ige_set_assignment(c smallint,b text,l integer,m text,g integer,e boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.current_user_is_staff() then raise exception 'Staff access required'; end if;
 if c is null or b is null or btrim(b)='' or l not between 1 and 8 or
   m not in ('abacus','mental') or g is null or g<1 or
   (m='mental' and g>10) or (m='abacus' and g>12) then raise exception 'Invalid assignment'; end if;
 if not exists (select 1 from public.profiles p where p.role='student' and p.is_active is true
   and p.centre_id=c and p.batch_name=b and p.current_level=l) then raise exception 'Batch and level not found'; end if;
 insert into public.ige_assignments(centre_id,batch_name,student_level,mode,grade,enabled)
 values(c,b,l,m,g,e) on conflict(centre_id,batch_name,student_level,mode)
 do update set grade=excluded.grade,enabled=excluded.enabled,updated_at=now();
end $$;

create or replace function public.ige_available()
returns table(mode text,grade integer,duration_seconds integer)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 return query select a.mode,a.grade,
   case when a.mode='mental' then case when a.grade<=5 then 240 else 180 end
     when a.grade<=7 then 1200 when a.grade<=9 then 600 else 300 end
 from public.profiles p join public.ige_assignments a on a.centre_id=p.centre_id
   and a.batch_name=p.batch_name and a.student_level=p.current_level
 where p.id=auth.uid() and p.role='student' and p.is_active is true and p.student_status='active' and a.enabled;
end $$;

create or replace function public.ige_start(m text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; a public.ige_assignments%rowtype;
  sections text[]; section text; q jsonb='[]'::jsonb; terms jsonb; n integer; j integer;
  next_n integer; total numeric; left_n integer; right_n integer;
  question jsonb; attempt_id uuid; duration integer; seed numeric; rows_per_sum integer;
begin
 if auth.uid() is null or m not in ('abacus','mental') then raise exception 'Sign in required'; end if;
 select * into p from public.profiles where id=auth.uid() and role='student' and is_active is true and student_status='active';
 if not found then raise exception 'Student access required'; end if;
 select * into a from public.ige_assignments where centre_id=p.centre_id and batch_name=p.batch_name
  and student_level=p.current_level and mode=m and enabled;
 if not found then raise exception 'Teacher has not assigned this practice'; end if;
 duration:=case when m='mental' then case when a.grade<=5 then 240 else 180 end
  when a.grade<=7 then 1200 when a.grade<=9 then 600 else 300 end;
 sections:=case when (m='mental' and a.grade<=5) or (m='abacus' and a.grade<=7)
  then array['+/-','x','÷'] else array['+/-'] end;
 foreach section in array sections loop
  for n in 1..10 loop
   if section='+/-' then
    terms:='[]'::jsonb;total:=0;
    -- Number of rows follows the uploaded papers; never allow a negative running total.
    rows_per_sum:=case when m='abacus' then
      case when a.grade<=5 then 15 when a.grade=6 then 14 when a.grade=7 then 12
       when a.grade=8 then 10 when a.grade=9 then 8 when a.grade=10 then case when n<=5 then 6 else 5 end
       when a.grade=11 then 4 else 3 end
      else case when a.grade<=3 then 10 when a.grade=4 then 8
       when a.grade=5 then case when n<=5 then 8 else 6 end
       when a.grade=6 then case when n<=5 then 10 else 7 end
       when a.grade=7 then case when n<=5 then 8 else 5 end
       when a.grade=8 then case when n<=5 then 6 else 5 end
       when a.grade=9 then 5 else 4 end end;
    next_n:=case when a.grade>=10 then 9 when a.grade>=8 then 99
     when a.grade>=6 then 999 when a.grade>=4 then 9999 else 99999 end;
    for j in 1..rows_per_sum loop
      if j=1 then seed:=1+floor(random()*next_n)::integer;
      elsif random()<0.35 then seed:=-least(total,1+floor(random()*next_n)::integer);
      else seed:=1+floor(random()*next_n)::integer; end if;
      if m='abacus' and a.grade<=3 then seed:=round(seed/100,2); end if;
      terms:=terms||to_jsonb(seed);total:=total+seed;
    end loop;
    question:=jsonb_build_object('section',section,'terms',terms,'answer',total);
   elsif section='x' then
    left_n:=case when m='abacus' then case when a.grade=7 then 2+floor(random()*8)::integer
      when a.grade=6 then 44+floor(random()*45)::integer
      when a.grade=5 then 222+floor(random()*778)::integer
      when a.grade=4 then 2222+floor(random()*7778)::integer
      when a.grade=3 then 555+floor(random()*445)::integer
      when a.grade=2 then 1000+floor(random()*9000)::integer
      else 2222+floor(random()*7778)::integer end
     else case when a.grade<=1 then 1111+floor(random()*4445)::integer
      when a.grade<=3 then 111+floor(random()*889)::integer
      else 11+floor(random()*89)::integer end end;
    right_n:=case when m='abacus' and a.grade=1 then 2222+floor(random()*7778)::integer
      when m='abacus' and a.grade=2 then 100+floor(random()*900)::integer
      when m='abacus' and a.grade=3 then 111+floor(random()*445)::integer
      when m='abacus' and a.grade in (4,5,6) then 22+floor(random()*78)::integer
      when m='abacus' and a.grade=7 then 22+floor(random()*78)::integer
      else 2+floor(random()*8)::integer end;
    question:=jsonb_build_object('section',section,'left',left_n,'right',right_n,'answer',left_n*right_n);
   else
    right_n:=case when m='abacus' and a.grade<=2 then 444+floor(random()*9556)::integer
      when m='abacus' and a.grade<=6 then 11+floor(random()*89)::integer
      else 2+floor(random()*8)::integer end;
    total:=case when m='abacus' and a.grade<=2 then 444+floor(random()*9556)::integer
      when m='abacus' and a.grade<=5 then 111+floor(random()*889)::integer
      when m='abacus' and a.grade=6 then 22+floor(random()*78)::integer
      when m='abacus' then 101+floor(random()*899)::integer
      when a.grade=1 then 1111+floor(random()*8889)::integer
      when a.grade<=3 then 111+floor(random()*889)::integer
      else 11+floor(random()*89)::integer end;
    question:=jsonb_build_object('section',section,'left',total*right_n,'right',right_n,'answer',total);
   end if;
   q:=q||jsonb_build_array(question);
  end loop;
 end loop;
 insert into public.ige_attempts(student_id,mode,grade,centre_id,batch_name,student_level,duration_seconds,questions)
 values(auth.uid(),m,a.grade,p.centre_id,p.batch_name,p.current_level,duration,q) returning id into attempt_id;
 return jsonb_build_object('id',attempt_id,'mode',m,'grade',a.grade,'duration_seconds',duration,
   'started_at',now(),'questions',(select jsonb_agg(v - 'answer' order by ord)
     from jsonb_array_elements(q) with ordinality z(v,ord)));
end $$;

create or replace function public.ige_finish(attempt uuid,answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.ige_attempts%rowtype; sec text; correct integer; threshold_credit integer;
 local_scores jsonb='{}'::jsonb; outcome text='Distinction';
begin
 if auth.uid() is null or jsonb_typeof(answers)<>'array' then raise exception 'Invalid submission'; end if;
 select * into a from public.ige_attempts where id=attempt and student_id=auth.uid() for update;
 if not found then raise exception 'Attempt not found'; end if;
 if a.submitted_at is not null then return jsonb_build_object('scores',a.scores,'result',a.result); end if;
 if jsonb_array_length(answers)<>jsonb_array_length(a.questions) then raise exception 'Answer count mismatch'; end if;
 if now()>a.started_at+make_interval(secs=>a.duration_seconds+60) then
  -- Late submissions are accepted, but never grant extra time: answers must be captured by the client timer.
  raise exception 'Time expired. Please start a new attempt';
 end if;
 for sec in select distinct x->>'section' from jsonb_array_elements(a.questions) x loop
  select count(*) into correct from jsonb_array_elements(a.questions) with ordinality q(v,ord)
  where v->>'section'=sec and jsonb_typeof(answers->((ord-1)::integer))='number'
    and (answers->>((ord-1)::integer))::numeric=(v->>'answer')::numeric;
  local_scores:=local_scores||jsonb_build_object(sec,correct);
  threshold_credit:=case when a.mode='abacus' and a.grade<=3 then 8
   when a.mode='mental' and a.grade<=5 and sec='+/-' then 8
   when a.mode='mental' and a.grade<=2 then 8
   when a.mode='mental' and a.grade<=5 and sec in ('x','÷') then 6 else 9 end;
  if correct<7 and not(a.mode='mental' and a.grade<=5 and sec in ('x','÷') and correct>=
    case when a.grade<=2 then 4 else 3 end) then outcome:='Fail';
  elsif outcome<>'Fail' and correct<threshold_credit then outcome:='Pass';
  elsif outcome not in ('Fail','Pass') and correct<10 then outcome:='Credit'; end if;
 end loop;
 update public.ige_attempts set submitted_at=now(),responses=answers,scores=local_scores,result=outcome where id=attempt;
 return jsonb_build_object('scores',local_scores,'result',outcome,'questions',a.questions,'answers',answers);
end $$;

create or replace function public.ige_staff_report()
returns table(student_name text,student_level integer,batch_name text,centre_id smallint,
 centre_name text,mode text,grade integer,started_at timestamptz,scores jsonb,result text)
language plpgsql security definer set search_path='' as $$
begin
 if not public.current_user_is_staff() then raise exception 'Staff access required'; end if;
 return query select p.full_name,a.student_level,a.batch_name,a.centre_id,c.short_name,
  a.mode,a.grade,a.started_at,a.scores,a.result
 from public.ige_attempts a join public.profiles p on p.id=a.student_id
 left join public.centres c on c.id=a.centre_id where a.submitted_at is not null
 order by a.started_at desc limit 5000;
end $$;

revoke execute on function public.ige_staff_assignments(),public.ige_set_assignment(smallint,text,integer,text,integer,boolean),
 public.ige_available(),public.ige_start(text),public.ige_finish(uuid,jsonb),public.ige_staff_report() from public,anon;
grant execute on function public.ige_staff_assignments(),public.ige_set_assignment(smallint,text,integer,text,integer,boolean),
 public.ige_available(),public.ige_start(text),public.ige_finish(uuid,jsonb),public.ige_staff_report() to authenticated;
commit;
