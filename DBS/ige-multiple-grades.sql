begin;
alter table public.ige_assignments
  drop constraint ige_assignments_centre_id_batch_name_student_level_mode_key;
alter table public.ige_assignments
  add constraint ige_assignments_scope_grade_key
  unique (centre_id,batch_name,student_level,mode,grade);

create or replace function public.ige_set_grades(c smallint,b text,l integer,m text,g integer[],e boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.current_user_is_staff() then raise exception 'Staff access required'; end if;
  if c is null or b is null or btrim(b)='' or l not between 1 and 8
    or m not in ('abacus','mental') or g is null or e is null
    or cardinality(g)>12 or exists(select 1 from unnest(g) x
      where x is null or x<1 or x>case when m='mental' then 10 else 12 end)
    then raise exception 'Invalid grade selection'; end if;
  if not exists(select 1 from public.profiles p where p.role='student' and p.is_active is true
    and p.centre_id=c and p.batch_name=b and p.current_level=l)
    then raise exception 'Batch and level not found'; end if;
  update public.ige_assignments a set enabled=false,updated_at=now()
    where a.centre_id=c and a.batch_name=b and a.student_level=l and a.mode=m
      and not (a.grade=any(g));
  insert into public.ige_assignments(centre_id,batch_name,student_level,mode,grade,enabled)
    select c,b,l,m,x,e from (select distinct unnest(g) x) selected
    on conflict (centre_id,batch_name,student_level,mode,grade)
    do update set enabled=excluded.enabled,updated_at=now();
end $$;

-- The student must request the exact assigned grade; a mode alone is not sufficient.
drop function public.ige_start(text);
create or replace function public.ige_start(m text,g integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; a public.ige_assignments%rowtype;
  sections text[]; section text; q jsonb='[]'::jsonb; terms jsonb; n integer; j integer;
  next_n integer; total numeric; left_n integer; right_n integer;
  question jsonb; attempt_id uuid; duration integer; seed numeric; rows_per_sum integer;
begin
 if auth.uid() is null or m not in ('abacus','mental') or g is null then raise exception 'Sign in required'; end if;
 select * into p from public.profiles where id=auth.uid() and role='student' and is_active is true and student_status='active';
 if not found then raise exception 'Student access required'; end if;
 select * into a from public.ige_assignments where centre_id=p.centre_id and batch_name=p.batch_name
  and student_level=p.current_level and mode=m and grade=g and enabled;
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

drop function public.ige_set_assignment(smallint,text,integer,text,integer,boolean);
revoke execute on function public.ige_set_grades(smallint,text,integer,text,integer[],boolean),
  public.ige_start(text,integer) from public,anon;
grant execute on function public.ige_set_grades(smallint,text,integer,text,integer[],boolean),
  public.ige_start(text,integer) to authenticated;
commit;
