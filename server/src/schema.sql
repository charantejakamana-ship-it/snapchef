create extension if not exists "uuid-ossp";

-- PROFILES -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  full_name text,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- ITEMS ----------------------------------------------------------------
create table if not exists public.items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  ai_summary text,
  value_inr numeric(10,2),
  status text not null default 'in_kitchen' check (status in ('in_kitchen','used','wasted')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists items_user_id_idx on public.items(user_id);
create index if not exists items_status_idx on public.items(user_id, status);

-- ROW LEVEL SECURITY ---------------------------------------------------
alter table public.profiles enable row level security;
alter table public.items enable row level security;

-- Anon/authenticated clients get NO direct access; all traffic goes
-- through the Express API using the service_role key (which bypasses RLS).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "items_select_own" on public.items;
create policy "items_select_own" on public.items
  for select using (auth.uid() = user_id);

drop policy if exists "items_insert_own" on public.items;
create policy "items_insert_own" on public.items
  for insert with check (auth.uid() = user_id);

drop policy if exists "items_update_own" on public.items;
create policy "items_update_own" on public.items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "items_delete_own" on public.items;
create policy "items_delete_own" on public.items
  for delete using (auth.uid() = user_id);
