create table public.workspace_profile_photos (
    profile_id uuid primary key references public.profiles(id) on delete cascade,
    mime_type text not null,
    content bytea not null,
    updated_at timestamptz not null default now()
);

alter table public.workspace_profile_photos enable row level security;
revoke all on public.workspace_profile_photos from public, anon, authenticated;

create or replace function public.set_workspace_profile_photo(p_mime_type text, p_base64 text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    image bytea;
begin
    if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_base64 is null or length(p_base64) > 2796204 then
        raise exception 'Invalid photo' using errcode = '22023';
    end if;
    image := decode(p_base64, 'base64');
    if octet_length(image) > 2097152 or not (
        (p_mime_type = 'image/jpeg' and substring(image from 1 for 3) = decode('ffd8ff', 'hex'))
        or (p_mime_type = 'image/png' and substring(image from 1 for 8) = decode('89504e470d0a1a0a', 'hex'))
        or (p_mime_type = 'image/webp' and substring(image from 1 for 4) = decode('52494646', 'hex')
            and substring(image from 9 for 4) = decode('57454250', 'hex'))
    ) then
        raise exception 'Invalid photo' using errcode = '22023';
    end if;
    insert into public.workspace_profile_photos (profile_id, mime_type, content)
    values (auth.uid(), p_mime_type, image)
    on conflict (profile_id) do update
    set mime_type = excluded.mime_type, content = excluded.content, updated_at = now();
    return true;
end;
$$;

create or replace function public.get_workspace_profile_photo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    return (
        select jsonb_build_object('mime_type', mime_type, 'base64', encode(content, 'base64'))
        from public.workspace_profile_photos
        where profile_id = auth.uid()
    );
end;
$$;

create or replace function public.delete_workspace_profile_photo()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    delete from public.workspace_profile_photos where profile_id = auth.uid();
    return found;
end;
$$;

revoke all on function public.set_workspace_profile_photo(text, text) from public;
revoke all on function public.get_workspace_profile_photo() from public;
revoke all on function public.delete_workspace_profile_photo() from public;
grant execute on function public.set_workspace_profile_photo(text, text) to authenticated;
grant execute on function public.get_workspace_profile_photo() to authenticated;
grant execute on function public.delete_workspace_profile_photo() to authenticated;
