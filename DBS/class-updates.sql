create table public.class_updates (
 id bigint generated always as identity primary key,
 centre_id smallint not null references public.centres(id), batch_name text not null,
 level integer not null check(level between 1 and 10), class_date date not null,
 kind text not null check(kind in ('completed','sample_test','final_exam','notice')),
 week integer check(week between 1 and 100), book text not null default '' check(length(book)<=80),
 pages text not null default '' check(length(pages)<=300), message text not null default '' check(length(message)<=2000),
 event_date date, author uuid not null references public.profiles(id), updated_at timestamptz not null default now()
);
create index class_updates_batch on public.class_updates(centre_id,batch_name,level,class_date desc);
create index class_updates_author on public.class_updates(author);
create table public.class_update_reads (
 update_id bigint not null references public.class_updates(id) on delete cascade,
 student_id uuid not null references public.profiles(id), read_at timestamptz not null default now(),
 primary key(update_id,student_id)
);
create index class_update_reads_student on public.class_update_reads(student_id);
alter table public.class_updates enable row level security;
alter table public.class_update_reads enable row level security;
revoke all on public.class_updates,public.class_update_reads from public,anon,authenticated;
create or replace function public.class_update_can_manage(p_centre smallint,p_batch text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.attendance_actor()='admin' or (public.attendance_actor()='teacher' and exists(
 select 1 from public.teacher_batch_assignments a where a.teacher_id=auth.uid() and a.centre_id=p_centre and a.batch_name=p_batch
 and (now() at time zone 'Asia/Kolkata')::date>=a.starts_on and (a.ends_on is null or (now() at time zone 'Asia/Kolkata')::date<=a.ends_on))))
$$;
create or replace function public.class_updates_list() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(x order by x.class_date desc,x.id desc),'[]'::jsonb) from (
 select u.*, coalesce(r.read_at>=u.updated_at,false) as is_read from public.class_updates u
 left join public.class_update_reads r on r.update_id=u.id and r.student_id=auth.uid()
 where auth.uid() is not null and (public.class_update_can_manage(u.centre_id,u.batch_name) or exists(
 select 1 from public.profiles p where p.id=auth.uid() and p.role='student' and p.is_active is true
 and p.centre_id=u.centre_id and p.batch_name=u.batch_name and p.current_level=u.level))
 order by u.class_date desc,u.id desc limit 100
 ) x
$$;
create or replace function public.class_update_save(p_id bigint,p_centre smallint,p_batch text,p_level integer,p_date date,p_kind text,p_week integer,p_book text,p_pages text,p_message text,p_event date)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_id bigint;
begin
 if not coalesce(public.class_update_can_manage(p_centre,p_batch),false) then raise exception 'Batch access denied'; end if;
 if p_date is null or p_kind is null or p_level is null or p_batch is null then raise exception 'Complete the required fields'; end if;
 if p_kind='completed' and (p_week is null or trim(coalesce(p_book,''))='' or trim(coalesce(p_pages,''))='') then raise exception 'Enter week, book and pages'; end if;
 if p_kind in ('sample_test','final_exam') and p_event is null then raise exception 'Enter the test date'; end if;
 if p_kind='notice' and trim(coalesce(p_message,''))='' then raise exception 'Enter the notice'; end if;
 if p_id is null then
 insert into public.class_updates(centre_id,batch_name,level,class_date,kind,week,book,pages,message,event_date,author)
 values(p_centre,p_batch,p_level,p_date,p_kind,p_week,trim(p_book),trim(p_pages),trim(p_message),p_event,auth.uid()) returning id into v_id;
 else
 update public.class_updates set level=p_level,class_date=p_date,kind=p_kind,week=p_week,book=trim(p_book),pages=trim(p_pages),message=trim(p_message),event_date=p_event,updated_at=clock_timestamp()
 where id=p_id and centre_id=p_centre and batch_name=p_batch returning id into v_id;
 if v_id is null then raise exception 'Update not found in this batch'; end if;
 end if;
 return v_id;
end $$;
create or replace function public.class_update_mark_read(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.class_updates u join public.profiles p on p.id=auth.uid()
 where u.id=p_id and p.role='student' and p.is_active is true and p.centre_id=u.centre_id and p.batch_name=u.batch_name and p.current_level=u.level)
 then raise exception 'Notice access denied'; end if;
 insert into public.class_update_reads(update_id,student_id) values(p_id,auth.uid()) on conflict(update_id,student_id) do update set read_at=clock_timestamp();
end $$;
revoke all on function public.class_update_can_manage(smallint,text),public.class_updates_list(),public.class_update_save(bigint,smallint,text,integer,date,text,integer,text,text,text,date),public.class_update_mark_read(bigint) from public,anon;
grant execute on function public.class_updates_list(),public.class_update_save(bigint,smallint,text,integer,date,text,integer,text,text,text,date),public.class_update_mark_read(bigint) to authenticated;
