create table if not exists public.photograph_deletion_queue (
    photo_id uuid primary key,
    photographer_id uuid not null references public.profiles(id) on delete cascade,
    storage_path text not null,
    created_at timestamptz not null default now()
);

alter table public.photograph_deletion_queue enable row level security;

create policy photograph_deletion_queue_select_own
    on public.photograph_deletion_queue for select to authenticated
    using (photographer_id = auth.uid());

create policy photograph_deletion_queue_delete_own
    on public.photograph_deletion_queue for delete to authenticated
    using (photographer_id = auth.uid());

grant select, delete on public.photograph_deletion_queue to authenticated;

create or replace function public.delete_photographer_photo(
    p_photo_id uuid,
    p_photographer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    deleted_path text;
begin
    if auth.uid() is distinct from p_photographer_id then
        raise exception 'Photographer identity does not match the session'
            using errcode = '42501';
    end if;

    if not exists (
        select 1 from public.profiles
        where id = p_photographer_id and role::text = 'photographer'
    ) then
        raise exception 'Photographer role required' using errcode = '42501';
    end if;

    delete from public.photographer_photos
    where id = p_photo_id and photographer_id = p_photographer_id
    returning storage_path into deleted_path;

    if not found then
        return false;
    end if;

    if split_part(deleted_path, '/', 1) is distinct from p_photographer_id::text then
        raise exception 'Invalid photograph storage path' using errcode = '22023';
    end if;

    insert into public.photograph_deletion_queue (photo_id, photographer_id, storage_path)
    values (p_photo_id, p_photographer_id, deleted_path);
    return true;
end;
$$;

revoke all on function public.delete_photographer_photo(uuid, uuid) from public;
grant execute on function public.delete_photographer_photo(uuid, uuid) to authenticated;
