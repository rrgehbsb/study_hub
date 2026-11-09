-- Study Hub tables, in the SAME Supabase project as the main Dashboard.
-- Additive only: it creates new study_* tables and a private "study" storage bucket.
-- It does not touch app_state or anything the main Dashboard uses.
-- Safe to run more than once. Run in Supabase: SQL Editor -> New query -> paste -> Run.

-- ---------- tables ----------
create table if not exists public.study_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id text not null,
  lesson_date date not null default current_date,
  title text,
  status text not null default 'uploaded' check (status in ('uploaded','transcribing','ready','error')),
  audio_path text,
  transcript text,
  summary text,
  topics text[] not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id text not null,
  lesson_id uuid references public.study_lessons(id) on delete set null,
  kind text not null check (kind in ('board','notes','teacher_summary','old_test','worksheet')),
  title text,
  file_path text,
  mime text,
  content text,
  status text not null default 'ready' check (status in ('uploaded','reading','ready','error')),
  error text,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id text not null,
  name text not null,
  state text not null default 'new' check (state in ('new','with_help','alone')),
  last_practiced timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject_id, name)
);

create table if not exists public.study_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id text not null,
  topic text,
  chat_id uuid,
  question text,
  answer text,
  verdict text check (verdict in ('correct','partial','wrong')),
  feedback text,
  alone boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.study_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject_id text not null,
  mode text not null check (mode in ('teach','test')),
  topic text,
  messages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_usage (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  calls int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);

create index if not exists study_lessons_subject on public.study_lessons (user_id, subject_id, lesson_date desc);
create index if not exists study_materials_subject on public.study_materials (user_id, subject_id, created_at desc);
create index if not exists study_topics_subject on public.study_topics (user_id, subject_id);
create index if not exists study_attempts_subject on public.study_attempts (user_id, subject_id, created_at desc);
create index if not exists study_chats_subject on public.study_chats (user_id, subject_id, updated_at desc);

-- ---------- row-level security: each signed-in user sees only their own rows ----------
do $$
declare t text;
begin
  foreach t in array array['study_lessons','study_materials','study_topics','study_attempts','study_chats','study_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- The usage counter is bumped atomically by the tutor function (called with the user's token).
create or replace function public.study_bump_usage(p_in bigint, p_out bigint)
returns int language sql security invoker as $$
  insert into public.study_usage (user_id, day, calls, input_tokens, output_tokens)
  values (auth.uid(), (now() at time zone 'Asia/Jerusalem')::date, 1, p_in, p_out)
  on conflict (user_id, day) do update
    set calls = public.study_usage.calls + 1,
        input_tokens = public.study_usage.input_tokens + excluded.input_tokens,
        output_tokens = public.study_usage.output_tokens + excluded.output_tokens
  returning calls;
$$;

-- ---------- storage: private bucket, files under <user id>/... ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('study', 'study', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "study: own folder read" on storage.objects;
drop policy if exists "study: own folder add" on storage.objects;
drop policy if exists "study: own folder change" on storage.objects;
drop policy if exists "study: own folder delete" on storage.objects;

create policy "study: own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "study: own folder add" on storage.objects for insert to authenticated
  with check (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "study: own folder change" on storage.objects for update to authenticated
  using (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "study: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Check: should list the six study tables with row-level security on.
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename like 'study_%' order by tablename;
