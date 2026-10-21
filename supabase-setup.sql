-- ============================================================================
--  ŞARK DOKUSU — Supabase Kurulum SQL'i  (v2 — kategoriler eklendi)
--  ---------------------------------------------------------------------------
--  NEREDE ÇALIŞTIRILIR: Supabase Panel → SQL Editor → New query → yapıştır → Run
--
--  BU DOSYA NE YAPAR
--    1) public.products tablosunu (yoksa) oluşturur
--       + dile göre ad/açıklama sütunları (name_tr … name_fr / desc_tr … desc_fr)
--    2) public.admins tablosunu ve is_admin() fonksiyonunu oluşturur
--    3) products üzerinde RLS'i AÇAR ve politikaları tanımlar
--    4) product-images storage bucket'ını ve politikalarını oluşturur
--    5) public.site_settings tablosunu (banner, logo, iletişim, SEO) oluşturur
--    6) site-assets storage bucket'ını ve politikalarını oluşturur
--    7) public.categories tablosunu (üst/alt kategori, çok dilli) oluşturur
--    8) products.category_id sütununu categories tablosuna bağlar
--
--  GÜVENLİK İLKELERİ
--    • RLS hiçbir yerde kapatılmaz.
--    • Herkes SADECE aktif ürünleri okuyabilir.
--    • Yazma/silme/yükleme SADECE admins tablosundaki kullanıcıya açıktır.
--    • Yalnızca bu dosyanın oluşturduğu isimli politikalar yeniden
--      tanımlanır (drop policy if exists). Başka politikalarınız varsa
--      etkilenmez.
--
--  TEKRAR ÇALIŞTIRMAK GÜVENLİDİR (idempotent).
-- ============================================================================


-- ============================================================================
-- 1) ÜRÜNLER TABLOSU
-- ============================================================================
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  price       numeric(10,2) not null default 0 check (price >= 0),
  category    text,
  category_id uuid,
  image_url   text,
  stock       integer     check (stock is null or stock >= 0),
  active      boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);

-- Var olan tabloya sütun eksikse ekle
alter table public.products add column if not exists description text;
alter table public.products add column if not exists price       numeric(10,2) not null default 0;
alter table public.products add column if not exists category    text;
alter table public.products add column if not exists category_id uuid;
alter table public.products add column if not exists image_url   text;
alter table public.products add column if not exists stock       integer;
alter table public.products add column if not exists active      boolean not null default true;
alter table public.products add column if not exists sort_order  integer not null default 0;
alter table public.products add column if not exists created_at  timestamptz not null default now();

-- --- Dile göre ad / açıklama -------------------------------------------------
alter table public.products add column if not exists name_tr text;
alter table public.products add column if not exists name_en text;
alter table public.products add column if not exists name_ar text;
alter table public.products add column if not exists name_de text;
alter table public.products add column if not exists name_fr text;
alter table public.products add column if not exists desc_tr text;
alter table public.products add column if not exists desc_en text;
alter table public.products add column if not exists desc_ar text;
alter table public.products add column if not exists desc_de text;
alter table public.products add column if not exists desc_fr text;

-- Mevcut ürünleri tek seferlik doldur
update public.products
   set name_tr = coalesce(name_tr, name),
       desc_tr = coalesce(desc_tr, description)
 where name_tr is null or desc_tr is null;

-- Listelemeyi hızlandıran indeks
create index if not exists products_active_created_idx
  on public.products (active, created_at desc);


-- ============================================================================
-- 2) YÖNETİCİLER
-- ============================================================================
create table if not exists public.admins (
  user_id    uuid primary key,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Proje sahibinin yönetici hesabı
insert into public.admins (user_id, note)
values ('e07e349e-4bc0-4fcf-8af5-61bc1eace27b', 'Şark Dokusu yönetici')
on conflict (user_id) do nothing;


-- ============================================================================
-- 3) is_admin() — yetki kontrolünün TEK kaynağı
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;


-- ============================================================================
-- 4) products — RLS VE POLİTİKALAR
-- ============================================================================
alter table public.products enable row level security;
alter table public.products force row level security;

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

drop policy if exists "sarkdokusu_products_public_read" on public.products;
create policy "sarkdokusu_products_public_read"
  on public.products for select to anon, authenticated
  using (active = true);

drop policy if exists "sarkdokusu_products_admin_read" on public.products;
create policy "sarkdokusu_products_admin_read"
  on public.products for select to authenticated
  using (public.is_admin());

drop policy if exists "sarkdokusu_products_admin_insert" on public.products;
create policy "sarkdokusu_products_admin_insert"
  on public.products for insert to authenticated
  with check (public.is_admin());

drop policy if exists "sarkdokusu_products_admin_update" on public.products;
create policy "sarkdokusu_products_admin_update"
  on public.products for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sarkdokusu_products_admin_delete" on public.products;
create policy "sarkdokusu_products_admin_delete"
  on public.products for delete to authenticated
  using (public.is_admin());


-- ============================================================================
-- 5) STORAGE — product-images bucket (KORUMAL)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images',false,3145728,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public=false, file_size_limit=3145728,
      allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "sarkdokusu_storage_public_read"  on storage.objects;
drop policy if exists "sarkdokusu_storage_admin_read"   on storage.objects;
create policy "sarkdokusu_storage_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id='product-images' and public.is_admin());

drop policy if exists "sarkdokusu_storage_admin_insert" on storage.objects;
create policy "sarkdokusu_storage_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id='product-images' and public.is_admin());

drop policy if exists "sarkdokusu_storage_admin_update" on storage.objects;
create policy "sarkdokusu_storage_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id='product-images' and public.is_admin())
  with check (bucket_id='product-images' and public.is_admin());

drop policy if exists "sarkdokusu_storage_admin_delete" on storage.objects;
create policy "sarkdokusu_storage_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id='product-images' and public.is_admin());


-- ============================================================================
-- 6) SİTE AYARLARI
-- ============================================================================
create table if not exists public.site_settings (
  id              integer primary key default 1 check (id = 1),
  store_name      text,
  logo_url        text,
  banner_url      text,
  banner_link     text,
  banner_text     jsonb not null default '{}'::jsonb,
  banner_active   boolean not null default false,
  address         text,
  phone           text,
  whatsapp        text,
  email           text,
  instagram       text,
  facebook        text,
  youtube         text,
  about_items     jsonb not null default '[]'::jsonb,
  seo_title       jsonb not null default '{}'::jsonb,
  seo_description jsonb not null default '{}'::jsonb,
  seo_keywords    text,
  og_image_url    text,
  updated_at      timestamptz not null default now()
);

alter table public.site_settings add column if not exists store_name      text;
alter table public.site_settings add column if not exists logo_url        text;
alter table public.site_settings add column if not exists banner_url      text;
alter table public.site_settings add column if not exists banner_link     text;
alter table public.site_settings add column if not exists banner_text     jsonb not null default '{}'::jsonb;
alter table public.site_settings add column if not exists banner_active   boolean not null default false;
alter table public.site_settings add column if not exists address         text;
alter table public.site_settings add column if not exists phone           text;
alter table public.site_settings add column if not exists whatsapp        text;
alter table public.site_settings add column if not exists email           text;
alter table public.site_settings add column if not exists instagram       text;
alter table public.site_settings add column if not exists facebook        text;
alter table public.site_settings add column if not exists youtube        text;
alter table public.site_settings add column if not exists about_items     jsonb not null default '[]'::jsonb;
alter table public.site_settings add column if not exists seo_title       jsonb not null default '{}'::jsonb;
alter table public.site_settings add column if not exists seo_description jsonb not null default '{}'::jsonb;
alter table public.site_settings add column if not exists seo_keywords    text;
alter table public.site_settings add column if not exists og_image_url    text;
alter table public.site_settings add column if not exists updated_at      timestamptz not null default now();

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;
alter table public.site_settings force row level security;

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

drop policy if exists "sarkdokusu_settings_public_read" on public.site_settings;
create policy "sarkdokusu_settings_public_read"
  on public.site_settings for select to anon, authenticated
  using (id = 1);

drop policy if exists "sarkdokusu_settings_admin_insert" on public.site_settings;
create policy "sarkdokusu_settings_admin_insert"
  on public.site_settings for insert to authenticated
  with check (public.is_admin() and id = 1);

drop policy if exists "sarkdokusu_settings_admin_update" on public.site_settings;
create policy "sarkdokusu_settings_admin_update"
  on public.site_settings for update to authenticated
  using (public.is_admin() and id = 1) with check (public.is_admin() and id = 1);


-- ============================================================================
-- 7) STORAGE — site-assets bucket (logo, banner, OG görseli)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets','site-assets',true,5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public=true, file_size_limit=5242880,
      allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "sarkdokusu_assets_public_read"   on storage.objects;
create policy "sarkdokusu_assets_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id='site-assets');

drop policy if exists "sarkdokusu_assets_admin_insert"  on storage.objects;
create policy "sarkdokusu_assets_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id='site-assets' and public.is_admin());

drop policy if exists "sarkdokusu_assets_admin_update"  on storage.objects;
create policy "sarkdokusu_assets_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id='site-assets' and public.is_admin())
  with check (bucket_id='site-assets' and public.is_admin());

drop policy if exists "sarkdokusu_assets_admin_delete"  on storage.objects;
create policy "sarkdokusu_assets_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id='site-assets' and public.is_admin());


-- ============================================================================
-- 8) KATEGORİLER TABLOSU (üst/alt hiyerarşi, çok dilli)
-- ============================================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name_tr     text not null,
  name_en     text,
  name_ar     text,
  name_de     text,
  name_fr     text,
  parent_id   uuid references public.categories(id) on delete set null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.categories add column if not exists name_tr     text;
alter table public.categories add column if not exists name_en     text;
alter table public.categories add column if not exists name_ar     text;
alter table public.categories add column if not exists name_de     text;
alter table public.categories add column if not exists name_fr     text;
alter table public.categories add column if not exists parent_id   uuid;
alter table public.categories add column if not exists sort_order  integer not null default 0;
alter table public.categories add column if not exists active      boolean not null default true;
alter table public.categories add column if not exists created_at  timestamptz not null default now();

-- products.category_id -> categories.id (opsiyonel FK, var olmayanı atla)
do $$ begin
  alter table public.products
    add constraint products_category_id_fk
    foreign key (category_id) references public.categories(id) on delete set null;
exception when duplicate_object then null; end $$;

-- İndeks
create index if not exists categories_parent_idx on public.categories (parent_id);
create index if not exists categories_sort_idx   on public.categories (sort_order);

-- RLS
alter table public.categories enable row level security;
alter table public.categories force row level security;

grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

drop policy if exists "sarkdokusu_cats_public_read" on public.categories;
create policy "sarkdokusu_cats_public_read"
  on public.categories for select to anon, authenticated
  using (active = true);

drop policy if exists "sarkdokusu_cats_admin_read" on public.categories;
create policy "sarkdokusu_cats_admin_read"
  on public.categories for select to authenticated
  using (public.is_admin());

drop policy if exists "sarkdokusu_cats_admin_insert" on public.categories;
create policy "sarkdokusu_cats_admin_insert"
  on public.categories for insert to authenticated
  with check (public.is_admin());

drop policy if exists "sarkdokusu_cats_admin_update" on public.categories;
create policy "sarkdokusu_cats_admin_update"
  on public.categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sarkdokusu_cats_admin_delete" on public.categories;
create policy "sarkdokusu_cats_admin_delete"
  on public.categories for delete to authenticated
  using (public.is_admin());


-- ============================================================================
-- 9) KATEGORİLER (hiyerarşik — üst/alt kategori)
-- ============================================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories(id) on delete set null,
  name_tr     text not null,
  name_en     text,
  name_ar     text,
  name_de     text,
  name_fr     text,
  slug        text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.categories add column if not exists parent_id  uuid references public.categories(id) on delete set null;
alter table public.categories add column if not exists name_en    text;
alter table public.categories add column if not exists name_ar    text;
alter table public.categories add column if not exists name_de    text;
alter table public.categories add column if not exists name_fr    text;
alter table public.categories add column if not exists slug       text;
alter table public.categories add column if not exists sort_order integer not null default 0;
alter table public.categories add column if not exists active     boolean not null default true;
alter table public.categories add column if not exists created_at timestamptz not null default now();

create index if not exists categories_parent_idx on public.categories (parent_id);
create index if not exists categories_sort_idx   on public.categories (sort_order, created_at);

alter table public.categories enable row level security;
alter table public.categories force row level security;

grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

drop policy if exists "sarkdokusu_categories_public_read" on public.categories;
create policy "sarkdokusu_categories_public_read"
  on public.categories for select
  to anon, authenticated
  using (active = true);

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
-- 10) products.category_id — kategori ilişkisi
-- ============================================================================
alter table public.products add column if not exists category_id uuid references public.categories(id) on delete set null;

create index if not exists products_category_idx on public.products (category_id);

-- Mevcut ürünleri, eski serbest metin category alanından category_id ile eşleştir
update public.products p
   set category_id = c.id
  from public.categories c
 where p.category_id is null
   and p.category is not null
   and lower(coalesce(p.category, '')) = lower(coalesce(c.name_tr, ''));


-- ============================================================================
-- 11) site_settings.banner_active — banner açık/kapalı bayrağı
-- ============================================================================
alter table public.site_settings add column if not exists banner_active boolean not null default false;


-- ============================================================================
-- 12) HAKKIMIZDA — vitrindeki üç güven maddesi (çok dilli)
-- ============================================================================
create table if not exists public.about_items (
  id         integer primary key,
  sort_order integer not null default 0,
  icon       text    not null default 'leaf',
  title_tr   text, title_en text, title_ar text, title_de text, title_fr text,
  desc_tr    text, desc_en  text, desc_ar  text, desc_de  text, desc_fr  text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.about_items add column if not exists sort_order integer not null default 0;
alter table public.about_items add column if not exists icon       text not null default 'leaf';
alter table public.about_items add column if not exists title_tr   text;
alter table public.about_items add column if not exists title_en   text;
alter table public.about_items add column if not exists title_ar   text;
alter table public.about_items add column if not exists title_de   text;
alter table public.about_items add column if not exists title_fr   text;
alter table public.about_items add column if not exists desc_tr    text;
alter table public.about_items add column if not exists desc_en    text;
alter table public.about_items add column if not exists desc_ar    text;
alter table public.about_items add column if not exists desc_de    text;
alter table public.about_items add column if not exists desc_fr    text;
alter table public.about_items add column if not exists active     boolean not null default true;
alter table public.about_items add column if not exists created_at timestamptz not null default now();

-- Üç varsayılan madde (içerikler NULL — yönetici doldurur, vitrin i18n'e düşer)
insert into public.about_items (id, sort_order, icon)
values (1, 1, 'natural'), (2, 2, 'easy'), (3, 3, 'packaging')
on conflict (id) do nothing;

alter table public.about_items enable row level security;
alter table public.about_items force row level security;

grant select on public.about_items to anon, authenticated;
grant insert, update, delete on public.about_items to authenticated;

drop policy if exists "sarkdokusu_about_public_read" on public.about_items;
create policy "sarkdokusu_about_public_read"
  on public.about_items for select
  to anon, authenticated
  using (active = true);

drop policy if exists "sarkdokusu_about_admin_read" on public.about_items;
create policy "sarkdokusu_about_admin_read"
  on public.about_items for select
  to authenticated
  using (public.is_admin());

drop policy if exists "sarkdokusu_about_admin_insert" on public.about_items;
create policy "sarkdokusu_about_admin_insert"
  on public.about_items for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "sarkdokusu_about_admin_update" on public.about_items;
create policy "sarkdokusu_about_admin_update"
  on public.about_items for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "sarkdokusu_about_admin_delete" on public.about_items;
create policy "sarkdokusu_about_admin_delete"
  on public.about_items for delete
  to authenticated
  using (public.is_admin());


-- ============================================================================
-- KONTROL SORGUSU
-- ============================================================================
-- select schemaname, tablename, policyname, cmd, roles
--   from pg_policies
--  where tablename in ('products','objects','site_settings','categories','about_items')
--  order by tablename, policyname;

-- select public.is_admin() as oturum_acan_yonetici_mi;

-- ============================================================================
-- BİTTİ.
-- ============================================================================
