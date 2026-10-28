
create or replace function public.reconcile_account_balances()
returns table (account_id uuid, stored_balance numeric, ledger_balance numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and not public.has_staff_role(array['finance']) then
    raise exception 'Forbidden';
  end if;
  return query
  select a.id, a.balance, s.total
  from public.accounts a
  cross join lateral (
    select coalesce(sum(case l.direction when 'credit' then l.amount else -l.amount end), 0) as total
    from public.ledger_entries l where l.account_id = a.id) s
  where a.balance <> s.total;
end; $$;
revoke all on function public.reconcile_account_balances() from public, anon;
grant execute on function public.reconcile_account_balances() to authenticated, service_role;
