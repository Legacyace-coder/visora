create function public.enforce_admin_agent_creation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.role::text = 'agent'
       and (tg_op = 'INSERT' or old.role is distinct from new.role)
       and not exists (
           select 1 from auth.users u
           where u.id = new.id and u.raw_app_meta_data->>'visora_admin_agent' = 'true'
       ) then
        raise exception 'Agent accounts must be created by an administrator' using errcode = '42501';
    end if;
    return new;
end;
$$;

revoke all on function public.enforce_admin_agent_creation() from public, anon, authenticated;

create trigger enforce_admin_agent_creation
    before insert or update of role on public.profiles
    for each row execute function public.enforce_admin_agent_creation();

create function public.lookup_public_agent(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
    select (select jsonb_build_object(
        'display_name', p.display_name,
        'active', p.suspended_at is null,
        'photo', case when photo.profile_id is null then null else
            jsonb_build_object('mime_type', photo.mime_type, 'base64', encode(photo.content, 'base64'))
        end
    )
    from public.profiles p
    left join public.workspace_profile_photos photo on photo.profile_id = p.id
    where p.role::text = 'agent' and p.agent_code = p_code
      and p_code ~ '^A-[A-Z0-9]{3}-[A-Z0-9]{5}$');
$$;

revoke all on function public.lookup_public_agent(text) from public, anon, authenticated;
grant execute on function public.lookup_public_agent(text) to service_role;
