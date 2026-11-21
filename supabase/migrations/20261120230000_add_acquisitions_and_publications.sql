create table public.acquisition_offers (
    id uuid primary key default gen_random_uuid(),
    submission_id uuid not null references public.submissions(id) on delete restrict,
    photographer_id uuid not null references public.profiles(id) on delete restrict,
    offered_by uuid not null references public.profiles(id) on delete restrict,
    amount_cents bigint not null check (amount_cents > 0),
    currency char(3) not null default 'USD' check (currency = 'USD'),
    rights_type text not null check (rights_type in ('license', 'assignment')),
    exclusive boolean not null,
    territory text not null check (char_length(territory) <= 500 and territory ~ '[^[:space:]]'),
    permitted_uses text not null check (char_length(permitted_uses) <= 5000 and permitted_uses ~ '[^[:space:]]'),
    attribution text not null check (char_length(attribution) <= 500 and attribution ~ '[^[:space:]]'),
    agreement_terms text not null check (char_length(agreement_terms) <= 10000 and agreement_terms ~ '[^[:space:]]'),
    expires_on date,
    gallery_permission boolean not null,
    gallery_terms text not null,
    consent_statement text not null default 'I confirm that I own or am authorized to grant the stated rights, and I have read and agree to the offer terms, gallery permission, and compensation shown.',
    status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
    created_at timestamptz not null default now(),
    responded_at timestamptz,
    responded_by uuid references public.profiles(id) on delete restrict,
    unique (id, photographer_id)
);

create table public.acquisition_offer_photos (
    offer_id uuid not null,
    photographer_id uuid not null,
    photo_id uuid not null,
    photo_title text not null,
    primary key (offer_id, photo_id),
    foreign key (offer_id, photographer_id) references public.acquisition_offers(id, photographer_id) on delete restrict,
    foreign key (photo_id, photographer_id) references public.photographer_photos(id, photographer_id) on delete restrict
);

create table public.acquired_photos (
    photo_id uuid primary key,
    offer_id uuid not null,
    photographer_id uuid not null,
    acquired_at timestamptz not null default now(),
    unique (offer_id, photo_id),
    foreign key (offer_id, photo_id) references public.acquisition_offer_photos(offer_id, photo_id) on delete restrict,
    foreign key (offer_id, photographer_id) references public.acquisition_offers(id, photographer_id) on delete restrict
);

create table public.wallet_acquisition_credits (
    offer_id uuid primary key,
    photographer_id uuid not null,
    amount_cents bigint not null check (amount_cents > 0),
    credited_at timestamptz not null default now(),
    foreign key (offer_id, photographer_id) references public.acquisition_offers(id, photographer_id) on delete restrict
);

create table public.gallery_publications (
    id uuid primary key default gen_random_uuid(),
    offer_id uuid not null,
    photo_id uuid not null,
    photographer_id uuid not null,
    title text not null,
    attribution text not null,
    expires_on date,
    published_at timestamptz not null default now(),
    published_by uuid not null references public.profiles(id) on delete restrict,
    unpublished_at timestamptz,
    unpublished_by uuid references public.profiles(id) on delete restrict,
    foreign key (offer_id, photo_id) references public.acquired_photos(offer_id, photo_id) on delete restrict,
    foreign key (offer_id, photographer_id) references public.acquisition_offers(id, photographer_id) on delete restrict
);

create unique index gallery_one_active_publication_per_photo
    on public.gallery_publications(photo_id) where unpublished_at is null;

alter table public.acquisition_offers enable row level security;
alter table public.acquisition_offer_photos enable row level security;
alter table public.acquired_photos enable row level security;
alter table public.wallet_acquisition_credits enable row level security;
alter table public.gallery_publications enable row level security;

create policy acquisition_offers_read on public.acquisition_offers for select to authenticated
    using (photographer_id = auth.uid() or private.is_admin());
create policy acquisition_offer_photos_read on public.acquisition_offer_photos for select to authenticated
    using (photographer_id = auth.uid() or private.is_admin());
create policy acquired_photos_read on public.acquired_photos for select to authenticated
    using (photographer_id = auth.uid() or private.is_admin());
create policy wallet_acquisition_credits_read on public.wallet_acquisition_credits for select to authenticated
    using (photographer_id = auth.uid() or private.is_admin());
create policy gallery_publications_read on public.gallery_publications for select to anon, authenticated
    using (
        (unpublished_at is null and (expires_on is null or expires_on >= (now() at time zone 'UTC')::date))
    );
create policy gallery_publications_read_history on public.gallery_publications for select to authenticated
    using (photographer_id = auth.uid() or private.is_admin());

revoke all on public.acquisition_offers, public.acquisition_offer_photos, public.acquired_photos,
    public.wallet_acquisition_credits, public.gallery_publications from public, anon, authenticated;
grant select on public.acquisition_offers, public.acquisition_offer_photos, public.acquired_photos,
    public.wallet_acquisition_credits to authenticated;
grant select on public.gallery_publications to anon, authenticated;

create or replace function public.protect_photograph_original()
returns trigger language plpgsql set search_path = '' as $$
begin
    if new.storage_path is distinct from old.storage_path
       or new.mime_type is distinct from old.mime_type then
        raise exception 'Photograph originals cannot be replaced' using errcode = '23514';
    end if;
    return new;
end;
$$;

create trigger protect_photograph_original
    before update of storage_path, mime_type on public.photographer_photos
    for each row execute function public.protect_photograph_original();

drop policy if exists photographer_originals_delete_own on storage.objects;
create policy photographer_originals_delete_own on storage.objects for delete to authenticated
    using (
        bucket_id = 'photographer-originals'
        and (storage.foldername(name))[1] = auth.uid()::text
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role::text = 'photographer'
        )
        and not exists (
            select 1 from public.photographer_photos p
            where p.photographer_id = auth.uid() and p.storage_path = storage.objects.name
        )
    );

create or replace function public.acquisition_originals_available(p_photo_ids uuid[], p_owner_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
    select not exists (
        select 1 from unnest(p_photo_ids) as requested(photo_id)
        left join public.photographer_photos p
          on p.id = requested.photo_id and p.photographer_id = p_owner_id
        left join storage.objects obj
          on obj.bucket_id = 'photographer-originals' and obj.name = p.storage_path
        where p.id is null or split_part(p.storage_path, '/', 1) is distinct from p_owner_id::text
           or obj.name is null
    );
$$;
revoke all on function public.acquisition_originals_available(uuid[], uuid) from public, anon, authenticated;

create or replace function public.list_acquisition_offers(p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'submission_id', o.submission_id, 'photographer_id', o.photographer_id,
        'amount_cents', o.amount_cents::text, 'currency', o.currency,
        'rights_type', o.rights_type, 'exclusive', o.exclusive, 'territory', o.territory,
        'permitted_uses', o.permitted_uses, 'attribution', o.attribution,
        'agreement_terms', o.agreement_terms, 'expires_on', o.expires_on,
        'gallery_permission', o.gallery_permission, 'gallery_terms', o.gallery_terms,
        'consent_statement', o.consent_statement, 'status', o.status,
        'created_at', o.created_at, 'responded_at', o.responded_at,
        'photos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', op.photo_id, 'title', op.photo_title
            ) order by op.photo_id)
            from public.acquisition_offer_photos op
            where op.offer_id = o.id
        ), '[]'::jsonb)
    ) order by o.created_at desc, o.id desc), '[]'::jsonb)
    from (
        select id, submission_id, photographer_id, amount_cents, currency, rights_type, exclusive,
            territory, permitted_uses, attribution, agreement_terms, expires_on, gallery_permission, gallery_terms, consent_statement,
            status, created_at, responded_at
        from public.acquisition_offers
        order by created_at desc, id desc
        limit 26 offset greatest(p_offset, 0)
    ) o;
$$;

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
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin') then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    select photographer_id into owner_id from public.submissions
    where id = p_submission_id and status = 'accepted';
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

create or replace function public.respond_to_acquisition_offer(
    p_offer_id uuid,
    p_accept boolean,
    p_confirm_terms boolean
)
returns text language plpgsql security definer set search_path = '' as $$
declare
    offer public.acquisition_offers%rowtype;
    offered_photo_ids uuid[];
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'photographer') then
        raise exception 'Photographer role required' using errcode = '42501';
    end if;
    select * into offer from public.acquisition_offers
    where id = p_offer_id and photographer_id = auth.uid() for update;
    if not found then
        raise exception 'Offer not found' using errcode = 'P0002';
    end if;
    if offer.status <> 'pending' then
        raise exception 'Offer is no longer pending' using errcode = '23505';
    end if;
    if p_accept is null then
        raise exception 'Response is required' using errcode = '22023';
    end if;
    if not p_accept then
        update public.acquisition_offers set status = 'declined', responded_at = now(), responded_by = auth.uid()
        where id = offer.id;
        return 'declined';
    end if;
    if p_confirm_terms is not true then
        raise exception 'Agreement confirmation is required' using errcode = '22023';
    end if;
    if offer.expires_on is not null and offer.expires_on < (now() at time zone 'UTC')::date then
        raise exception 'The agreement has expired' using errcode = '22023';
    end if;
    select array_agg(photo_id order by photo_id) into offered_photo_ids
    from public.acquisition_offer_photos where offer_id = offer.id;
    if coalesce(cardinality(offered_photo_ids), 0) = 0
       or not public.acquisition_originals_available(offered_photo_ids, offer.photographer_id) then
        raise exception 'Photograph original is unavailable' using errcode = 'P1001';
    end if;
    insert into public.acquired_photos (offer_id, photographer_id, photo_id)
    select offer.id, offer.photographer_id, photo_id from unnest(offered_photo_ids) as photo_id;
    insert into public.wallet_acquisition_credits (offer_id, photographer_id, amount_cents)
    values (offer.id, offer.photographer_id, offer.amount_cents);
    insert into public.wallet_accounts (photographer_id, currency, available_balance_cents, pending_balance_cents)
    values (offer.photographer_id, 'USD', offer.amount_cents, 0)
    on conflict (photographer_id) do update
        set available_balance_cents = public.wallet_accounts.available_balance_cents + excluded.available_balance_cents,
            updated_at = now();
    update public.acquisition_offers set status = 'accepted', responded_at = now(), responded_by = auth.uid()
    where id = offer.id;
    return 'accepted';
end;
$$;

create or replace function public.cancel_acquisition_offer(p_offer_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin') then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    update public.acquisition_offers set status = 'cancelled', responded_at = now(), responded_by = auth.uid()
    where id = p_offer_id and status = 'pending';
    return found;
end;
$$;

create or replace function public.publish_acquired_photo(p_offer_id uuid, p_photo_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    publication_id uuid;
    offer public.acquisition_offers%rowtype;
    photo_title text;
    photo_path text;
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin') then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    select * into offer from public.acquisition_offers
    where id = p_offer_id and status = 'accepted' and gallery_permission
      and (expires_on is null or expires_on >= (now() at time zone 'UTC')::date);
    if not found or not exists (
        select 1 from public.acquired_photos
        where offer_id = p_offer_id and photo_id = p_photo_id
    ) then
        raise exception 'An active accepted agreement with gallery permission is required' using errcode = '22023';
    end if;
    select coalesce(nullif(btrim(title), ''), original_filename), storage_path into photo_title, photo_path
    from public.photographer_photos where id = p_photo_id and photographer_id = offer.photographer_id;
    if photo_title is null then
        raise exception 'Photograph not found' using errcode = 'P0002';
    end if;
    if photo_path is null or split_part(photo_path, '/', 1) <> offer.photographer_id::text
       or not exists (
           select 1 from storage.objects
           where bucket_id = 'photographer-originals' and name = photo_path
       ) then
        raise exception 'Photograph original is unavailable' using errcode = 'P1001';
    end if;
    insert into public.gallery_publications (
        offer_id, photo_id, photographer_id, title, attribution, expires_on, published_by
    ) values (
        p_offer_id, p_photo_id, offer.photographer_id, photo_title, offer.attribution, offer.expires_on, auth.uid()
    ) returning id into publication_id;
    return publication_id;
end;
$$;

create or replace function public.unpublish_gallery_photo(p_publication_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin') then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    update public.gallery_publications set unpublished_at = now(), unpublished_by = auth.uid()
    where id = p_publication_id and unpublished_at is null;
    return found;
end;
$$;

revoke all on function public.create_acquisition_offer(uuid, uuid[], bigint, text, boolean, text, text, text, text, date, boolean) from public;
revoke all on function public.list_acquisition_offers(integer) from public;
revoke all on function public.respond_to_acquisition_offer(uuid, boolean, boolean) from public;
revoke all on function public.cancel_acquisition_offer(uuid) from public;
revoke all on function public.publish_acquired_photo(uuid, uuid) from public;
revoke all on function public.unpublish_gallery_photo(uuid) from public;
grant execute on function public.create_acquisition_offer(uuid, uuid[], bigint, text, boolean, text, text, text, text, date, boolean) to authenticated;
grant execute on function public.list_acquisition_offers(integer) to authenticated;
grant execute on function public.respond_to_acquisition_offer(uuid, boolean, boolean) to authenticated;
grant execute on function public.cancel_acquisition_offer(uuid) to authenticated;
grant execute on function public.publish_acquired_photo(uuid, uuid) to authenticated;
grant execute on function public.unpublish_gallery_photo(uuid) to authenticated;
