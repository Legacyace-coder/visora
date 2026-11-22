-- Run with psql in a disposable, empty database. All changes are rolled back.
begin;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id uuid primary key, role text);
create table public.submissions (id uuid primary key, photographer_id uuid, status text, reviewed_at timestamptz);
create table public.submission_items (submission_id uuid, photographer_id uuid, photo_id uuid);
create table public.partnership_applications (photographer_id uuid, status text, reviewed_at timestamptz);
create table public.photographer_photos (id uuid primary key, photographer_id uuid, title text, original_filename text);
create table public.acquired_photos (photo_id uuid);
create table public.acquisition_offers (
    id uuid primary key default gen_random_uuid(), submission_id uuid, photographer_id uuid, offered_by uuid,
    amount_cents bigint, rights_type text, exclusive boolean, territory text, permitted_uses text,
    attribution text, agreement_terms text, expires_on date, gallery_permission boolean, gallery_terms text
);
create table public.acquisition_offer_photos (offer_id uuid, photographer_id uuid, photo_id uuid, photo_title text);
create function public.acquisition_originals_available(uuid[], uuid) returns boolean language sql as $$ select true $$;

\ir ../migrations/20261121190000_fixed_acquisition_rates.sql

insert into public.profiles values
    ('00000000-0000-0000-0000-000000000001', 'photographer'),
    ('00000000-0000-0000-0000-000000000002', 'admin');
insert into public.submissions values
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'accepted', '2026-01-01'),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'accepted', '2026-01-03');
insert into public.photographer_photos values
    ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'First', 'first.jpg'),
    ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'Second', 'second.jpg');
insert into public.submission_items values
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020'),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020'),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021');
insert into public.acquisition_offers (id, amount_cents) values ('00000000-0000-0000-0000-000000000030', 12345);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$
declare
    photos uuid[] := array['00000000-0000-0000-0000-000000000020'::uuid, '00000000-0000-0000-0000-000000000021'::uuid];
    submission uuid := '00000000-0000-0000-0000-000000000011';
    quote jsonb;
    created_offer_id uuid;
begin
    quote := public.acquisition_offer_quote(submission, photos);
    if quote <> '{"amount_cents":"20000","partner_count":0,"non_partner_count":2}'::jsonb then
        raise exception 'Incorrect non-partner quote: %', quote;
    end if;
    insert into public.partnership_applications values ('00000000-0000-0000-0000-000000000001', 'approved', '2026-01-02');
    quote := public.acquisition_offer_quote(submission, photos);
    if quote <> '{"amount_cents":"22000","partner_count":1,"non_partner_count":1}'::jsonb then
        raise exception 'Incorrect mixed quote: %', quote;
    end if;
    begin
        perform public.create_acquisition_offer(submission, photos, 20000, 'license', false, 'Worldwide', 'Display', 'Name', 'Terms', null, false);
        raise exception 'Incorrect offer amount was accepted';
    exception when sqlstate 'P1002' then
        null;
    end;
    created_offer_id := public.create_acquisition_offer(submission, photos, 22000, 'license', false, 'Worldwide', 'Display', 'Name', 'Terms', null, false);
    if not exists (select 1 from public.acquisition_offers where id = created_offer_id and amount_cents = 22000)
       or (select count(*) from public.acquisition_offer_photos where offer_id = created_offer_id) <> 2 then
        raise exception 'Quoted offer was not saved correctly';
    end if;
    if not exists (select 1 from public.acquisition_offers where id = '00000000-0000-0000-0000-000000000030' and amount_cents = 12345) then
        raise exception 'Existing offer was changed';
    end if;
    begin
        perform public.acquisition_offer_quote(submission, array[photos[1], photos[1]]);
        raise exception 'Duplicate photos were accepted';
    exception when sqlstate '22023' then
        null;
    end;
end;
$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
begin
    begin
        perform public.acquisition_offer_quote('00000000-0000-0000-0000-000000000011', array['00000000-0000-0000-0000-000000000020'::uuid]);
        raise exception 'Non-admin was allowed to quote';
    exception when insufficient_privilege then
        null;
    end;
    if has_function_privilege('anon', 'public.acquisition_offer_quote(uuid, uuid[])', 'execute') then
        raise exception 'Anonymous users can quote offers';
    end if;
end;
$$;
rollback;
