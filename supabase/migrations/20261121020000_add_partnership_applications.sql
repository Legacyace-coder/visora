create table public.partnership_applications (
    id uuid primary key default gen_random_uuid(),
    photographer_id uuid not null references public.profiles(id) on delete restrict,
    proof_type text not null check (proof_type in ('code', 'image')),
    encrypted_proof text check (encrypted_proof is null or length(encrypted_proof) between 1 and 4000000),
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    partnership_id text unique,
    submitted_at timestamptz not null default now(),
    reviewed_at timestamptz,
    reviewed_by uuid references public.profiles(id) on delete restrict,
    review_reason text,
    proof_deleted_at timestamptz,
    proof_deleted_by uuid references public.profiles(id) on delete restrict,
    proof_deletion_reason text,
    check (
        (encrypted_proof is not null and proof_deleted_at is null and proof_deleted_by is null and proof_deletion_reason is null)
        or (encrypted_proof is null and proof_deleted_at is not null and proof_deleted_by is not null and proof_deletion_reason is not null)
    ),
    check (
        (status = 'pending' and reviewed_at is null and reviewed_by is null and partnership_id is null)
        or (status = 'approved' and reviewed_at is not null and reviewed_by is not null and partnership_id is not null)
        or (status = 'rejected' and reviewed_at is not null and reviewed_by is not null and partnership_id is null)
    )
);
create unique index partnership_one_pending on public.partnership_applications (photographer_id) where status = 'pending';
create unique index partnership_one_approved on public.partnership_applications (photographer_id) where status = 'approved';

create table public.partnership_proof_access (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null references public.partnership_applications(id) on delete restrict,
    administrator_id uuid not null references public.profiles(id) on delete restrict,
    accessed_at timestamptz not null default now()
);
alter table public.partnership_applications enable row level security;
alter table public.partnership_proof_access enable row level security;
revoke all on public.partnership_applications, public.partnership_proof_access from public, anon, authenticated;

create or replace function public.submit_partnership_application(p_proof_type text, p_encrypted_proof text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare application_id uuid;
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'photographer') then
        raise exception 'Photographer role required' using errcode = '42501';
    end if;
    if p_proof_type is null or p_proof_type not in ('code', 'image')
       or p_encrypted_proof is null or length(p_encrypted_proof) not between 1 and 4000000 then
        raise exception 'Invalid proof' using errcode = '22023';
    end if;
    perform 1 from public.profiles where id = auth.uid() for update;
    if exists (select 1 from public.partnership_applications where photographer_id = auth.uid() and status = 'approved') then
        raise exception 'Partnership already approved' using errcode = '23505';
    end if;
    insert into public.partnership_applications (photographer_id, proof_type, encrypted_proof)
    values (auth.uid(), p_proof_type, p_encrypted_proof) returning id into application_id;
    return application_id;
end;
$$;

create or replace function public.list_partnership_applications(p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text;
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
            'id', a.id, 'photographer_id', a.photographer_id, 'proof_type', a.proof_type,
            'status', a.status, 'partnership_id', a.partnership_id, 'submitted_at', a.submitted_at,
            'reviewed_at', a.reviewed_at, 'review_reason', a.review_reason,
            'proof_deleted_at', a.proof_deleted_at
        ) order by a.submitted_at desc, a.id desc)
        from (
            select * from public.partnership_applications
            where v_role = 'admin' or photographer_id = auth.uid()
            order by submitted_at desc, id desc offset p_offset limit 26
        ) a
    ), '[]'::jsonb);
end;
$$;

create or replace function public.view_partnership_proof(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare proof jsonb;
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin') then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    select jsonb_build_object('proof_type', proof_type, 'encrypted_proof', encrypted_proof, 'photographer_id', photographer_id)
    into proof from public.partnership_applications where id = p_application_id and encrypted_proof is not null;
    if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
    insert into public.partnership_proof_access (application_id, administrator_id)
    values (p_application_id, auth.uid());
    return proof;
end;
$$;

create or replace function public.review_partnership_application(
    p_application_id uuid, p_approve boolean, p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare application public.partnership_applications%rowtype;
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin') then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    if p_approve is null or length(coalesce(p_reason, '')) > 2000
       or (not p_approve and nullif(btrim(coalesce(p_reason, '')), '') is null) then
        raise exception 'Invalid decision' using errcode = '22023';
    end if;
    select * into application from public.partnership_applications where id = p_application_id;
    if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
    perform 1 from public.profiles where id = application.photographer_id for update;
    select * into application from public.partnership_applications where id = p_application_id for update;
    if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
    if application.status <> 'pending' then
        raise exception 'Application already reviewed' using errcode = '23505';
    end if;
    update public.partnership_applications set
        status = case when p_approve then 'approved' else 'rejected' end,
        partnership_id = case when p_approve then 'VP-' || upper(replace(gen_random_uuid()::text, '-', '')) else null end,
        reviewed_at = now(), reviewed_by = auth.uid(), review_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = p_application_id returning * into application;
    return jsonb_build_object('id', application.id, 'status', application.status, 'partnership_id', application.partnership_id);
end;
$$;

create or replace function public.delete_partnership_proof(p_application_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare application public.partnership_applications%rowtype;
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin') then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    if nullif(btrim(coalesce(p_reason, '')), '') is null or length(p_reason) > 2000 then
        raise exception 'Deletion reason required' using errcode = '22023';
    end if;
    select * into application from public.partnership_applications where id = p_application_id for update;
    if not found or application.encrypted_proof is null then
        raise exception 'Proof not found' using errcode = 'P0002';
    end if;
    if application.status = 'pending' then
        raise exception 'Pending proof cannot be deleted' using errcode = '23514';
    end if;
    update public.partnership_applications set
        encrypted_proof = null, proof_deleted_at = now(), proof_deleted_by = auth.uid(),
        proof_deletion_reason = btrim(p_reason)
    where id = p_application_id;
    return true;
end;
$$;

revoke all on function public.submit_partnership_application(text, text) from public;
revoke all on function public.list_partnership_applications(integer) from public;
revoke all on function public.view_partnership_proof(uuid) from public;
revoke all on function public.review_partnership_application(uuid, boolean, text) from public;
revoke all on function public.delete_partnership_proof(uuid, text) from public;
grant execute on function public.submit_partnership_application(text, text) to authenticated;
grant execute on function public.list_partnership_applications(integer) to authenticated;
grant execute on function public.view_partnership_proof(uuid) to authenticated;
grant execute on function public.review_partnership_application(uuid, boolean, text) to authenticated;
grant execute on function public.delete_partnership_proof(uuid, text) to authenticated;
