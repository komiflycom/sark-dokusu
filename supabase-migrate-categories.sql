-- ============================================================================
--  ŞARK DOKUSU — Kategori tablosu migration'ı
--  ---------------------------------------------------------------------------
--  NEREDE ÇALIŞTIRILIR: Supabase Panel → SQL Editor → New query → yapıştır → Run
--
--  NEDEN: public.categories tablosu veritabanında hiç yok. admin.js ve store.js
--  bu tabloyu kullanıyor; bu yüzden "Kategori kaydedilemedi: Could not find the
--  table 'public.categories' in the schema cache" hatası alınıyor.
--  Aynı nedenle products tablosunda category_id sütunu da yok.
--
--  NE YAPAR (yalnızca EKLER, hiçbir veriyi silmez/değiştirmez):
--    1) public.categories tablosunu oluşturur (üst/alt kategori, çok dilli)
--    2) RLS'i AÇAR ve admin politikalarını tanımlar
--    3) products.category_id sütununu + FK + indeksini ekler
--    4) Mevcut serbest metin products.category değerlerini, aynı adlı
--       kategori varsa category_id'ye bağlar
--    5) PostgREST şema önbelleğini yeniler
--
--  TEKRAR ÇALIŞTIRMAK GÜVENLİDİR (idempotent).
-- ============================================================================


-- ============================================================================
-- 1) KATEGORİLER TABLOSU
-- ============================================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name_tr     text not null,
  name_en     text,
  name_ar     text,
  name_de     text,
  name_fr     text,
  parent_id   uuid references public.categories(id) on delete set null,
  slug        text,
  sort_order  integer     not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- Var olan tabloya sütun eksikse ekle (tekrar çalıştırmada zararsız)
alter table public.categories add column if not exists name_tr    text;
alter table public.categories add column if not exists name_en    text;
alter table public.categories add column if not exists name_ar    text;
alter table public.categories add column if not exists name_de    text;
alter table public.categories add column if not exists name_fr    text;
alter table public.categories add column if not exists parent_id  uuid;
alter table public.categories add column if not exists slug       text;
alter table public.categories add column if not exists sort_order integer not null default 0;
alter table public.categories add column if not exists active     boolean not null default true;
alter table public.categories add column if not exists created_at timestamptz not null default now();

create index if not exists categories_parent_idx on public.categories (parent_id);
create index if not exists categories_sort_idx   on public.categories (sort_order, created_at);


-- ============================================================================
-- 2) RLS + POLİTİKALAR  (RLS asla kapatılmaz)
-- ============================================================================
alter table public.categories enable row level security;
alter table public.categories force  row level security;

grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

-- Herkes yalnızca aktif kategorileri okur (vitrin)
drop policy if exists "sarkdokusu_categories_public_read" on public.categories;
create policy "sarkdokusu_categories_public_read"
  on public.categories for select
  to anon, authenticated
  using (active = true);

-- Yönetici pasif kategorileri de görür
drop policy if exists "sarkdokusu_categories_admin_read" on public.categories;
create policy "sarkdokusu_categories_admin_read"
  on public.categories for select
  to authenticated
  using (public.is_admin());

drop policy if exists "sarkdokusu_categories_admin_insert" on public.categories;
create policy "sarkdokusu_categories_admin_insert"
  on public.categories for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "sarkdokusu_categories_admin_update" on public.categories;
create policy "sarkdokusu_categories_admin_update"
  on public.categories for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "sarkdokusu_categories_admin_delete" on public.categories;
create policy "sarkdokusu_categories_admin_delete"
  on public.categories for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- 3) products.category_id — ürün↔kategori ilişkisi
-- ============================================================================
alter table public.products add column if not exists category_id uuid;

-- FK'yı yalnızca yoksa ekle (mevcut veriler korunur)
do $$ begin
  alter table public.products
    add constraint products_category_id_fk
    foreign key (category_id) references public.categories(id) on delete set null;
exception
  when duplicate_object then null;
  when duplicate_table  then null;
end $$;

create index if not exists products_category_idx on public.products (category_id);


-- ============================================================================
-- 4) MEVCUT VERİLERİ KORUYARAK EŞLEŞTİRME
--    Ürünlerdeki serbest metin "category" alanı olduğu gibi kalır; ayrıca
--    aynı adda bir kategori varsa category_id doldurulur. Hiçbir satır
--    silinmez, hiçbir sütun kaldırılmaz.
-- ============================================================================
update public.products p
   set category_id = c.id
  from public.categories c
 where p.category_id is null
   and p.category is not null
   and btrim(p.category) <> ''
   and lower(btrim(p.category)) = lower(btrim(c.name_tr));


-- ============================================================================
-- 5) ŞEMA ÖNBELLEĞİNİ YENİLE
--    Supabase normalde DDL'i otomatik algılar; bu satır hemen geçerli
--    olmasını garantiler.
-- ============================================================================
notify pgrst, 'reload schema';


-- ============================================================================
-- KONTROL
-- ============================================================================
-- select * from public.categories order by sort_order;
-- select count(*) from public.categories;
-- select id, name, category, category_id from public.products;
-- ============================================================================
