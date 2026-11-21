create or replace function public.photographer_withdrawal_fee_quote(p_amount_cents bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    exempt boolean;
    total_fee bigint;
    withdrawal_fee bigint;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and role::text = 'photographer' and suspended_at is null
    ) then
        raise exception 'Withdrawal unavailable for this account' using errcode = '42501';
    end if;
    if p_amount_cents is null or p_amount_cents < 1500000 then
        raise exception 'Minimum withdrawal is $15000' using errcode = '22023';
    end if;

    select exists (
        select 1 from public.partnership_applications
        where photographer_id = auth.uid() and status = 'approved'
    ) and exists (
        select 1 from public.withdrawal_requests
        where photographer_id = auth.uid() and fee_status = 'verified' and status::text = 'paid'
    ) into exempt;

    if exempt then
        total_fee := 0;
        withdrawal_fee := 0;
    else
        total_fee := (floor((p_amount_cents::numeric * 25 + 5000) / 10000) * 100)::bigint;
        withdrawal_fee := (floor((p_amount_cents::numeric * 15 + 5000) / 10000) * 100)::bigint;
    end if;

    return jsonb_build_object(
        'exempt', exempt,
        'fee_total_cents', total_fee::text,
        'withdrawal_fee_cents', withdrawal_fee::text,
        'company_charge_cents', (total_fee - withdrawal_fee)::text,
        'fee_recipient', (
            select value from public.platform_finance_settings
            where key = 'withdrawal_fee_recipient'
        )
    );
end;
$$;

revoke all on function public.photographer_withdrawal_fee_quote(bigint) from public, anon, authenticated;
grant execute on function public.photographer_withdrawal_fee_quote(bigint) to authenticated;

drop function public.request_photographer_withdrawal(bigint, text, text);

create function public.request_photographer_withdrawal(
    p_amount_cents bigint,
    p_method text,
    p_destination text,
    p_expected_fee_total_cents bigint,
    p_expected_withdrawal_fee_cents bigint,
    p_expected_company_charge_cents bigint,
    p_expected_fee_recipient text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    request_id uuid;
    quote jsonb;
    fee_withdrawal bigint;
    fee_company bigint;
    fee_total bigint;
    available bigint;
begin
    if p_method is null or p_method not in ('USDT', 'bank_transfer', 'cash_delivery') then
        raise exception 'Invalid withdrawal method' using errcode = '22023';
    end if;
    if p_destination is null or char_length(btrim(p_destination)) not between 1 and 1000 then
        raise exception 'Withdrawal destination is required' using errcode = '22023';
    end if;
    if p_expected_fee_total_cents is null or p_expected_fee_total_cents < 0
       or p_expected_withdrawal_fee_cents is null or p_expected_withdrawal_fee_cents < 0
       or p_expected_company_charge_cents is null or p_expected_company_charge_cents < 0 then
        raise exception 'A fee quote is required' using errcode = '22023';
    end if;

    select available_balance_cents into available
    from public.wallet_accounts
    where photographer_id = auth.uid()
    for update;

    quote := public.photographer_withdrawal_fee_quote(p_amount_cents);
    if available is null or available < p_amount_cents then
        raise exception 'Insufficient available wallet balance' using errcode = '22023';
    end if;
    if exists (
        select 1 from public.withdrawal_requests
        where photographer_id = auth.uid() and status::text in ('pending', 'approved')
    ) then
        raise exception 'An active withdrawal request already exists' using errcode = '23505';
    end if;

    fee_total := (quote->>'fee_total_cents')::bigint;
    fee_withdrawal := (quote->>'withdrawal_fee_cents')::bigint;
    fee_company := (quote->>'company_charge_cents')::bigint;
    if fee_total <> p_expected_fee_total_cents
       or fee_withdrawal <> p_expected_withdrawal_fee_cents
       or fee_company <> p_expected_company_charge_cents
       or (fee_total > 0 and quote->>'fee_recipient' is distinct from p_expected_fee_recipient) then
        raise exception 'Withdrawal fee quote changed' using errcode = 'VQ001';
    end if;
    if fee_total > 0 and nullif(btrim(quote->>'fee_recipient'), '') is null then
        raise exception 'Withdrawal fee recipient is not configured' using errcode = 'VQ002';
    end if;

    insert into public.withdrawal_requests (
        photographer_id, amount_cents, currency, method, destination,
        fee_withdrawal_cents, withdrawal_fee_cents, company_charge_cents,
        fee_total_cents, fee_status, status, fee_recipient
    )
    values (
        auth.uid(), p_amount_cents, 'USD', p_method, btrim(p_destination),
        fee_total, fee_withdrawal, fee_company,
        fee_total, 'unpaid', 'pending', case when fee_total > 0 then quote->>'fee_recipient' else null end
    )
    returning id into request_id;

    return request_id;
end;
$$;

revoke all on function public.request_photographer_withdrawal(bigint, text, text, bigint, bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.request_photographer_withdrawal(bigint, text, text, bigint, bigint, bigint, text) to authenticated;

create or replace function public.record_withdrawal_fee_payment(
    p_request_id uuid,
    p_receipt_reference text,
    p_verified boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    request public.withdrawal_requests%rowtype;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and role::text = 'admin'
    ) then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    select * into request from public.withdrawal_requests where id = p_request_id for update;
    if not found or request.status::text <> 'pending' then
        raise exception 'Withdrawal is not pending' using errcode = '23505';
    end if;
    if p_receipt_reference is null or char_length(btrim(p_receipt_reference)) not between 1 and 1000 then
        raise exception 'Fee receipt reference is required' using errcode = '22023';
    end if;
    update public.withdrawal_requests
    set fee_receipt_reference = btrim(p_receipt_reference),
        fee_paid_at = coalesce(fee_paid_at, now()),
        fee_status = case when p_verified then 'verified' else 'paid' end,
        fee_verified_at = case when p_verified then now() else fee_verified_at end,
        fee_verified_by = case when p_verified then auth.uid() else fee_verified_by end,
        fee_recipient = coalesce(request.fee_recipient, (
            select value from public.platform_finance_settings where key = 'withdrawal_fee_recipient'
        ))
    where id = request.id;
    return true;
end;
$$;

revoke all on function public.record_withdrawal_fee_payment(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.record_withdrawal_fee_payment(uuid, text, boolean) to authenticated;

create or replace function public.pay_withdrawal_request(
    p_request_id uuid,
    p_payout_receipt_reference text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    request public.withdrawal_requests%rowtype;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and role::text = 'admin'
    ) then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    select * into request from public.withdrawal_requests where id = p_request_id for update;
    if not found or request.status::text <> 'pending'
       or (request.fee_status <> 'verified' and request.fee_total_cents is distinct from 0) then
        raise exception 'Withdrawal fee must be verified and the request pending' using errcode = '23505';
    end if;
    if p_payout_receipt_reference is null or char_length(btrim(p_payout_receipt_reference)) not between 1 and 1000 then
        raise exception 'Payout receipt reference is required' using errcode = '22023';
    end if;
    update public.wallet_accounts
    set available_balance_cents = available_balance_cents - request.amount_cents,
        updated_at = now()
    where photographer_id = request.photographer_id
      and available_balance_cents >= request.amount_cents;
    if not found then
        raise exception 'Insufficient available wallet balance' using errcode = '23514';
    end if;
    update public.withdrawal_requests
    set status = 'paid',
        payout_receipt_reference = btrim(p_payout_receipt_reference),
        paid_at = now(),
        paid_by = auth.uid(),
        reviewed_at = coalesce(reviewed_at, now()),
        reviewed_by = coalesce(reviewed_by, auth.uid())
    where id = request.id;
    return true;
end;
$$;
