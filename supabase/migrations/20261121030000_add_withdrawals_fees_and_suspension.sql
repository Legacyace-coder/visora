alter table public.profiles
    add column if not exists suspended_at timestamptz,
    add column if not exists suspension_reason text,
    add column if not exists suspended_by uuid references public.profiles(id) on delete restrict;

alter table public.withdrawal_requests
    add column if not exists method text,
    add column if not exists destination text,
    add column if not exists fee_status text,
    add column if not exists fee_recipient text,
    add column if not exists withdrawal_fee_cents bigint,
    add column if not exists fee_withdrawal_cents bigint,
    add column if not exists company_charge_cents bigint,
    add column if not exists fee_total_cents bigint,
    add column if not exists fee_receipt_reference text,
    add column if not exists fee_paid_at timestamptz,
    add column if not exists fee_verified_at timestamptz,
    add column if not exists fee_verified_by uuid references public.profiles(id) on delete restrict,
    add column if not exists payout_receipt_reference text,
    add column if not exists paid_at timestamptz,
    add column if not exists paid_by uuid references public.profiles(id) on delete restrict,
    add column if not exists refund_receipt_reference text,
    add column if not exists refunded_at timestamptz,
    add column if not exists refunded_by uuid references public.profiles(id) on delete restrict,
    add column if not exists reviewer_notes text,
    add column if not exists reviewed_at timestamptz,
    add column if not exists requested_at timestamptz,
    add column if not exists reviewed_by uuid references public.profiles(id) on delete restrict;

alter table public.withdrawal_requests
    alter column fee_status set default 'unpaid';

alter table public.withdrawal_requests
    add column if not exists amount_cents bigint,
    add column if not exists currency char(3);

alter table public.withdrawal_requests
    alter column requested_at set default now();

update public.withdrawal_requests
set requested_at = coalesce(requested_at, now())
where requested_at is null;

update public.withdrawal_requests
set fee_status = 'unpaid'
where fee_status is null;

alter table public.withdrawal_requests
    alter column fee_status set not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'withdrawal_requests_fee_status_check'
          and conrelid = 'public.withdrawal_requests'::regclass
    ) then
        alter table public.withdrawal_requests
            add constraint withdrawal_requests_fee_status_check
            check (fee_status in ('unpaid', 'paid', 'verified', 'refunded'));
    end if;
    if not exists (
        select 1 from pg_constraint
        where conname = 'withdrawal_requests_method_check'
          and conrelid = 'public.withdrawal_requests'::regclass
    ) then
        alter table public.withdrawal_requests
            add constraint withdrawal_requests_method_check
            check (method is null or method in ('USDT', 'bank_transfer', 'cash_delivery'));
    end if;
end $$;

create table if not exists public.platform_finance_settings (
    key text primary key,
    value text,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id) on delete restrict
);

alter table public.platform_finance_settings enable row level security;
revoke all on public.platform_finance_settings from public, anon, authenticated;

insert into public.platform_finance_settings (key, value)
values ('withdrawal_fee_recipient', null)
on conflict (key) do nothing;

create or replace function public.request_photographer_withdrawal(
    p_amount_cents bigint,
    p_method text,
    p_destination text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    request_id uuid;
    fee_withdrawal bigint;
    fee_company bigint;
    fee_total bigint;
    available bigint;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role::text = 'photographer'
          and suspended_at is null
    ) then
        raise exception 'Withdrawal unavailable for this account' using errcode = '42501';
    end if;
    if p_amount_cents is null or p_amount_cents < 1500000 then
        raise exception 'Minimum withdrawal is $15000' using errcode = '22023';
    end if;
    if p_method is null or p_method not in ('USDT', 'bank_transfer', 'cash_delivery') then
        raise exception 'Invalid withdrawal method' using errcode = '22023';
    end if;
    if p_destination is null or char_length(btrim(p_destination)) not between 1 and 1000 then
        raise exception 'Withdrawal destination is required' using errcode = '22023';
    end if;

    select available_balance_cents into available
    from public.wallet_accounts
    where photographer_id = auth.uid()
    for update;

    if available is null or available < p_amount_cents then
        raise exception 'Insufficient available wallet balance' using errcode = '22023';
    end if;
    if exists (
        select 1 from public.withdrawal_requests
        where photographer_id = auth.uid()
          and status::text in ('pending', 'approved')
    ) then
        raise exception 'An active withdrawal request already exists' using errcode = '23505';
    end if;

    if exists (
        select 1 from public.partnership_applications
        where photographer_id = auth.uid() and status = 'approved'
    ) then
        if exists (
            select 1 from public.withdrawal_requests
            where photographer_id = auth.uid()
              and fee_status = 'verified'
              and status::text = 'paid'
        ) then
            fee_withdrawal := 0;
            fee_company := 0;
        else
            fee_withdrawal := ((p_amount_cents * 15 + 5000) / 10000) * 100;
            fee_company := ((p_amount_cents * 10 + 5000) / 10000) * 100;
        end if;
    else
        fee_withdrawal := ((p_amount_cents * 15 + 5000) / 10000) * 100;
        fee_company := ((p_amount_cents * 10 + 5000) / 10000) * 100;
    end if;
    fee_total := fee_withdrawal + fee_company;

    insert into public.withdrawal_requests (
        photographer_id, amount_cents, currency, method, destination,
        fee_withdrawal_cents, withdrawal_fee_cents, company_charge_cents,
        fee_total_cents, fee_status, status
    )
    values (
        auth.uid(), p_amount_cents, 'USD', p_method, btrim(p_destination),
        fee_total, fee_withdrawal, fee_company,
        fee_total, 'unpaid', 'pending'
    )
    returning id into request_id;

    return request_id;
end;
$$;

create or replace function public.set_account_suspension(
    p_account_id uuid,
    p_suspended boolean,
    p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and role::text = 'admin'
    ) then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    if p_account_id is null or p_account_id = auth.uid()
       or not exists (
           select 1 from public.profiles
           where id = p_account_id and role::text in ('photographer', 'agent')
       ) then
        raise exception 'Invalid account' using errcode = '22023';
    end if;
    if p_suspended and (p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000) then
        raise exception 'A suspension reason is required' using errcode = '22023';
    end if;

    update public.profiles
    set suspended_at = case when p_suspended then now() else null end,
        suspension_reason = case when p_suspended then btrim(p_reason) else null end,
        suspended_by = case when p_suspended then auth.uid() else null end
    where id = p_account_id;
    return true;
end;
$$;

create or replace function public.set_withdrawal_fee_recipient(p_recipient text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and role::text = 'admin'
    ) then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    if p_recipient is null or char_length(btrim(p_recipient)) > 1000 then
        raise exception 'Invalid fee recipient' using errcode = '22023';
    end if;
    insert into public.platform_finance_settings (key, value, updated_at, updated_by)
    values ('withdrawal_fee_recipient', nullif(btrim(p_recipient), ''), now(), auth.uid())
    on conflict (key) do update
        set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
    return true;
end;
$$;

revoke all on function public.request_photographer_withdrawal(bigint, text, text) from public;
revoke all on function public.set_account_suspension(uuid, boolean, text) from public;
revoke all on function public.set_withdrawal_fee_recipient(text) from public;
grant execute on function public.request_photographer_withdrawal(bigint, text, text) to authenticated;
grant execute on function public.set_account_suspension(uuid, boolean, text) to authenticated;
grant execute on function public.set_withdrawal_fee_recipient(text) to authenticated;

create or replace function public.list_withdrawal_requests(p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_role text;
begin
    select role::text into v_role from public.profiles where id = auth.uid();
    if v_role is null or v_role not in ('photographer', 'admin') then
        raise exception 'Access denied' using errcode = '42501';
    end if;
    if p_offset is null or p_offset < 0 then
        raise exception 'Invalid offset' using errcode = '22023';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', w.id,
            'photographer_id', w.photographer_id,
            'amount_cents', w.amount_cents,
            'currency', w.currency,
            'method', w.method,
            'destination', w.destination,
            'status', w.status,
            'fee_status', w.fee_status,
            'fee_recipient', w.fee_recipient,
            'fee_receipt_reference', w.fee_receipt_reference,
            'withdrawal_fee_cents', w.withdrawal_fee_cents,
            'company_charge_cents', w.company_charge_cents,
            'fee_total_cents', w.fee_total_cents,
            'payout_receipt_reference', w.payout_receipt_reference,
            'refund_receipt_reference', w.refund_receipt_reference,
            'reviewer_notes', w.reviewer_notes,
            'requested_at', w.requested_at,
            'reviewed_at', w.reviewed_at,
            'paid_at', w.paid_at,
            'refunded_at', w.refunded_at
        ) order by w.requested_at desc, w.id desc)
        from (
            select * from public.withdrawal_requests
            where v_role = 'admin' or photographer_id = auth.uid()
            order by requested_at desc, id desc
            offset p_offset limit 26
        ) w
    ), '[]'::jsonb);
end;
$$;

create or replace function public.get_withdrawal_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_role text;
begin
    select role::text into v_role from public.profiles where id = auth.uid();
    if v_role is null or v_role not in ('photographer', 'admin') then
        raise exception 'Access denied' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'minimum_amount_cents', 1500000,
        'fee_percentage', 25,
        'withdrawal_fee_percentage', 15,
        'company_charge_percentage', 10,
        'fee_recipient', (
            select value from public.platform_finance_settings
            where key = 'withdrawal_fee_recipient'
        )
    );
end;
$$;

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
        fee_recipient = (
            select value from public.platform_finance_settings
            where key = 'withdrawal_fee_recipient'
        )
    where id = request.id;
    return true;
end;
$$;

create or replace function public.reject_withdrawal_request(
    p_request_id uuid,
    p_reason text,
    p_refund_receipt_reference text
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
    if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
        raise exception 'A rejection reason is required' using errcode = '22023';
    end if;
    if request.fee_status in ('paid', 'verified')
       and (p_refund_receipt_reference is null or char_length(btrim(p_refund_receipt_reference)) not between 1 and 1000) then
        raise exception 'A refund receipt is required for a paid fee' using errcode = '22023';
    end if;
    update public.withdrawal_requests
    set status = 'rejected',
        reviewer_notes = btrim(p_reason),
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        fee_status = case
            when request.fee_status in ('paid', 'verified') then 'refunded'
            else fee_status
        end,
        refund_receipt_reference = nullif(btrim(coalesce(p_refund_receipt_reference, '')), ''),
        refunded_at = case
            when request.fee_status in ('paid', 'verified') then now()
            else refunded_at
        end,
        refunded_by = case
            when request.fee_status in ('paid', 'verified') then auth.uid()
            else refunded_by
        end
    where id = request.id;
    return true;
end;
$$;

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
    if not found or request.status::text <> 'pending' or request.fee_status <> 'verified' then
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

revoke all on function public.list_withdrawal_requests(integer) from public;
revoke all on function public.get_withdrawal_settings() from public;
revoke all on function public.record_withdrawal_fee_payment(uuid, text, boolean) from public;
revoke all on function public.reject_withdrawal_request(uuid, text, text) from public;
revoke all on function public.pay_withdrawal_request(uuid, text) from public;
grant execute on function public.list_withdrawal_requests(integer) to authenticated;
grant execute on function public.get_withdrawal_settings() to authenticated;
grant execute on function public.record_withdrawal_fee_payment(uuid, text, boolean) to authenticated;
grant execute on function public.reject_withdrawal_request(uuid, text, text) to authenticated;
grant execute on function public.pay_withdrawal_request(uuid, text) to authenticated;

create or replace function public.admin_workspace_report(p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    result jsonb;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and role::text = 'admin'
    ) then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    if p_offset is null or p_offset < 0 then
        raise exception 'Invalid offset' using errcode = '22023';
    end if;
    select jsonb_build_object(
        'photographers', count(*) filter (where role::text = 'photographer'),
        'agents', count(*) filter (where role::text = 'agent'),
        'submissions', (select count(*) from public.submissions),
        'pending_submissions', (select count(*) from public.submissions where status::text = 'pending')
    ) into result from public.profiles;
    return result || jsonb_build_object(
        'accounts', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', page.id,
                'display_name', page.display_name,
                'role', page.role,
                'suspended_at', page.suspended_at,
                'suspension_reason', page.suspension_reason
            ) order by page.id)
            from (
                select p.id, p.display_name, p.role::text as role,
                       p.suspended_at, p.suspension_reason
                from public.profiles p
                where p.role::text in ('photographer', 'agent')
                order by p.id
                offset p_offset limit 26
            ) page
        ), '[]'::jsonb)
    );
end;
$$;

revoke all on function public.admin_workspace_report(integer) from public;
grant execute on function public.admin_workspace_report(integer) to authenticated;

create or replace function public.prevent_suspended_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if old.suspended_at is not null
       and not exists (
           select 1 from public.profiles
           where id = auth.uid() and role::text = 'admin'
       ) then
        raise exception 'Suspended accounts are read-only' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists prevent_suspended_profile_changes on public.profiles;
create trigger prevent_suspended_profile_changes
    before update on public.profiles
    for each row execute function public.prevent_suspended_profile_changes();
