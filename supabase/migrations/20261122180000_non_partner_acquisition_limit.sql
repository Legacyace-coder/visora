create index if not exists acquired_photos_photographer_id_idx
    on public.acquired_photos (photographer_id);

create function public.photographer_acquisition_limit()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    acquired_count bigint;
    is_partner boolean;
begin
    if not exists (
        select 1 from public.profiles where id = auth.uid() and role::text = 'photographer'
    ) then
        raise exception 'Photographer role required' using errcode = '42501';
    end if;
    select exists (
        select 1 from public.partnership_applications
        where photographer_id = auth.uid() and status = 'approved'
    ) into is_partner;
    select count(*) into acquired_count from public.acquired_photos
    where photographer_id = auth.uid();
    return jsonb_build_object(
        'is_partner', is_partner,
        'limit', 160,
        'acquired_count', acquired_count,
        'remaining', greatest(160 - acquired_count, 0)
    );
end;
$$;

revoke all on function public.photographer_acquisition_limit() from public, anon, authenticated;
grant execute on function public.photographer_acquisition_limit() to authenticated;

create function public.enforce_non_partner_acquisition_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    acquired_count bigint;
    submission_count bigint := 0;
begin
    -- Serialize submissions and acquisitions for each photographer.
    perform pg_advisory_xact_lock(hashtextextended(new.photographer_id::text, 467821));
    if exists (
        select 1 from public.partnership_applications
        where photographer_id = new.photographer_id and status = 'approved'
    ) then
        return new;
    end if;
    select count(*) into acquired_count from public.acquired_photos
    where photographer_id = new.photographer_id;
    if tg_table_name = 'submission_items' then
        select count(*) into submission_count from public.submission_items
        where submission_id = new.submission_id;
    end if;
    if acquired_count + submission_count >= 160 then
        raise exception 'Non-partner acquisition limit reached or exceeded' using errcode = 'P1003';
    end if;
    return new;
end;
$$;

revoke all on function public.enforce_non_partner_acquisition_limit() from public, anon, authenticated;

create trigger enforce_non_partner_submission_limit
    before insert on public.submission_items
    for each row execute function public.enforce_non_partner_acquisition_limit();

create trigger enforce_non_partner_acquisition_limit
    before insert on public.acquired_photos
    for each row execute function public.enforce_non_partner_acquisition_limit();
