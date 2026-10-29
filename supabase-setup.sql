-- ============================================================
-- إعداد المزامنة السحابية للقوارئ العشر — يُنفَّذ مرة واحدة
-- Supabase ← SQL Editor ← New query ← الصقي هذا الملف كله ← Run
--
-- فكرة الأمان: لا يوجد وصول مباشر للجدول إطلاقاً (RLS مفعّل بلا أي سياسة).
-- الوصول الوحيد عبر دالتين (rs_get / rs_put) تتطلبان بصمة (SHA-256) رمز المزامنة
-- السرّي الذي يولَّده القارئ على جهازك. من لا يملك الرمز لا يستطيع قراءة
-- بياناتك ولا تعديلها، حتى لو رأى المفتاح العام في الصفحة.
-- ============================================================

create table if not exists public.reader_sync (
  code_hash  text        not null,
  reader_key text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (code_hash, reader_key)
);

alter table public.reader_sync enable row level security;
revoke all on table public.reader_sync from anon, authenticated;

-- قراءة بيانات قارئ واحد
create or replace function public.rs_get(p_hash text, p_reader text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('payload', payload, 'updated_at', updated_at)
  from public.reader_sync
  where code_hash = p_hash and reader_key = p_reader;
$$;

-- كتابة بيانات قارئ واحد مع حماية التعارض (optimistic concurrency):
-- لا تُقبل الكتابة إلا إذا كان p_expected يطابق آخر تحديث معروف للعميل.
create or replace function public.rs_put(
  p_hash text, p_reader text, p_payload jsonb, p_expected timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur timestamptz;
  nu  timestamptz := clock_timestamp();
begin
  if length(p_hash) <> 64 or length(p_reader) > 100
     or pg_column_size(p_payload) > 4000000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select updated_at into cur
  from public.reader_sync
  where code_hash = p_hash and reader_key = p_reader
  for update;

  if not found then
    insert into public.reader_sync(code_hash, reader_key, payload, updated_at)
    values (p_hash, p_reader, p_payload, nu)
    on conflict do nothing;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;
    return jsonb_build_object('ok', true, 'updated_at', nu);
  end if;

  if p_expected is distinct from cur then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;

  update public.reader_sync
     set payload = p_payload, updated_at = nu
   where code_hash = p_hash and reader_key = p_reader;
  return jsonb_build_object('ok', true, 'updated_at', nu);
end;
$$;

revoke all on function public.rs_get(text, text) from public;
revoke all on function public.rs_put(text, text, jsonb, timestamptz) from public;
grant execute on function public.rs_get(text, text) to anon, authenticated;
grant execute on function public.rs_put(text, text, jsonb, timestamptz) to anon, authenticated;
