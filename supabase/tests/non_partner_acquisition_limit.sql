-- Run in a disposable, empty database. All changes are rolled back.
begin;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id uuid primary key, role text);
create table public.partnership_applications (photographer_id uuid, status text);
create table public.acquired_photos (photo_id uuid primary key, photographer_id uuid);
create table public.submission_items (submission_id uuid, photographer_id uuid, photo_id uuid);
insert into public.profiles values
    ('00000000-0000-0000-0000-000000000001', 'photographer'),
    ('00000000-0000-0000-0000-000000000002', 'photographer'),
    ('00000000-0000-0000-0000-000000000003', 'admin');
insert into public.acquired_photos
select md5('old-' || i)::uuid, '00000000-0000-0000-0000-000000000001'::uuid
from generate_series(1, 158) i;
insert into public.acquired_photos
select md5('existing-' || i)::uuid, '00000000-0000-0000-0000-000000000002'::uuid
from generate_series(1, 161) i;

\ir ../migrations/20261122180000_non_partner_acquisition_limit.sql

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
declare
    owner uuid := '00000000-0000-0000-0000-000000000001';
    submission uuid := '00000000-0000-0000-0000-000000000010';
    progress jsonb;
begin
    progress := public.photographer_acquisition_limit();
    if progress <> '{"is_partner":false,"limit":160,"acquired_count":158,"remaining":2}'::jsonb then
        raise exception 'Incorrect progress: %', progress;
    end if;
    insert into public.submission_items
    select submission, owner, md5('submission-' || i)::uuid from generate_series(1, 2) i;
    begin
        insert into public.submission_items
        select '00000000-0000-0000-0000-000000000011'::uuid, owner, md5('oversize-' || i)::uuid
        from generate_series(1, 3) i;
        raise exception 'Oversized submission was accepted';
    exception when sqlstate 'P1003' then
        null;
    end;
    if exists (select 1 from public.submission_items where submission_id = '00000000-0000-0000-0000-000000000011') then
        raise exception 'Oversized submission was partially saved';
    end if;
    -- Pending submissions do not reserve slots.
    insert into public.submission_items values
        ('00000000-0000-0000-0000-000000000012', owner, md5('pending')::uuid);
    begin
        insert into public.acquired_photos
        select md5('offer-over-' || i)::uuid, owner from generate_series(1, 3) i;
        raise exception 'Oversized offer was accepted';
    exception when sqlstate 'P1003' then
        null;
    end;
    if (select count(*) from public.acquired_photos where photographer_id = owner) <> 158 then
        raise exception 'Oversized offer was partially acquired';
    end if;
    insert into public.acquired_photos
    select md5('offer-' || i)::uuid, owner from generate_series(1, 2) i;
    if (public.photographer_acquisition_limit()->>'remaining')::int <> 0 then
        raise exception 'Limit was not reached';
    end if;
    begin
        insert into public.submission_items values (gen_random_uuid(), owner, gen_random_uuid());
        raise exception 'Submission at limit was accepted';
    exception when sqlstate 'P1003' then
        null;
    end;
    begin
        insert into public.acquired_photos values (gen_random_uuid(), owner);
        raise exception 'Offer at limit was accepted';
    exception when sqlstate 'P1003' then
        null;
    end;
    insert into public.partnership_applications values (owner, 'approved');
    insert into public.submission_items values (gen_random_uuid(), owner, gen_random_uuid());
    insert into public.acquired_photos values (gen_random_uuid(), owner);
    if (public.photographer_acquisition_limit()->>'is_partner')::boolean is not true then
        raise exception 'Partner status was not returned';
    end if;
end;
$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$
begin
    if public.photographer_acquisition_limit() <> '{"is_partner":false,"limit":160,"acquired_count":161,"remaining":0}'::jsonb then
        raise exception 'Existing above-limit acquisitions were not preserved';
    end if;
end;
$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$
begin
    begin
        perform public.photographer_acquisition_limit();
        raise exception 'Non-photographer can view limit';
    exception when insufficient_privilege then
        null;
    end;
    if has_function_privilege('anon', 'public.photographer_acquisition_limit()', 'execute') then
        raise exception 'Anonymous users can view limits';
    end if;
end;
$$;
rollback;
