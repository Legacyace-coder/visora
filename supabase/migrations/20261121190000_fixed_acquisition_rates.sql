create function public.acquisition_offer_quote(p_submission_id uuid, p_photo_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    owner_id uuid;
    partner_since timestamptz;
    partner_count bigint;
    photo_count bigint;
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin') then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    select photographer_id into owner_id from public.submissions
    where id = p_submission_id and status::text = 'accepted';
    if owner_id is null then
        raise exception 'Accepted submission not found' using errcode = '22023';
    end if;
    if coalesce(cardinality(p_photo_ids), 0) = 0 or cardinality(p_photo_ids) > 100
       or cardinality(p_photo_ids) <> (select count(distinct photo_id) from unnest(p_photo_ids) as r(photo_id))
       or exists (
           select 1 from unnest(p_photo_ids) as r(photo_id)
           where not exists (
               select 1 from public.submission_items i
               where i.submission_id = p_submission_id and i.photo_id = r.photo_id and i.photographer_id = owner_id
           )
       ) then
        raise exception 'Select up to 100 distinct photographs from the submission' using errcode = '22023';
    end if;
    select reviewed_at into partner_since from public.partnership_applications
    where photographer_id = owner_id and status = 'approved';

    select count(*), count(*) filter (where first_approved_at >= partner_since)
    into photo_count, partner_count
    from (
        select i.photo_id, min(s.reviewed_at) as first_approved_at
        from public.submission_items i
        join public.submissions s on s.id = i.submission_id and s.photographer_id = i.photographer_id
        where i.photographer_id = owner_id and i.photo_id = any(p_photo_ids)
          and s.status::text = 'accepted' and s.reviewed_at is not null
        group by i.photo_id
    ) approvals;
    if photo_count <> cardinality(p_photo_ids) then
        raise exception 'Photograph approval date is unavailable' using errcode = '22023';
    end if;

    return jsonb_build_object(
        'amount_cents', (partner_count * 12000 + (photo_count - partner_count) * 10000)::text,
        'partner_count', partner_count,
        'non_partner_count', photo_count - partner_count
    );
end;
$$;

revoke all on function public.acquisition_offer_quote(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.acquisition_offer_quote(uuid, uuid[]) to authenticated;

create or replace function public.create_acquisition_offer(
    p_submission_id uuid,
    p_photo_ids uuid[],
    p_amount_cents bigint,
    p_rights_type text,
    p_exclusive boolean,
    p_territory text,
    p_permitted_uses text,
    p_attribution text,
    p_agreement_terms text,
    p_expires_on date,
    p_gallery_permission boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    owner_id uuid;
    offer_id uuid;
    quote jsonb;
begin
    quote := public.acquisition_offer_quote(p_submission_id, p_photo_ids);
    if p_amount_cents is distinct from (quote->>'amount_cents')::bigint then
        raise exception 'Acquisition offer quote changed' using errcode = 'P1002';
    end if;
    select photographer_id into owner_id from public.submissions
    where id = p_submission_id and status = 'accepted';
    if exists (select 1 from public.acquired_photos where photo_id = any(p_photo_ids)) then
        raise exception 'A selected photograph already has an accepted acquisition' using errcode = '23505';
    end if;
    if not public.acquisition_originals_available(p_photo_ids, owner_id) then
        raise exception 'Photograph original is unavailable' using errcode = 'P1001';
    end if;
    if p_expires_on is not null and p_expires_on < (now() at time zone 'UTC')::date then
        raise exception 'The agreement has already expired' using errcode = '22023';
    end if;
    insert into public.acquisition_offers (
        submission_id, photographer_id, offered_by, amount_cents, rights_type, exclusive,
        territory, permitted_uses, attribution, agreement_terms, expires_on, gallery_permission, gallery_terms
    ) values (
        p_submission_id, owner_id, auth.uid(), p_amount_cents, p_rights_type, p_exclusive,
        btrim(p_territory), btrim(p_permitted_uses), btrim(p_attribution), btrim(p_agreement_terms),
        p_expires_on, p_gallery_permission,
        case when p_gallery_permission then
            'Permission granted to publish the original photographs worldwide in the public Visora gallery, where visitors can view and download them. Saved copies may remain after removal. Permission lasts until the agreement expires or publication is withdrawn.'
        else
            'No permission is granted to publish the photographs in the public Visora gallery.'
        end
    ) returning id into offer_id;
    insert into public.acquisition_offer_photos (offer_id, photographer_id, photo_id, photo_title)
    select offer_id, owner_id, p.id, coalesce(nullif(btrim(p.title), ''), p.original_filename)
    from public.photographer_photos p where p.id = any(p_photo_ids) and p.photographer_id = owner_id;
    return offer_id;
end;
$$;
