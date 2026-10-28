
create or replace function public.server_record_webhook_event(
  p_provider_code text, p_event_id text, p_event_type text, p_payload jsonb, p_signature_verified boolean)
returns table (event_row_id uuid, is_duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.webhook_events (provider_code, event_id, event_type, payload, signature_verified)
  values (p_provider_code, p_event_id, p_event_type, p_payload, coalesce(p_signature_verified, false))
  on conflict (provider_code, event_id) do nothing returning id into v_id;
  if v_id is null then
    select w.id into v_id from public.webhook_events w
     where w.provider_code = p_provider_code and w.event_id = p_event_id;
    return query select v_id, true;
    return;
  end if;
  return query select v_id, false;
end; $$;
revoke all on function public.server_record_webhook_event(text,text,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.server_record_webhook_event(text,text,text,jsonb,boolean) to service_role;
