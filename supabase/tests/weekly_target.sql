-- Run with psql in a disposable, empty database. All changes are rolled back.
begin;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id uuid primary key, role text not null);
create table public.partnership_applications (photographer_id uuid, status text, reviewed_at timestamptz);
create table public.submissions (id uuid primary key, photographer_id uuid, status text, reviewed_at timestamptz);
create table public.submission_items (submission_id uuid, photographer_id uuid, photo_id uuid);

\ir ../migrations/20261121170000_add_partner_weekly_target.sql

set local time zone 'America/New_York';
insert into public.profiles values
    ('00000000-0000-0000-0000-000000000001', 'photographer'),
    ('00000000-0000-0000-0000-000000000002', 'photographer'),
    ('00000000-0000-0000-0000-000000000003', 'agent');
insert into public.partnership_applications
select '00000000-0000-0000-0000-000000000001', 'approved',
       (date_trunc('week', now() at time zone 'UTC') - interval '7 days') at time zone 'UTC';

insert into public.submissions (id, photographer_id, status, reviewed_at)
select ('10000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000001',
       case n when 5 then 'rejected' when 6 then 'pending' else 'accepted' end,
       (date_trunc('week', now() at time zone 'UTC')
        + case n when 1 then interval '1 second'
                 when 2 then interval '2 seconds'
                 when 3 then interval '-2 days'
                 when 4 then interval '-8 days'
                 when 8 then interval '7 days'
                 else interval '0 seconds' end) at time zone 'UTC'
from generate_series(1, 8) n;

insert into public.submission_items (submission_id, photographer_id, photo_id)
select ('10000000-0000-0000-0000-' || lpad(submission::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000001',
       ('20000000-0000-0000-0000-' || lpad(photo::text, 12, '0'))::uuid
from (values (1, 1), (2, 1), (2, 2), (3, 2), (2, 3), (4, 3),
             (5, 4), (6, 5), (7, 6), (8, 7)) items(submission, photo);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
declare result jsonb;
begin
    result := public.photographer_weekly_target();
    if result->>'is_partner' <> 'true' or (result->>'target')::int <> 200
       or (result->>'approved_count')::int <> 2 then
        raise exception 'Incorrect distinct first approvals or boundaries: %', result;
    end if;
    if (result->>'week_start')::timestamptz <>
       (date_trunc('week', now() at time zone 'UTC') at time zone 'UTC')
       or (result->>'week_end')::timestamptz - (result->>'week_start')::timestamptz <> interval '168 hours' then
        raise exception 'Week must run Monday to Monday in UTC: %', result;
    end if;
end;
$$;

insert into public.submission_items (submission_id, photographer_id, photo_id)
select '10000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000001',
       ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
from generate_series(1000, 1200) n;
do $$
begin
    if (public.photographer_weekly_target()->>'approved_count')::int <> 203 then
        raise exception 'Approved counts must not be capped at the target';
    end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$
begin
    if public.photographer_weekly_target() <> '{"is_partner": false}'::jsonb then
        raise exception 'Non-partners must not receive progress';
    end if;
end;
$$;

insert into public.partnership_applications
select '00000000-0000-0000-0000-000000000002', 'approved',
       (date_trunc('week', now() at time zone 'UTC') + interval '10 seconds') at time zone 'UTC';
insert into public.submissions (id, photographer_id, status, reviewed_at)
select ('30000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000002', 'accepted',
       (date_trunc('week', now() at time zone 'UTC')
        + case n when 1 then interval '5 seconds' else interval '20 seconds' end) at time zone 'UTC'
from generate_series(1, 2) n;
insert into public.submission_items values
    ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001'),
    ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001'),
    ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003');
do $$
begin
    if (public.photographer_weekly_target()->>'approved_count')::int <> 1 then
        raise exception 'Only own photos first approved after partnership should count';
    end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$
begin
    begin
        perform public.photographer_weekly_target();
        raise exception 'Non-photographer was allowed to read target';
    exception when insufficient_privilege then
        null;
    end;
    if has_function_privilege('anon', 'public.photographer_weekly_target()', 'execute') then
        raise exception 'Anonymous users must not have execute access';
    end if;
end;
$$;
rollback;
