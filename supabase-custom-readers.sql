-- ============================================================
-- القوارئ المخصّصة (رفع قارئ جديد تلقائياً إلى المكتبة) — يُنفَّذ مرة واحدة
-- إضافي بالكامل: لا يلمس reader_sync ولا أي جدول آخر.
--
-- نفس فكرة الأمان في supabase-setup.sql: RLS مفعّل بلا سياسات (لا وصول مباشر)،
-- والوصول الوحيد عبر دوال تتطلب بصمة SHA-256 لرمز المزامنة السرّي.
-- ملف القارئ يُرفع مضغوطاً (gzip→base64) على قطع صغيرة (≈1 ميجا) كي تبقى كل مكالمة
-- سريعة وتحت مهلة الاستعلام؛ وتُنشر النسخة الجديدة دفعة واحدة عند rc_commit.
-- ============================================================

create table if not exists public.reader_custom (
  code_hash  text        not null,
  reader_id  text        not null,
  meta       jsonb       not null default '{}'::jsonb,
  ver        text        not null,
  n_chunks   int         not null,
  size_bytes bigint      not null default 0,
  updated_at timestamptz not null default now(),
  primary key (code_hash, reader_id)
);

create table if not exists public.reader_custom_chunks (
  code_hash  text        not null,
  reader_id  text        not null,
  ver        text        not null,
  idx        int         not null,
  data       text        not null,
  created_at timestamptz not null default now(),
  primary key (code_hash, reader_id, ver, idx)
);

alter table public.reader_custom        enable row level security;
alter table public.reader_custom_chunks enable row level security;
revoke all on table public.reader_custom        from anon, authenticated;
revoke all on table public.reader_custom_chunks from anon, authenticated;

-- قائمة القوارئ المخصّصة لهذا الرمز (ويُنظَّف فيها ما تبقّى من رفع لم يكتمل منذ أكثر من يوم)
create or replace function public.rc_list(p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  delete from public.reader_custom_chunks c
   where c.code_hash = p_hash
     and c.created_at < now() - interval '1 day'
     and not exists (select 1 from public.reader_custom r
                      where r.code_hash = c.code_hash and r.reader_id = c.reader_id and r.ver = c.ver);
  return jsonb_build_object('ok', true, 'readers', coalesce((
    select jsonb_agg(jsonb_build_object('id', reader_id, 'meta', meta, 'ver', ver,
                                        'n', n_chunks, 'size', size_bytes, 'updated_at', updated_at)
                     order by updated_at)
    from public.reader_custom where code_hash = p_hash), '[]'::jsonb));
end;
$$;

-- رفع قطعة واحدة من النسخة p_ver
create or replace function public.rc_put_chunk(
  p_hash text, p_id text, p_ver text, p_idx int, p_data text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_hash !~ '^[0-9a-f]{64}$' or p_id !~ '^[a-z0-9_-]{1,60}$' or p_ver !~ '^[0-9a-z]{1,20}$'
     or p_idx < 0 or p_idx > 199 or p_data is null or length(p_data) > 1600000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_idx = 0 then   -- بداية رفع جديد: نمسح بقايا محاولة سابقة غير مكتملة لهذا القارئ
    delete from public.reader_custom_chunks c
     where c.code_hash = p_hash and c.reader_id = p_id and c.ver <> p_ver
       and c.ver is distinct from (select r.ver from public.reader_custom r
                                    where r.code_hash = p_hash and r.reader_id = p_id);
  end if;
  insert into public.reader_custom_chunks(code_hash, reader_id, ver, idx, data)
  values (p_hash, p_id, p_ver, p_idx, p_data)
  on conflict (code_hash, reader_id, ver, idx) do update set data = excluded.data;
  return jsonb_build_object('ok', true);
end;
$$;

-- نشر النسخة p_ver بعد اكتمال قطعها (يتحقق أن كل القطع 0..n-1 موجودة)
create or replace function public.rc_commit(
  p_hash text, p_id text, p_ver text, p_n int, p_size bigint, p_meta jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  have int;
  isnew boolean;
begin
  if p_hash !~ '^[0-9a-f]{64}$' or p_id !~ '^[a-z0-9_-]{1,60}$' or p_ver !~ '^[0-9a-z]{1,20}$'
     or p_n < 1 or p_n > 200 or p_meta is null or pg_column_size(p_meta) > 8000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select count(*) into have from public.reader_custom_chunks
   where code_hash = p_hash and reader_id = p_id and ver = p_ver and idx between 0 and p_n - 1;
  if have <> p_n then
    return jsonb_build_object('ok', false, 'error', 'incomplete', 'have', have);
  end if;
  isnew := not exists (select 1 from public.reader_custom where code_hash = p_hash and reader_id = p_id);
  if isnew and (select count(*) from public.reader_custom where code_hash = p_hash) >= 40 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into public.reader_custom(code_hash, reader_id, meta, ver, n_chunks, size_bytes, updated_at)
  values (p_hash, p_id, p_meta, p_ver, p_n, coalesce(p_size, 0), now())
  on conflict (code_hash, reader_id) do update
     set meta = excluded.meta, ver = excluded.ver, n_chunks = excluded.n_chunks,
         size_bytes = excluded.size_bytes, updated_at = now();
  delete from public.reader_custom_chunks
   where code_hash = p_hash and reader_id = p_id and ver <> p_ver;
  return jsonb_build_object('ok', true);
end;
$$;

-- قراءة عدة قطع متتالية (حتى 4 في المكالمة) من النسخة المنشورة
create or replace function public.rc_get_chunks(
  p_hash text, p_id text, p_ver text, p_from int, p_count int
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('chunks', coalesce(jsonb_agg(data order by idx), '[]'::jsonb))
  from public.reader_custom_chunks
  where code_hash = p_hash and reader_id = p_id and ver = p_ver
    and p_hash ~ '^[0-9a-f]{64}$'
    and idx >= p_from and idx < p_from + least(greatest(p_count, 1), 4);
$$;

-- إزالة قارئ مخصّص من المكتبة (سجلّه وقطعه)
create or replace function public.rc_del(p_hash text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_hash !~ '^[0-9a-f]{64}$' or p_id !~ '^[a-z0-9_-]{1,60}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  delete from public.reader_custom_chunks where code_hash = p_hash and reader_id = p_id;
  delete from public.reader_custom        where code_hash = p_hash and reader_id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.rc_list(text)                                  from public;
revoke all on function public.rc_put_chunk(text, text, text, int, text)      from public;
revoke all on function public.rc_commit(text, text, text, int, bigint, jsonb) from public;
revoke all on function public.rc_get_chunks(text, text, text, int, int)      from public;
revoke all on function public.rc_del(text, text)                             from public;
grant execute on function public.rc_list(text)                                  to anon, authenticated;
grant execute on function public.rc_put_chunk(text, text, text, int, text)      to anon, authenticated;
grant execute on function public.rc_commit(text, text, text, int, bigint, jsonb) to anon, authenticated;
grant execute on function public.rc_get_chunks(text, text, text, int, int)      to anon, authenticated;
grant execute on function public.rc_del(text, text)                             to anon, authenticated;
