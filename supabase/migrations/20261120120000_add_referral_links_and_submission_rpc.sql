alter table public.profiles
    add column if not exists referred_by uuid
        references public.profiles(id) on delete set null,
    add column if not exists referred_by_agent uuid
        references public.profiles(id) on delete set null;

create or replace function public.create_photographer_submission(
    p_photographer_id uuid,
    p_submission_type text,
    p_collection_id uuid,
    p_title text,
    p_cover_note text,
    p_photo_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    created_submission public.submissions%rowtype;
begin
    if auth.uid() is distinct from p_photographer_id then
        raise exception 'Photographer identity does not match the session'
            using errcode = '42501';
    end if;

    if p_submission_type is null
       or p_submission_type not in ('individual', 'collection') then
        raise exception 'Invalid submission type' using errcode = '22023';
    end if;

    if p_title is null or length(btrim(p_title)) = 0 then
        raise exception 'Submission title is required' using errcode = '22023';
    end if;

    if coalesce(cardinality(p_photo_ids), 0) = 0 then
        raise exception 'At least one photo is required' using errcode = '22023';
    end if;

    if cardinality(p_photo_ids) <> (
        select count(distinct photo_id)
        from unnest(p_photo_ids) as requested(photo_id)
    ) then
        raise exception 'Duplicate photo IDs are not allowed' using errcode = '22023';
    end if;

    if p_submission_type = 'individual' and p_collection_id is not null then
        raise exception 'Individual submissions cannot include a collection'
            using errcode = '22023';
    end if;

    if p_submission_type = 'collection' then
        if p_collection_id is null then
            raise exception 'Collection ID is required' using errcode = '22023';
        end if;

        if not exists (
            select 1
            from public.photographer_collections as c
            where c.id = p_collection_id
              and c.photographer_id = p_photographer_id
        ) then
            raise exception 'Collection not found' using errcode = '22023';
        end if;
    end if;

    if exists (
        select 1
        from unnest(p_photo_ids) as requested(photo_id)
        left join public.photographer_photos as p
          on p.id = requested.photo_id
         and p.photographer_id = p_photographer_id
        where p.id is null
    ) then
        raise exception 'One or more photos are not owned by the photographer'
            using errcode = '42501';
    end if;

    if p_submission_type = 'collection' and exists (
        select 1
        from unnest(p_photo_ids) as requested(photo_id)
        left join public.collection_photos as cp
          on cp.collection_id = p_collection_id
         and cp.photo_id = requested.photo_id
         and cp.photographer_id = p_photographer_id
        where cp.photo_id is null
    ) then
        raise exception 'One or more submitted photos are not in the collection'
            using errcode = '22023';
    end if;

    insert into public.submissions (
        photographer_id,
        submission_type,
        collection_id,
        title,
        cover_note
    )
    values (
        p_photographer_id,
        p_submission_type,
        p_collection_id,
        btrim(p_title),
        nullif(btrim(p_cover_note), '')
    )
    returning * into created_submission;

    insert into public.submission_items (
        submission_id,
        photo_id,
        photographer_id
    )
    select created_submission.id, requested.photo_id, p_photographer_id
    from unnest(p_photo_ids) as requested(photo_id);

    return to_jsonb(created_submission);
end;
$$;

revoke all on function public.create_photographer_submission(
    uuid, text, uuid, text, text, uuid[]
) from public;

grant execute on function public.create_photographer_submission(
    uuid, text, uuid, text, text, uuid[]
) to authenticated;
