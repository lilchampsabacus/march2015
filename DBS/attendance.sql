-- Run once in the main Supabase project. All writes go through checked RPCs.
create table if not exists public.teacher_batch_assignments (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.profiles(id),
  centre_id smallint not null references public.centres(id),
  batch_name text not null,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists teacher_batch_lookup on public.teacher_batch_assignments(teacher_id,centre_id,batch_name,starts_on,ends_on);

create table if not exists public.class_lectures (
  id bigint generated always as identity primary key,
  centre_id smallint not null references public.centres(id),
  batch_name text not null,
  level integer not null check (level between 1 and 10),
  lecture_date date not null,
  kind text not null check (kind in ('regular','patchup')),
  teacher_id uuid not null references public.profiles(id),
  original_lecture_id bigint references public.class_lectures(id),
  rate_rupees integer not null default 40 check (rate_rupees >= 0),
  submitted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((kind='patchup') = (original_lecture_id is not null))
);
create unique index if not exists one_regular_lecture on public.class_lectures(centre_id,batch_name,lecture_date) where kind='regular';

create table if not exists public.lecture_attendance (
  lecture_id bigint not null references public.class_lectures(id),
  student_id uuid not null references public.profiles(id),
  status text not null check (status in ('present','absent')),
  primary key (lecture_id,student_id)
);
create unique index if not exists one_patchup_per_absence on public.lecture_attendance(student_id,lecture_id);
create table if not exists public.attendance_audit (
  id bigint generated always as identity primary key,
  lecture_id bigint not null references public.class_lectures(id),
  student_id uuid not null references public.profiles(id),
  old_status text not null,
  new_status text not null,
  reason text not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);
alter table public.teacher_batch_assignments enable row level security;
alter table public.class_lectures enable row level security;
alter table public.lecture_attendance enable row level security;
alter table public.attendance_audit enable row level security;
revoke all on public.teacher_batch_assignments, public.class_lectures, public.lecture_attendance, public.attendance_audit from anon, authenticated;

create or replace function public.attendance_actor() returns text language sql security definer set search_path=public as $$
  select role from public.profiles where id=auth.uid() and is_active is true and role in ('admin','teacher')
$$;
revoke all on function public.attendance_actor() from public;
grant execute on function public.attendance_actor() to authenticated;

create or replace function public.attendance_batches() returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(x order by x.batch_name),'[]'::jsonb) from (
    select distinct p.centre_id,p.batch_name, p.current_level as level
    from public.profiles p where p.role='student' and p.is_active is true and p.student_status='active'
      and p.centre_id is not null and p.batch_name is not null
      and public.attendance_actor() is not null
      and (public.attendance_actor()='admin' or exists (
        select 1 from public.teacher_batch_assignments a where a.teacher_id=auth.uid()
          and a.centre_id=p.centre_id and a.batch_name=p.batch_name
          and current_date>=a.starts_on and (a.ends_on is null or current_date<=a.ends_on)))
  ) x
$$;
create or replace function public.attendance_roster(p_centre smallint,p_batch text,p_date date default current_date)
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'level',p.current_level) order by p.full_name),'[]'::jsonb)
 from public.profiles p where p.role='student' and p.is_active is true and p.student_status='active'
 and p.centre_id=p_centre and p.batch_name=p_batch and public.attendance_actor() is not null
 and (public.attendance_actor()='admin' or exists(select 1 from public.teacher_batch_assignments a
 where a.teacher_id=auth.uid() and a.centre_id=p_centre and a.batch_name=p_batch
 and p_date>=a.starts_on and (a.ends_on is null or p_date<=a.ends_on)))
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
    and (public.attendance_actor()='admin' or exists(select 1 from public.teacher_batch_assignments t
      where t.teacher_id=auth.uid() and t.centre_id=p_centre and t.batch_name=p_batch
        and p_date>=t.starts_on and (t.ends_on is null or p_date<=t.ends_on)))
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
 if actor='teacher' and not exists(select 1 from public.teacher_batch_assignments a where a.teacher_id=auth.uid()
    and a.centre_id=p_centre and a.batch_name=p_batch and p_date>=a.starts_on and (a.ends_on is null or p_date<=a.ends_on))
 then raise exception 'Batch not assigned for this date'; end if;
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

create or replace function public.admin_correct_attendance(p_lecture bigint,p_student uuid,p_status text,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare prior text;
begin
 if public.attendance_actor()<>'admin' then raise exception 'Admin only'; end if;
 if p_status not in ('present','absent') or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a status and reason'; end if;
 select status into prior from public.lecture_attendance where lecture_id=p_lecture and student_id=p_student for update;
 if not found then raise exception 'Attendance record missing'; end if;
 if prior='absent' and p_status='present' and exists (
   select 1 from public.class_lectures l join public.lecture_attendance a on a.lecture_id=l.id
   where l.original_lecture_id=p_lecture and a.student_id=p_student
 ) then raise exception 'A patch up is recorded for this absence. Review it first'; end if;
 if prior<>p_status then
   update public.lecture_attendance set status=p_status where lecture_id=p_lecture and student_id=p_student;
   insert into public.attendance_audit(lecture_id,student_id,old_status,new_status,reason,changed_by)
   values(p_lecture,p_student,prior,p_status,trim(p_reason),auth.uid());
 end if;
end $$;

create or replace function public.admin_change_lecture_teacher(p_lecture bigint,p_teacher uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare previous uuid;
begin
 if public.attendance_actor()<>'admin' or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Admin and reason required'; end if;
 if not exists(select 1 from public.profiles where id=p_teacher and role='teacher') then raise exception 'Teacher missing'; end if;
 select teacher_id into previous from public.class_lectures where id=p_lecture for update;
 if not found then raise exception 'Lecture missing'; end if;
 update public.class_lectures set teacher_id=p_teacher where id=p_lecture;
 -- Teacher changes are recorded as a separate audit entry with the same status sentinel.
 insert into public.lecture_teacher_audit(lecture_id,old_teacher,new_teacher,reason,changed_by)
 values(p_lecture,previous,p_teacher,trim(p_reason),auth.uid());
end $$;

create table if not exists public.lecture_teacher_audit (
 id bigint generated always as identity primary key,
 lecture_id bigint not null references public.class_lectures(id),
 old_teacher uuid not null references public.profiles(id),
 new_teacher uuid not null references public.profiles(id),
 reason text not null,
 changed_by uuid not null references public.profiles(id),
 changed_at timestamptz not null default now()
);
alter table public.lecture_teacher_audit enable row level security;
revoke all on public.lecture_teacher_audit from anon,authenticated;

create or replace function public.admin_set_teacher_batch(p_teacher uuid,p_centre smallint,p_batch text,p_start date,p_end date default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if public.attendance_actor()<>'admin' then raise exception 'Admin only'; end if;
 if not exists(select 1 from public.profiles where id=p_teacher and role='teacher' and is_active is true) then raise exception 'Active teacher required'; end if;
 if not exists(select 1 from public.profiles where role='student' and centre_id=p_centre and batch_name=p_batch) then raise exception 'Batch missing'; end if;
 insert into public.teacher_batch_assignments(teacher_id,centre_id,batch_name,starts_on,ends_on)
 values(p_teacher,p_centre,p_batch,p_start,p_end);
end $$;

create or replace function public.admin_attendance_setup() returns jsonb language sql security definer set search_path=public as $$
 select case when public.attendance_actor()='admin' then jsonb_build_object(
   'teachers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'active',is_active) order by full_name),'[]'::jsonb) from public.profiles where role='teacher'),
   'batches',(select coalesce(jsonb_agg(x order by x.batch_name),'[]'::jsonb) from
     (select distinct centre_id,batch_name from public.profiles where role='student' and centre_id is not null and batch_name is not null) x),
   'assignments',(select coalesce(jsonb_agg(jsonb_build_object('teacher_id',teacher_id,'centre_id',centre_id,'batch_name',batch_name,'starts_on',starts_on,'ends_on',ends_on) order by starts_on desc),'[]'::jsonb) from public.teacher_batch_assignments)
 ) else null end
$$;

create or replace function public.attendance_report(p_from date,p_to date)
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(t order by t.lecture_date desc,t.id desc),'[]'::jsonb) from (
 select l.id,l.lecture_date,l.kind,l.centre_id,l.batch_name,l.level,l.teacher_id,
   teacher.full_name as teacher_name,l.original_lecture_id,l.rate_rupees,
   count(*) filter(where a.status='present') as present_count,
   count(*) filter(where a.status='absent') as absent_count,
   count(*) filter(where a.status='present')*l.rate_rupees as salary,
   jsonb_agg(jsonb_build_object('id',a.student_id,'name',student.full_name,'status',a.status) order by student.full_name) as students
 from public.class_lectures l join public.lecture_attendance a on a.lecture_id=l.id
 join public.profiles teacher on teacher.id=l.teacher_id join public.profiles student on student.id=a.student_id
 where public.attendance_actor() is not null and p_from<=p_to and p_to-p_from<=366
 and l.lecture_date between p_from and p_to
 and (public.attendance_actor()='admin' or l.teacher_id=auth.uid())
 group by l.id,teacher.full_name
 ) t
$$;

revoke all on function public.attendance_batches(),public.attendance_roster(smallint,text,date),public.attendance_missed_classes(smallint,text,date),public.submit_attendance(smallint,text,date,text,bigint,jsonb),public.admin_correct_attendance(bigint,uuid,text,text),public.admin_change_lecture_teacher(bigint,uuid,text),public.admin_set_teacher_batch(uuid,smallint,text,date,date),public.admin_attendance_setup(),public.attendance_report(date,date) from public;
grant execute on function public.attendance_batches(),public.attendance_roster(smallint,text,date),public.attendance_missed_classes(smallint,text,date),public.submit_attendance(smallint,text,date,text,bigint,jsonb),public.admin_correct_attendance(bigint,uuid,text,text),public.admin_change_lecture_teacher(bigint,uuid,text),public.admin_set_teacher_batch(uuid,smallint,text,date,date),public.admin_attendance_setup(),public.attendance_report(date,date) to authenticated;
