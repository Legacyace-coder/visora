create or replace function public.photographer_weekly_target()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    partner_since timestamptz;
    week_start timestamptz := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
    week_end timestamptz := (date_trunc('week', now() at time zone 'UTC') + interval '7 days') at time zone 'UTC';
    approved_count bigint;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and role::text = 'photographer'
    ) then
        raise exception 'Photographer role required' using errcode = '42501';
    end if;

    select reviewed_at into partner_since
    from public.partnership_applications
    where photographer_id = auth.uid() and status = 'approved';

    if partner_since is null then
        return jsonb_build_object('is_partner', false);
    end if;

    select count(*) into approved_count
    from (
        select i.photo_id, min(s.reviewed_at) as first_approved_at
        from public.submission_items i
        join public.submissions s
          on s.id = i.submission_id
         and s.photographer_id = i.photographer_id
        where i.photographer_id = auth.uid()
          and s.status::text = 'accepted'
          and s.reviewed_at is not null
        group by i.photo_id
    ) first_approvals
    where first_approved_at >= partner_since
      and first_approved_at >= week_start
      and first_approved_at < week_end;

    return jsonb_build_object(
        'is_partner', true,
        'target', 200,
        'approved_count', approved_count,
        'week_start', week_start,
        'week_end', week_end
    );
end;
$$;

revoke all on function public.photographer_weekly_target() from public, anon, authenticated;
grant execute on function public.photographer_weekly_target() to authenticated;
