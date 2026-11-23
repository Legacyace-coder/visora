create table public.agreement_documents (
    id uuid primary key default gen_random_uuid(),
    version_number bigint generated always as identity unique,
    kind text not null check (kind in ('partnership', 'acquisition')),
    content bytea not null check (octet_length(content) between 1 and 2097152),
    uploaded_at timestamptz not null default now(),
    uploaded_by uuid not null references public.profiles(id)
);

alter table public.agreement_documents enable row level security;
revoke all on public.agreement_documents from public, anon, authenticated;

create function public.upload_agreement_document(p_kind text, p_base64 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    content bytea;
    document_id uuid;
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin') then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    if p_kind is null or p_kind not in ('partnership', 'acquisition')
       or p_base64 is null or length(p_base64) > 2796204 then
        raise exception 'Invalid document' using errcode = '22023';
    end if;
    content := decode(p_base64, 'base64');
    if octet_length(content) not between 1 and 2097152
       or substring(content from 1 for 5) <> convert_to('%PDF-', 'UTF8') then
        raise exception 'Invalid PDF' using errcode = '22023';
    end if;
    insert into public.agreement_documents (kind, content, uploaded_by)
    values (p_kind, content, auth.uid()) returning id into document_id;
    return document_id;
end;
$$;

create function public.get_agreement_document(p_kind text, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    document public.agreement_documents%rowtype;
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'photographer')) then
        raise exception 'Access denied' using errcode = '42501';
    end if;
    if p_kind is null or p_kind not in ('partnership', 'acquisition') then
        raise exception 'Invalid document type' using errcode = '22023';
    end if;
    select * into document from public.agreement_documents
    where kind = p_kind and (p_id is null or id = p_id)
    order by version_number desc limit 1;
    if not found then return null; end if;
    return jsonb_build_object('id', document.id, 'uploaded_at', document.uploaded_at,
                              'base64', encode(document.content, 'base64'));
end;
$$;

revoke all on function public.upload_agreement_document(text, text) from public, anon, authenticated;
revoke all on function public.get_agreement_document(text, uuid) from public, anon, authenticated;
grant execute on function public.upload_agreement_document(text, text) to authenticated;
grant execute on function public.get_agreement_document(text, uuid) to authenticated;

create function public.admin_partner_weekly_progress(p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    week_start timestamptz := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
    week_end timestamptz := (date_trunc('week', now() at time zone 'UTC') + interval '7 days') at time zone 'UTC';
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin') then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    if p_offset is null or p_offset < 0 then
        raise exception 'Invalid offset' using errcode = '22023';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'photographer_id', partner.photographer_id, 'display_name', partner.display_name,
            'partnership_id', partner.partnership_id, 'target', 200,
            'approved_count', partner.approved_count, 'week_start', week_start, 'week_end', week_end
        ) order by partner.photographer_id)
        from (
            select a.photographer_id, p.display_name, a.partnership_id,
                (select count(*) from (
                    select i.photo_id, min(s.reviewed_at) as first_approval
                    from public.submission_items i
                    join public.submissions s on s.id = i.submission_id and s.photographer_id = i.photographer_id
                    where i.photographer_id = a.photographer_id
                      and s.status::text = 'accepted' and s.reviewed_at is not null
                    group by i.photo_id
                ) approvals where first_approval >= a.reviewed_at
                    and first_approval >= week_start and first_approval < week_end) as approved_count
            from public.partnership_applications a
            join public.profiles p on p.id = a.photographer_id
            where a.status = 'approved'
            order by a.photographer_id offset p_offset limit 26
        ) partner
    ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_partner_weekly_progress(integer) from public, anon, authenticated;
grant execute on function public.admin_partner_weekly_progress(integer) to authenticated;
