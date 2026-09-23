begin;
create or replace function public.ige_start(m text,g integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; a public.ige_assignments%rowtype;
  sections text[]; section text; q jsonb='[]'::jsonb; terms jsonb; n integer; j integer;
  next_n integer; total numeric; left_n integer; right_n integer;
  question jsonb; attempt_id uuid; duration integer; seed numeric; rows_per_sum integer;
  digit integer; candidate integer; target_digit integer; previous_step integer; direct_steps integer[];
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
      if m='abacus' and a.grade=12 then
        if j=1 then
          seed:=1+floor(random()*9)::integer;
        else
          digit:=total::integer;
          direct_steps:=array[]::integer[];
          for candidate in -9..9 loop
            if candidate=0 or candidate=-previous_step then continue; end if;
            target_digit:=digit+candidate;
            if target_digit<0 or target_digit>9 then continue; end if;
            -- Direct moves may only move the upper and lower beads in the same direction.
            if (candidate>0 and target_digit/5>=digit/5 and target_digit%5>=digit%5)
              or (candidate<0 and target_digit/5<=digit/5 and target_digit%5<=digit%5)
              then direct_steps:=array_append(direct_steps,candidate); end if;
          end loop;
          if cardinality(direct_steps)=0 then raise exception 'No direct step available'; end if;
          seed:=direct_steps[1+floor(random()*cardinality(direct_steps))::integer];
        end if;
      else
        if j=1 then seed:=1+floor(random()*next_n)::integer;
        elsif random()<0.35 then seed:=-least(total,1+floor(random()*next_n)::integer);
        else seed:=1+floor(random()*next_n)::integer; end if;
        if m='abacus' and a.grade<=3 then seed:=round(seed/100,2); end if;
      end if;
      terms:=terms||to_jsonb(seed);total:=total+seed;
      previous_step:=seed::integer;
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

commit;
