create or replace function public.update_workspace_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    saved_name text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 100 then
        raise exception 'Invalid display name' using errcode = '22023';
    end if;
    update public.profiles
    set display_name = btrim(p_display_name)
    where id = auth.uid()
    returning display_name into saved_name;
    if not found then
        raise exception 'Profile not found' using errcode = 'P0002';
    end if;
    return saved_name;
end;
$$;

create or replace function public.agent_referral_report(p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    result jsonb;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and role::text = 'agent'
    ) then
        raise exception 'Agent role required' using errcode = '42501';
    end if;
    if p_offset is null or p_offset < 0 then
        raise exception 'Invalid offset' using errcode = '22023';
    end if;
    select jsonb_build_object(
        'total', count(*),
        'with_submissions', count(*) filter (
            where exists (select 1 from public.submissions s where s.photographer_id = p.id)
        ),
        'with_accepted_submissions', count(*) filter (
            where exists (
                select 1 from public.submissions s
                where s.photographer_id = p.id and s.status::text = 'accepted'
            )
        )
    ) into result
    from public.profiles p
    where p.referred_by_agent = auth.uid() and p.role::text = 'photographer';

    return result || jsonb_build_object(
        'photographers', coalesce((
            select jsonb_agg(jsonb_build_object('display_name', page.display_name) order by page.id)
            from (
                select p.id, p.display_name
                from public.profiles p
                where p.referred_by_agent = auth.uid() and p.role::text = 'photographer'
                order by p.id
                offset p_offset limit 26
            ) page
        ), '[]'::jsonb)
    );
end;
$$;

create or replace function public.admin_workspace_report(p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    result jsonb;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and role::text = 'admin'
    ) then
        raise exception 'Administrator role required' using errcode = '42501';
    end if;
    if p_offset is null or p_offset < 0 then
        raise exception 'Invalid offset' using errcode = '22023';
    end if;
    select jsonb_build_object(
        'photographers', count(*) filter (where role::text = 'photographer'),
        'agents', count(*) filter (where role::text = 'agent'),
        'submissions', (select count(*) from public.submissions),
        'pending_submissions', (select count(*) from public.submissions where status::text = 'pending')
    ) into result from public.profiles;
    return result || jsonb_build_object(
        'accounts', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', page.id, 'display_name', page.display_name, 'role', page.role
            ) order by page.id)
            from (
                select p.id, p.display_name, p.role::text as role
                from public.profiles p
                where p.role::text in ('photographer', 'agent')
                order by p.id
                offset p_offset limit 26
            ) page
        ), '[]'::jsonb)
    );
end;
$$;

revoke all on function public.update_workspace_display_name(text) from public;
revoke all on function public.agent_referral_report(integer) from public;
revoke all on function public.admin_workspace_report(integer) from public;
grant execute on function public.update_workspace_display_name(text) to authenticated;
grant execute on function public.agent_referral_report(integer) to authenticated;
grant execute on function public.admin_workspace_report(integer) to authenticated;
