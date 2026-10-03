-- One dated override grants the substitute access and excludes the regular teacher on that day.
create table if not exists public.lecture_substitutions (
 centre_id smallint not null references public.centres(id),
 batch_name text not null,
 lecture_date date not null,
 original_teacher_id uuid not null references public.profiles(id),
 substitute_teacher_id uuid not null references public.profiles(id),
 assigned_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 primary key(centre_id,batch_name,lecture_date),
 check(original_teacher_id <> substitute_teacher_id)
);
create index if not exists lecture_substitutions_teacher_date on public.lecture_substitutions(substitute_teacher_id,lecture_date);
alter table public.lecture_substitutions enable row level security;
revoke all on public.lecture_substitutions from anon, authenticated;

create or replace function public.attendance_can_teach(p_centre smallint,p_batch text,p_date date)
returns boolean language sql security definer set search_path=public as $$
 select coalesce(public.attendance_actor()='teacher' and
 case when exists(select 1 from public.lecture_substitutions s where s.centre_id=p_centre and s.batch_name=p_batch and s.lecture_date=p_date)
 then exists(select 1 from public.lecture_substitutions s where s.centre_id=p_centre and s.batch_name=p_batch and s.lecture_date=p_date and s.substitute_teacher_id=auth.uid())
 else exists(select 1 from public.teacher_batch_assignments a where a.teacher_id=auth.uid() and a.centre_id=p_centre and a.batch_name=p_batch and p_date>=a.starts_on and (a.ends_on is null or p_date<=a.ends_on))
 end,false)
$$;

create or replace function public.admin_set_lecture_substitute(p_original uuid,p_substitute uuid,p_centre smallint,p_batch text,p_date date)
returns void language plpgsql security definer set search_path=public as $$
begin
 if public.attendance_actor()<>'admin' then raise exception 'Admin only'; end if;
 if p_date is null or p_date<current_date-90 or p_date>current_date+90 then raise exception 'Choose a date within 90 days'; end if;
 if p_original=p_substitute then raise exception 'Choose a different teacher'; end if;
 if not exists(select 1 from public.profiles where id=p_substitute and role='teacher' and is_active is true) then raise exception 'Active substitute teacher required'; end if;
 if not exists(select 1 from public.teacher_batch_assignments a where a.teacher_id=p_original and a.centre_id=p_centre and a.batch_name=p_batch and p_date>=a.starts_on and (a.ends_on is null or p_date<=a.ends_on)) then raise exception 'Original teacher is not assigned to this batch on that date'; end if;
 if exists(select 1 from public.class_lectures l where l.centre_id=p_centre and l.batch_name=p_batch and l.lecture_date=p_date and l.kind='regular') then raise exception 'Attendance already submitted. Use the admin teacher correction with a reason.'; end if;
 insert into public.lecture_substitutions(centre_id,batch_name,lecture_date,original_teacher_id,substitute_teacher_id,assigned_by)
 values(p_centre,p_batch,p_date,p_original,p_substitute,auth.uid())
 on conflict(centre_id,batch_name,lecture_date) do update set original_teacher_id=excluded.original_teacher_id,substitute_teacher_id=excluded.substitute_teacher_id,assigned_by=excluded.assigned_by,created_at=now();
end $$;
create or replace function public.attendance_batches() returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(x order by x.batch_name),'[]'::jsonb) from (
    select distinct p.centre_id,p.batch_name, p.current_level as level
    from public.profiles p where p.role='student' and p.is_active is true and p.student_status='active'
      and p.centre_id is not null and p.batch_name is not null
      and public.attendance_actor() is not null
      and (public.attendance_actor()='admin' or public.attendance_can_teach(p.centre_id,p.batch_name,current_date)
        or exists (select 1 from public.lecture_substitutions sub where sub.substitute_teacher_id=auth.uid()
           and sub.centre_id=p.centre_id and sub.batch_name=p.batch_name and sub.lecture_date between current_date-90 and current_date))
  ) x
$$;
create or replace function public.attendance_roster(p_centre smallint,p_batch text,p_date date default current_date)
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'level',p.current_level) order by p.full_name),'[]'::jsonb)
 from public.profiles p where p.role='student' and p.is_active is true and p.student_status='active'
 and p.centre_id=p_centre and p.batch_name=p_batch and public.attendance_actor() is not null
 and (public.attendance_actor()='admin' or public.attendance_can_teach(p_centre,p_batch,p_date))
$$;
create or replace function public.attendance_missed_classes(p_centre smallint,p_batch text,p_date date)
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(x order by x.lecture_date desc),'[]'::jsonb) from (
   select l.id,l.lecture_date,jsonb_agg(jsonb_build_object('id',a.student_id,'name',p.full_name) order by p.full_name) as students
   from public.class_lectures l join public.lecture_attendance a on a.lecture_id=l.id
   join public.profiles p on p.id=a.student_id
   where l.centre_id=p_centre and l.batch_name=p_batch and l.kind='regular'
    and l.lecture_date<=p_date and l.lecture_date>=p_date-90 and a.status='absent'
    and public.attendance_actor() is not null
    and (public.attendance_actor()='admin' or public.attendance_can_teach(p_centre,p_batch,p_date))
    and not exists(select 1 from public.class_lectures patch join public.lecture_attendance pa on pa.lecture_id=patch.id
      where patch.original_lecture_id=l.id and pa.student_id=a.student_id)
   group by l.id
 ) x
$$;
create or replace function public.submit_attendance(p_centre smallint,p_batch text,p_date date,p_kind text,p_original bigint,p_rows jsonb)
returns bigint language plpgsql security definer set search_path=public as $$
declare actor text; v_id bigint; v_level integer; row_item jsonb; student uuid; old_record public.class_lectures%rowtype; expected integer; actual integer;
begin
 actor:=public.attendance_actor();
 if actor<>'teacher' or p_date is null or p_date>current_date or p_date<current_date-90 or p_kind not in ('regular','patchup')
    or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Invalid attendance request'; end if;
 if not public.attendance_can_teach(p_centre,p_batch,p_date)
 then raise exception 'This lecture is assigned to another teacher or this batch is not assigned for this date'; end if;
 if p_kind='patchup' then
   select * into old_record from public.class_lectures where id=p_original and centre_id=p_centre and batch_name=p_batch and kind='regular';
   if not found or jsonb_array_length(p_rows)<>1 then raise exception 'Choose one missed student and the original class'; end if;
   student:=(p_rows->0->>'id')::uuid;
   if not exists(select 1 from public.lecture_attendance where lecture_id=p_original and student_id=student and status='absent')
      or p_rows->0->>'status'<>'present' then raise exception 'Patch up requires an absent student'; end if;
   if exists(select 1 from public.class_lectures l join public.lecture_attendance a on a.lecture_id=l.id
      where l.original_lecture_id=p_original and a.student_id=student) then raise exception 'Patch up already recorded'; end if;
   v_level:=old_record.level;
 else
   if p_original is not null then raise exception 'Original class only applies to patch ups'; end if;
   select min(current_level) into v_level from public.profiles where role='student' and is_active is true and student_status='active' and centre_id=p_centre and batch_name=p_batch;
   select count(*) into expected from public.profiles where role='student' and is_active is true and student_status='active' and centre_id=p_centre and batch_name=p_batch;
   select count(distinct (x->>'id')::uuid) into actual from jsonb_array_elements(p_rows) x;
   if expected<>jsonb_array_length(p_rows) or actual<>expected then raise exception 'Mark every active student once'; end if;
 end if;
 if v_level is null then raise exception 'Batch has no active students'; end if;
 for row_item in select value from jsonb_array_elements(p_rows) loop
   student:=(row_item->>'id')::uuid;
   if row_item->>'status' not in ('present','absent') or not exists(select 1 from public.profiles
     where id=student and role='student' and centre_id=p_centre and batch_name=p_batch and is_active is true and student_status='active')
   then raise exception 'Invalid student or status'; end if;
 end loop;
 insert into public.class_lectures(centre_id,batch_name,level,lecture_date,kind,teacher_id,original_lecture_id,submitted_by)
 values(p_centre,p_batch,v_level,p_date,p_kind,auth.uid(),p_original,auth.uid()) returning id into v_id;
 insert into public.lecture_attendance(lecture_id,student_id,status)
 select v_id,(x->>'id')::uuid,x->>'status' from jsonb_array_elements(p_rows) x;
 return v_id;
end $$;
create or replace function public.admin_attendance_setup() returns jsonb language sql security definer set search_path=public as $$
 select case when public.attendance_actor()='admin' then jsonb_build_object(
   'teachers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'active',is_active) order by full_name),'[]'::jsonb) from public.profiles where role='teacher'),
   'batches',(select coalesce(jsonb_agg(x order by x.batch_name),'[]'::jsonb) from
     (select distinct centre_id,batch_name from public.profiles where role='student' and centre_id is not null and batch_name is not null) x),
   'substitutions',(select coalesce(jsonb_agg(jsonb_build_object('centre_id',centre_id,'batch_name',batch_name,'lecture_date',lecture_date,'original_teacher_id',original_teacher_id,'substitute_teacher_id',substitute_teacher_id) order by lecture_date desc),'[]'::jsonb) from public.lecture_substitutions where lecture_date>=current_date-90),
   'assignments',(select coalesce(jsonb_agg(jsonb_build_object('teacher_id',teacher_id,'centre_id',centre_id,'batch_name',batch_name,'starts_on',starts_on,'ends_on',ends_on) order by starts_on desc),'[]'::jsonb) from public.teacher_batch_assignments)
 ) else null end
$$;
create or replace function public.attendance_regular_status(p_centre smallint,p_batch text,p_date date)
returns jsonb language sql security definer set search_path=public as $$
 select (select jsonb_build_object('id',l.id,'date',l.lecture_date,'batch',l.batch_name,
 'present',count(*) filter(where a.status='present'),'absent',count(*) filter(where a.status='absent'))
 from public.class_lectures l join public.lecture_attendance a on a.lecture_id=l.id
 where l.centre_id=p_centre and l.batch_name=p_batch and l.lecture_date=p_date and l.kind='regular'
 group by l.id)
 where public.attendance_actor()='admin' or public.attendance_can_teach(p_centre,p_batch,p_date)
$$;
revoke all on function public.attendance_can_teach(smallint,text,date),public.admin_set_lecture_substitute(uuid,uuid,smallint,text,date) from public;
grant execute on function public.attendance_can_teach(smallint,text,date),public.admin_set_lecture_substitute(uuid,uuid,smallint,text,date) to authenticated;
