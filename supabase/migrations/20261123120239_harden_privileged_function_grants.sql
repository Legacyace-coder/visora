revoke execute on function public.get_withdrawal_settings() from public, anon;
revoke execute on function public.list_withdrawal_requests(integer) from public, anon;
revoke execute on function public.pay_withdrawal_request(uuid,text) from public, anon;
revoke execute on function public.reject_withdrawal_request(uuid,text,text) from public, anon;
revoke execute on function public.set_account_suspension(uuid,boolean,text) from public, anon;
revoke execute on function public.set_withdrawal_fee_recipient(text) from public, anon;
revoke execute on function public.prevent_suspended_profile_changes() from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;