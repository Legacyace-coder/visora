-- Run in a disposable, empty database.
begin;
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users (id uuid primary key, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
create table public.profiles (id uuid primary key, role text, display_name text, agent_code text, suspended_at timestamptz);
create table public.workspace_profile_photos (profile_id uuid primary key, mime_type text, content bytea);
insert into public.profiles values
    ('00000000-0000-0000-0000-000000000001', 'agent', 'Active agent', 'A-ABC-12345', null),
    ('00000000-0000-0000-0000-000000000002', 'agent', 'Suspended agent', 'A-DEF-12345', now()),
    ('00000000-0000-0000-0000-000000000003', 'photographer', 'Photographer', 'A-GHI-12345', null);
insert into public.workspace_profile_photos values
    ('00000000-0000-0000-0000-000000000001', 'image/png', decode('89504e470d0a1a0a', 'hex'));
\ir ../migrations/20261123130000_public_agent_verification.sql
do $$
declare result jsonb;
begin
    result := public.lookup_public_agent('A-ABC-12345');
    if result->>'display_name' <> 'Active agent' or result->>'active' <> 'true'
       or result->'photo'->>'mime_type' <> 'image/png' then
        raise exception 'Incorrect agent result: %', result;
    end if;
    if public.lookup_public_agent('A-DEF-12345')->>'active' <> 'false' then
        raise exception 'Suspension not reflected';
    end if;
    if public.lookup_public_agent('A-GHI-12345') is not null or public.lookup_public_agent('A-ABC-12346') is not null
       or public.lookup_public_agent('A-ABC-%') is not null then
        raise exception 'Non-agent or invalid code matched';
    end if;
    if has_function_privilege('anon', 'public.lookup_public_agent(text)', 'execute')
       or has_function_privilege('authenticated', 'public.lookup_public_agent(text)', 'execute')
       or has_function_privilege('authenticated', 'public.enforce_admin_agent_creation()', 'execute')
       or not has_function_privilege('service_role', 'public.lookup_public_agent(text)', 'execute') then
        raise exception 'Incorrect function privileges';
    end if;
end $$;
insert into auth.users values
    ('00000000-0000-0000-0000-000000000004', '{"visora_admin_agent": true}', '{}'),
    ('00000000-0000-0000-0000-000000000005', '{}', '{"visora_admin_agent": true}');
insert into public.profiles values
    ('00000000-0000-0000-0000-000000000004', 'agent', 'Duplicate', 'A-ABC-12345', null);
do $$
begin
    begin
        perform public.lookup_public_agent('A-ABC-12345');
        raise exception 'Ambiguous code returned a result';
    exception when cardinality_violation then null;
    end;
end $$;
do $$
begin
    begin
        insert into public.profiles values ('00000000-0000-0000-0000-000000000005', 'agent', 'Unauthorized', 'A-JKL-12345', null);
        raise exception 'Unapproved agent created';
    exception when insufficient_privilege then null;
    end;
    begin
        update public.profiles set role = 'agent' where id = '00000000-0000-0000-0000-000000000003';
        raise exception 'Unapproved agent role assigned';
    exception when insufficient_privilege then null;
    end;
end $$;
rollback;
