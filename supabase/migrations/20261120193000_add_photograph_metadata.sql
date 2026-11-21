alter table public.photographer_photos
    add column if not exists capture_date date,
    add column if not exists location text,
    add column if not exists keywords text[] not null default '{}';
