-- Run with psql in a disposable, empty database. All changes are rolled back.
begin;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id uuid primary key, role text, suspended_at timestamptz);
create table public.partnership_applications (photographer_id uuid, status text);
create table public.platform_finance_settings (key text primary key, value text);
create table public.wallet_accounts (photographer_id uuid, available_balance_cents bigint, updated_at timestamptz);
create table public.withdrawal_requests (
    id uuid primary key default gen_random_uuid(), photographer_id uuid, amount_cents bigint,
    currency text, method text, destination text, fee_withdrawal_cents bigint,
    withdrawal_fee_cents bigint, company_charge_cents bigint, fee_total_cents bigint,
    fee_status text, status text, payout_receipt_reference text, paid_at timestamptz,
    paid_by uuid, reviewed_at timestamptz, reviewed_by uuid, fee_recipient text,
    fee_receipt_reference text, fee_paid_at timestamptz, fee_verified_at timestamptz, fee_verified_by uuid
);
create function public.request_photographer_withdrawal(bigint, text, text)
returns uuid language sql as $$ select null::uuid $$;
create function public.pay_withdrawal_request(uuid, text)
returns boolean language sql as $$ select false $$;
grant execute on function public.pay_withdrawal_request(uuid, text) to authenticated;

\ir ../migrations/20261121180000_correct_withdrawal_fee_quotes.sql

insert into public.profiles values
    ('00000000-0000-0000-0000-000000000001', 'photographer', null),
    ('00000000-0000-0000-0000-000000000002', 'admin', null);
insert into public.wallet_accounts values
    ('00000000-0000-0000-0000-000000000001', 10000000, now());
insert into public.platform_finance_settings values ('withdrawal_fee_recipient', 'Example recipient');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
declare quote jsonb;
begin
    quote := public.photographer_withdrawal_fee_quote(1500200);
    if quote <> '{"exempt":false,"fee_total_cents":"375100","withdrawal_fee_cents":"225000","company_charge_cents":"150100","fee_recipient":"Example recipient"}'::jsonb then
        raise exception 'Incorrect combined rounding: %', quote;
    end if;
    quote := public.photographer_withdrawal_fee_quote(9223372036854775807);
    if (quote->>'fee_total_cents')::bigint <>
       (quote->>'withdrawal_fee_cents')::bigint + (quote->>'company_charge_cents')::bigint then
        raise exception 'Large fee calculation failed: %', quote;
    end if;
    begin
        perform public.request_photographer_withdrawal(1500200, 'USDT', 'test', 375000, 225000, 150000, 'Example recipient');
        raise exception 'Stale quote was accepted';
    exception when sqlstate 'VQ001' then
        null;
    end;
    begin
        perform public.request_photographer_withdrawal(1500200, 'USDT', 'test', 375100, 225100, 150000, 'Example recipient');
        raise exception 'Changed fee split was accepted';
    exception when sqlstate 'VQ001' then
        null;
    end;
    if exists (select 1 from public.withdrawal_requests) then
        raise exception 'A stale quote created a withdrawal';
    end if;
    update public.platform_finance_settings set value = '' where key = 'withdrawal_fee_recipient';
    begin
        perform public.request_photographer_withdrawal(1500200, 'USDT', 'test', 375100, 225000, 150100, '');
        raise exception 'Missing recipient was accepted';
    exception when sqlstate 'VQ002' then
        null;
    end;
    update public.platform_finance_settings set value = 'Example recipient' where key = 'withdrawal_fee_recipient';
    begin
        perform public.request_photographer_withdrawal(1500200, 'USDT', 'test', 375100, 225000, 150100, 'Old recipient');
        raise exception 'Changed recipient was accepted';
    exception when sqlstate 'VQ001' then
        null;
    end;
    perform public.request_photographer_withdrawal(1500200, 'USDT', 'test', 375100, 225000, 150100, 'Example recipient');
    if not exists (
        select 1 from public.withdrawal_requests where fee_total_cents = 375100
        and withdrawal_fee_cents = 225000 and company_charge_cents = 150100
    ) then
        raise exception 'The confirmed fee was not stored';
    end if;
end;
$$;

update public.platform_finance_settings set value = 'New recipient' where key = 'withdrawal_fee_recipient';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$
declare request_id uuid;
begin
    select id into request_id from public.withdrawal_requests where status = 'pending';
    perform public.record_withdrawal_fee_payment(request_id, 'fee-test', true);
    if not exists (select 1 from public.withdrawal_requests where id = request_id and fee_recipient = 'Example recipient') then
        raise exception 'Changing settings changed the quoted recipient';
    end if;
end;
$$;
update public.withdrawal_requests set status = 'paid';
insert into public.partnership_applications values
    ('00000000-0000-0000-0000-000000000001', 'approved');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
declare quote jsonb;
begin
    quote := public.photographer_withdrawal_fee_quote(1500200);
    if quote <> '{"exempt":true,"fee_total_cents":"0","withdrawal_fee_cents":"0","company_charge_cents":"0","fee_recipient":"New recipient"}'::jsonb then
        raise exception 'Partner exemption was not applied: %', quote;
    end if;
    perform public.request_photographer_withdrawal(1500200, 'USDT', 'test', 0, 0, 0, null);
end;
$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$
declare request_id uuid;
begin
    select id into request_id from public.withdrawal_requests where status = 'pending';
    perform public.pay_withdrawal_request(request_id, 'payout-test');
    if not exists (select 1 from public.withdrawal_requests where id = request_id and status = 'paid') then
        raise exception 'An exempt withdrawal required a fictitious fee receipt';
    end if;
    begin
        perform public.photographer_withdrawal_fee_quote(1500200);
        raise exception 'Non-photographer was allowed to quote';
    exception when insufficient_privilege then
        null;
    end;
    if has_function_privilege('anon', 'public.photographer_withdrawal_fee_quote(bigint)', 'execute') then
        raise exception 'Anonymous users can access fee quotes';
    end if;
end;
$$;
rollback;
