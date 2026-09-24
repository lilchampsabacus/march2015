-- Keep Grade 9 running totals nonnegative and match Grade 3 decimal division display.
create or replace function public.ige_start(m text,g integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype; a public.ige_assignments%rowtype;
  template jsonb; q jsonb:='[]'::jsonb; spec jsonb; item jsonb; terms jsonb;
  section text; sections text[]; n integer; j integer; total numeric; value numeric;
  left_n numeric; right_n numeric; dividend numeric; display_divisor numeric; quotient numeric; digit integer; candidate integer; target_digit integer;
  direct_steps integer[]; tries integer; valid_division boolean; attempt_id uuid; duration integer;
begin
 if auth.uid() is null or m not in ('abacus','mental') or g is null then raise exception 'Sign in required'; end if;
 select * into p from public.profiles where id=auth.uid() and role='student' and is_active is true and student_status='active';
 if not found then raise exception 'Student access required'; end if;
 select * into a from public.ige_assignments where centre_id=p.centre_id and batch_name=p.batch_name
  and student_level=p.current_level and mode=m and grade=g and enabled;
 if not found then raise exception 'Teacher has not assigned this practice'; end if;
 select pattern into template from public.ige_grade_patterns where mode=m and grade=g;
 if template is null then raise exception 'IGE grade paper has not been configured'; end if;
 duration:=case when m='mental' then case when g<=5 then 240 else 180 end
  when g<=7 then 1200 when g<=9 then 600 else 300 end;
 sections:=case when (m='mental' and g<=5) or (m='abacus' and g<=7)
  then array['+/-','x','÷'] else array['+/-'] end;
 foreach section in array sections loop
  if jsonb_array_length(template->case when section='+/-' then 'plus' when section='x' then 'x' else 'div' end)<>10 then
    raise exception 'Incomplete IGE grade paper';
  end if;
  for n in 0..9 loop
   spec:=template->case when section='+/-' then 'plus' when section='x' then 'x' else 'div' end->n;
   if section='+/-' then
    terms:='[]'::jsonb;total:=0;
    for j in 0..jsonb_array_length(spec)-1 loop
     item:=spec->j;
     if item->>'type'='direct' then
       digit:=total::integer;
       -- Grade 12's nested CHOOSE formulas use these exact options for the current value.
       direct_steps:=case digit
         when 0 then array[1,2,3,4,5,6,7,8,9]
         when 1 then array[1,2,3,5,6,7,8]
         when 2 then array[1,2,5,6,7,-1]
         when 3 then array[1,5,6,-1,-2]
         when 4 then array[5,-1,-2,-3]
         when 5 then array[1,2,3,4]
         when 6 then array[1,2,3,-5,-1]
         when 7 then array[1,2,-1,-2,-5,-6]
         when 8 then array[1,-1,-2,-3,-5,-6,-7]
         when 9 then array[-1,-2,-3,-4,-5,-6,-7,-8] end;
       if cardinality(direct_steps)=0 then raise exception 'No Grade 12 Excel choice'; end if;
       value:=direct_steps[1+floor(random()*cardinality(direct_steps))::integer];
     else
       value:=public.ige_sample_pattern(item);
     end if;
     if m='abacus' and g=9 then
       for tries in 1..10000 loop
         exit when total+value>=0;
         value:=public.ige_sample_pattern(item);
       end loop;
       if total+value<0 then raise exception 'Could not keep Grade 9 sum nonnegative'; end if;
     end if;
     terms:=terms||to_jsonb(value);total:=total+value;
    end loop;
    q:=q||jsonb_build_array(jsonb_build_object('section','+/-','terms',terms,'answer',total));
   else
    -- Grade 3 questions 28–30 display the divisor to two decimal places.
    -- Its question 29 has a fixed dividend (21.3063). Replace its zero digit
    -- with 1 to respect the classroom rule that sums contain no zero digits.
    if m='abacus' and g=3 and section='÷' and n>=7 then
      valid_division:=false;
      for tries in 1..10000 loop
        left_n:=public.ige_sample_pattern(spec->0);
        right_n:=public.ige_sample_pattern(spec->1);
        display_divisor:=round(right_n,2);
        dividend:=case when n=8 then 21.3163 else round(left_n*right_n,5) end;
        if display_divisor<>0 and position('0' in regexp_replace(trim_scale(abs(display_divisor))::text,'^0\.','.'))=0
           and position('0' in regexp_replace(trim_scale(abs(dividend))::text,'^0\.','.'))=0 then
          valid_division:=true; exit;
        end if;
      end loop;
      if not valid_division then raise exception 'Could not create Grade 3 decimal division'; end if;
      quotient:=round(dividend/display_divisor,2);
      q:=q||jsonb_build_array(jsonb_build_object('section','÷','left',dividend,'right',display_divisor,'answer',quotient));
      continue;
    end if;
    valid_division:=false;
    for tries in 1..1000 loop
     left_n:=public.ige_sample_pattern(spec->0);
     right_n:=public.ige_sample_pattern(spec->1);
     if section='x' then exit; end if;
     if tries>1 and spec->0->>'type'='fixed' then left_n:=public.ige_adjust_last_digit(left_n); end if;
     if tries>1 and spec->1->>'type'='fixed' then right_n:=public.ige_adjust_last_digit(right_n); end if;
     -- Division template stores quotient followed by divisor. Show their product as dividend.
     if position('0' in regexp_replace(trim_scale(abs(left_n*right_n))::text,'^0\.','.'))=0 then
       valid_division:=true;exit;
     end if;
    end loop;
    if section='÷' and not valid_division then raise exception 'Could not create zero-free IGE division'; end if;
    if section='x' then
      q:=q||jsonb_build_array(jsonb_build_object('section','x','left',left_n,'right',right_n,'answer',left_n*right_n));
    else
      q:=q||jsonb_build_array(jsonb_build_object('section','÷','left',trim_scale(left_n*right_n),'right',right_n,'answer',left_n));
    end if;
   end if;
  end loop;
 end loop;
 insert into public.ige_attempts(student_id,mode,grade,centre_id,batch_name,student_level,duration_seconds,questions)
 values(auth.uid(),m,g,p.centre_id,p.batch_name,p.current_level,duration,q) returning id into attempt_id;
 return jsonb_build_object('id',attempt_id,'mode',m,'grade',g,'duration_seconds',duration,
   'started_at',now(),'questions',(select jsonb_agg(v - 'answer' order by ord)
     from jsonb_array_elements(q) with ordinality z(v,ord)));
end $$;
