alter table public.submissions
    add column if not exists photographer_feedback text
    check (photographer_feedback is null or char_length(photographer_feedback) <= 5000);

revoke select on public.submissions from public, anon, authenticated;
revoke select (reviewer_notes) on public.submissions from public, anon, authenticated;
grant select (
    id, photographer_id, submission_type, title, cover_note, status,
    submitted_at, reviewed_at, reviewed_by, created_at, updated_at,
    collection_id, photographer_feedback
) on public.submissions to anon, authenticated;

drop policy submissions_insert_own on public.submissions;
create policy submissions_insert_own on public.submissions for insert to authenticated
    with check (
        photographer_id = auth.uid()
        and status = 'pending'
        and reviewed_at is null
        and reviewed_by is null
        and reviewer_notes is null
        and photographer_feedback is null
        and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role::text = 'photographer'
        )
    );

create or replace function public.enforce_submission_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.status is distinct from old.status then
        if old.status in ('accepted', 'rejected', 'withdrawn')
           or new.status not in ('under_review', 'accepted', 'rejected', 'withdrawn') then
            raise exception 'Invalid submission status transition' using errcode = '23514';
        end if;
        if new.status = 'under_review' and old.status <> 'pending' then
            raise exception 'Invalid submission status transition' using errcode = '23514';
        end if;
        if new.status = 'rejected'
           and nullif(btrim(new.photographer_feedback), '') is null then
            raise exception 'Rejection feedback is required' using errcode = '23514';
        end if;
        if new.status in ('accepted', 'rejected') then
            new.reviewed_at := now();
            new.reviewed_by := auth.uid();
        end if;
    elsif old.status = 'rejected' and old.photographer_feedback is not null
          and nullif(btrim(new.photographer_feedback), '') is null then
        raise exception 'Rejection feedback is required' using errcode = '23514';
    end if;
    return new;
end;
$$;

create trigger enforce_submission_review
    before update on public.submissions
    for each row execute function public.enforce_submission_review();

create or replace function public.admin_submission_private_notes(p_submission_id uuid)
returns text
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
    return (select reviewer_notes from public.submissions where id = p_submission_id);
end;
$$;

revoke all on function public.admin_submission_private_notes(uuid) from public;
grant execute on function public.admin_submission_private_notes(uuid) to authenticated;

create or replace function public.review_photographer_submission(
    p_submission_id uuid,
    p_expected_status text,
    p_status text,
    p_photographer_feedback text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    reviewed_submission jsonb;
begin
    if p_expected_status is null or p_expected_status not in ('pending', 'under_review')
       or p_status is null or p_status not in ('under_review', 'accepted', 'rejected') then
        raise exception 'Invalid submission status transition' using errcode = '22023';
    end if;
    update public.submissions
    set status = p_status,
        photographer_feedback = nullif(btrim(p_photographer_feedback), '')
    where id = p_submission_id and status = p_expected_status
    returning jsonb_build_object(
        'id', id, 'photographer_id', photographer_id, 'submission_type', submission_type,
        'collection_id', collection_id, 'title', title, 'cover_note', cover_note,
        'status', status, 'submitted_at', submitted_at, 'reviewed_at', reviewed_at,
        'reviewed_by', reviewed_by, 'photographer_feedback', photographer_feedback
    ) into reviewed_submission;
    return reviewed_submission;
end;
$$;

revoke all on function public.review_photographer_submission(uuid, text, text, text) from public;
grant execute on function public.review_photographer_submission(uuid, text, text, text) to authenticated;

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
    created_id uuid;
    created_submission jsonb;
begin
    if auth.uid() is distinct from p_photographer_id then
        raise exception 'Photographer identity does not match the session' using errcode = '42501';
    end if;
    if p_submission_type is null or p_submission_type not in ('individual', 'collection') then
        raise exception 'Invalid submission type' using errcode = '22023';
    end if;
    if p_title is null or length(btrim(p_title)) = 0 then
        raise exception 'Submission title is required' using errcode = '22023';
    end if;
    if coalesce(cardinality(p_photo_ids), 0) = 0 then
        raise exception 'At least one photo is required' using errcode = '22023';
    end if;
    if cardinality(p_photo_ids) <> (
        select count(distinct photo_id) from unnest(p_photo_ids) as requested(photo_id)
    ) then
        raise exception 'Duplicate photo IDs are not allowed' using errcode = '22023';
    end if;
    if p_submission_type = 'individual' and p_collection_id is not null then
        raise exception 'Individual submissions cannot include a collection' using errcode = '22023';
    end if;
    if p_submission_type = 'collection' then
        if p_collection_id is null then
            raise exception 'Collection ID is required' using errcode = '22023';
        end if;
        if not exists (
            select 1 from public.photographer_collections c
            where c.id = p_collection_id and c.photographer_id = p_photographer_id
        ) then
            raise exception 'Collection not found' using errcode = '22023';
        end if;
    end if;
    if exists (
        select 1 from unnest(p_photo_ids) as requested(photo_id)
        left join public.photographer_photos p
          on p.id = requested.photo_id and p.photographer_id = p_photographer_id
        where p.id is null
    ) then
        raise exception 'One or more photos are not owned by the photographer' using errcode = '42501';
    end if;
    if p_submission_type = 'collection' and exists (
        select 1 from unnest(p_photo_ids) as requested(photo_id)
        left join public.collection_photos cp
          on cp.collection_id = p_collection_id
         and cp.photo_id = requested.photo_id
         and cp.photographer_id = p_photographer_id
        where cp.photo_id is null
    ) then
        raise exception 'One or more submitted photos are not in the collection' using errcode = '22023';
    end if;

    insert into public.submissions (
        photographer_id, submission_type, collection_id, title, cover_note
    )
    values (
        p_photographer_id, p_submission_type, p_collection_id,
        btrim(p_title), nullif(btrim(p_cover_note), '')
    )
    returning id, jsonb_build_object(
        'id', id, 'photographer_id', photographer_id, 'submission_type', submission_type,
        'collection_id', collection_id, 'title', title, 'cover_note', cover_note,
        'status', status, 'submitted_at', submitted_at, 'reviewed_at', reviewed_at,
        'reviewed_by', reviewed_by, 'created_at', created_at, 'updated_at', updated_at,
        'photographer_feedback', photographer_feedback
    ) into created_id, created_submission;

    insert into public.submission_items (submission_id, photo_id, photographer_id)
    select created_id, requested.photo_id, p_photographer_id
    from unnest(p_photo_ids) as requested(photo_id);

    return created_submission;
end;
$$;
