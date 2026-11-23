-- Anonymous access is limited to the explicitly public gallery/settings surface.
revoke all privileges on all tables in schema public from anon;
grant select on table public.gallery_publications, public.platform_public_settings, public.public_gallery_photos to anon;
revoke all privileges on all sequences in schema public from anon;

-- RLS does not protect TRUNCATE. Authenticated clients do not need these privileges.
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- Keep future objects restrictive by default for the postgres owner.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated;