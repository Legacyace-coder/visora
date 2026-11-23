-- Run in a disposable, empty database.
begin;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id uuid primary key, role text, display_name text);
create table public.partnership_applications (photographer_id uuid, status text, reviewed_at timestamptz, partnership_id text);
create table public.submissions (id uuid, photographer_id uuid, status text, reviewed_at timestamptz);
create table public.submission_items (submission_id uuid, photographer_id uuid, photo_id uuid);
\ir ../migrations/20261123120000_partnership_reporting_and_agreements.sql

insert into public.profiles values
    ('00000000-0000-0000-0000-000000000001', 'photographer', 'Jane'),
    ('00000000-0000-0000-0000-000000000002', 'admin', 'Admin');
insert into public.partnership_applications values
    ('00000000-0000-0000-0000-000000000001', 'approved', now() - interval '1 day', 'VP-1');
insert into public.submissions values
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'accepted', now()),
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'accepted', now()),
    ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'pending', null);
insert into public.submission_items values
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021'),
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021'),
    ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000022');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$
declare first_id uuid; second_id uuid; report jsonb;
begin
    first_id := public.upload_agreement_document('partnership', encode(convert_to('%PDF-first', 'UTF8'), 'base64'));
    second_id := public.upload_agreement_document('partnership', encode(convert_to('%PDF-second', 'UTF8'), 'base64'));
    if first_id = second_id or public.get_agreement_document('partnership', first_id)->>'base64' <> encode(convert_to('%PDF-first', 'UTF8'), 'base64') then
        raise exception 'Agreement versions were not retained';
    end if;
    if public.get_agreement_document('partnership')->>'id' <> second_id::text then
        raise exception 'Latest agreement was not returned';
    end if;
    report := public.admin_partner_weekly_progress(0);
    if jsonb_array_length(report) <> 1 or (report->0->>'approved_count')::int <> 1 then
        raise exception 'Incorrect progress: %', report;
    end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
begin
    begin
        perform public.admin_partner_weekly_progress(0);
        raise exception 'Photographer accessed admin report';
    exception when insufficient_privilege then null;
    end;
    begin
        perform public.upload_agreement_document('partnership', encode(convert_to('%PDF-test', 'UTF8'), 'base64'));
        raise exception 'Photographer uploaded an agreement';
    exception when insufficient_privilege then null;
    end;
    if public.get_agreement_document('partnership') is null then raise exception 'Agreement unavailable'; end if;
    if has_function_privilege('anon', 'public.get_agreement_document(text, uuid)', 'execute') then
        raise exception 'Anonymous document access allowed';
    end if;
end $$;
rollback;
