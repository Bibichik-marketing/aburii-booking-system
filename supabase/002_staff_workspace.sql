-- Additive staff reads and non-destructive audit-backed archive metadata.
-- Booking rows, status transitions and capacity functions are unchanged.
begin;
create index if not exists aburii_booking_arrivals on aburii.bookings(starts_at,id);
create index if not exists aburii_archive_audit on aburii.audit(booking_id,id desc) where event in ('booking_archived','booking_restored');

create or replace function aburii.staff_record(b aburii.bookings) returns jsonb language sql volatile set search_path='' as $$
 select (to_jsonb(b)-'request_hash')||jsonb_build_object(
 'effective_status',case when b.status='pending' and b.expires_at<=clock_timestamp() then 'expired' else b.status end,
 'capacity_committed',aburii.active(b) and b.starts_at<=clock_timestamp() and b.ends_at>clock_timestamp(),
 'archived',coalesce((select a.event='booking_archived' from aburii.audit a where a.booking_id=b.id and a.event in ('booking_archived','booking_restored') order by a.id desc limit 1),false));
$$;
create or replace function public.aburii_staff_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; result jsonb;
begin
 r=aburii.role();
 select jsonb_build_object('role',r,'version',s.version,'config',s.config,'notifications',
 case when r in ('admin','manager') then (select jsonb_build_object('queued',count(*) filter(where delivered_at is null and discarded_at is null and attempts<8),'failed',count(*) filter(where delivered_at is null and discarded_at is null and attempts>=8)) from aburii.outbox) else '{}'::jsonb end)
 into result from aburii.settings s where s.id;return result;
end $$;
create or replace function public.aburii_staff_list(
 p_query text default '',p_from date default null,p_to date default null,p_status text default 'all',p_area text default 'all',
 p_sort text default 'arrival',p_order text default 'desc',p_page integer default 1,p_size integer default 25,p_archive text default 'all'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; result jsonb; total bigint; actual_page integer;
begin
 r=aburii.role();
 if p_query is null or length(p_query)>150 or p_status is null or p_status not in ('all','pending','confirmed','seated','completed','cancelled','declined','expired','no_show')
 or p_area is null or p_area not in ('all','counter','private') or p_sort is null or p_sort not in ('arrival','name','guests','area','status')
 or p_order is null or p_order not in ('asc','desc') or p_page is null or p_page not between 1 and 1000000 or p_size is null or p_size not in (10,25,50)
 or p_archive is null or p_archive not in ('all','active','archived') or (p_from is not null and p_to is not null and p_to<p_from)
 then raise exception 'Invalid list filters';end if;
 -- A single statement snapshot keeps the count and page consistent during concurrent changes.
 with filtered as materialized (
 select b.*,case when b.status='pending' and b.expires_at<=clock_timestamp() then 'expired' else b.status end effective,
 coalesce((select a.event='booking_archived' from aburii.audit a where a.booking_id=b.id and a.event in ('booking_archived','booking_restored') order by a.id desc limit 1),false) archived
 from aburii.bookings b where
 (p_from is null or b.starts_at>=(p_from::timestamp at time zone 'Asia/Kuala_Lumpur')) and
 (p_to is null or b.starts_at<((p_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur')) and
 (p_area='all' or b.area=p_area) and
 (p_query='' or position(lower(trim(p_query)) in lower(b.name||' '||b.phone||' '||b.reference))>0 or
 (length(regexp_replace(p_query,'[^0-9]','','g'))>=4 and position(regexp_replace(p_query,'[^0-9]','','g') in regexp_replace(b.phone,'[^0-9]','','g'))>0))
 ), matched as materialized (select * from filtered f where (p_status='all' or f.effective=p_status) and (p_archive='all' or f.archived=(p_archive='archived'))),
 totals as (select count(*) n,greatest(1,least(p_page,ceil(count(*)::numeric/p_size)::integer)) page from matched),
 page_rows as (
 select m.id,row_number() over(order by
 case when p_sort='arrival' and p_order='asc' then m.starts_at end asc,
 case when p_sort='arrival' and p_order='desc' then m.starts_at end desc,
 case when p_sort='name' and p_order='asc' then lower(m.name) end asc,
 case when p_sort='name' and p_order='desc' then lower(m.name) end desc,
 case when p_sort='guests' and p_order='asc' then m.guests end asc,
 case when p_sort='guests' and p_order='desc' then m.guests end desc,
 case when p_sort='area' and p_order='asc' then m.area end asc,
 case when p_sort='area' and p_order='desc' then m.area end desc,
 case when p_sort='status' and p_order='asc' then m.effective end asc,
 case when p_sort='status' and p_order='desc' then m.effective end desc,
 m.id asc) ordinal from matched m order by ordinal limit p_size offset ((select page from totals)-1)*p_size
 ), numbered as (select id,ordinal from page_rows)
 select jsonb_build_object('total',t.n,'page',t.page,'size',p_size,'bookings',coalesce((select jsonb_agg(aburii.staff_record(b) order by n.ordinal) from numbered n join aburii.bookings b on b.id=n.id),'[]'::jsonb)) into result from totals t;
 return result;
end $$;
create or replace function public.aburii_staff_detail(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b aburii.bookings;
begin perform aburii.role();select * into b from aburii.bookings where id=p_id;if not found then raise exception 'Booking not found';end if;return aburii.staff_record(b);end $$;
create or replace function public.aburii_staff_today() returns jsonb language plpgsql security definer set search_path='' as $$
declare d date;result jsonb;
begin
 perform aburii.role();d=(clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date;
 select jsonb_build_object('date',d,'bookings',coalesce((select jsonb_agg(aburii.staff_record(b) order by b.starts_at,b.id) from aburii.bookings b where b.starts_at>=(d::timestamp at time zone 'Asia/Kuala_Lumpur') and b.starts_at<((d+1)::timestamp at time zone 'Asia/Kuala_Lumpur')),'[]'::jsonb),
 'occupancy',coalesce((select jsonb_agg(aburii.staff_record(b) order by b.starts_at,b.id) from aburii.bookings b where aburii.active(b) and b.starts_at<((d+1)::timestamp at time zone 'Asia/Kuala_Lumpur') and b.ends_at>(d::timestamp at time zone 'Asia/Kuala_Lumpur')),'[]'::jsonb)) into result;
 return result;
end $$;
create or replace function public.aburii_staff_archive(p_id uuid,p_archived boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare b aburii.bookings;existing boolean;
begin
 if aburii.role()<>'admin' then raise exception 'Administrator required' using errcode='42501';end if;
 if p_archived is null then raise exception 'Invalid archive request';end if;
 perform 1 from aburii.settings where id for update;
 select * into b from aburii.bookings where id=p_id for update;if not found then raise exception 'Booking not found';end if;
 if p_archived and (not (b.status in ('completed','cancelled','declined','expired','no_show') or (b.status='pending' and b.expires_at<=clock_timestamp())) or (aburii.active(b) and b.ends_at>clock_timestamp())) then raise exception 'Active commitment cannot be archived';end if;
 select coalesce((select event='booking_archived' from aburii.audit where booking_id=p_id and event in ('booking_archived','booking_restored') order by id desc limit 1),false) into existing;
 if existing is distinct from p_archived then insert into aburii.audit(actor,event,booking_id,details) values(auth.uid(),case when p_archived then 'booking_archived' else 'booking_restored' end,p_id,jsonb_build_object('status',b.status));end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function aburii.staff_record(aburii.bookings) from public,anon,authenticated,service_role;
revoke all on function public.aburii_staff_context(),public.aburii_staff_list(text,date,date,text,text,text,text,integer,integer,text),public.aburii_staff_detail(uuid),public.aburii_staff_today(),public.aburii_staff_archive(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.aburii_staff_context(),public.aburii_staff_list(text,date,date,text,text,text,text,integer,integer,text),public.aburii_staff_detail(uuid),public.aburii_staff_today(),public.aburii_staff_archive(uuid,boolean) to authenticated;
commit;
