-- Pinpoint leaderboard setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  day         date not null,
  group_code  text not null,
  player_id   uuid not null,
  name        text not null,
  score       int  not null,
  squares     text not null default '',
  unique (day, group_code, player_id)
);

create index if not exists scores_day_group_idx on public.scores (day, group_code, score desc);

-- Row Level Security: anyone may read scores and add one score per day,
-- but nobody can edit or delete them through the public key.
alter table public.scores enable row level security;

drop policy if exists "Anyone can read scores" on public.scores;
create policy "Anyone can read scores"
  on public.scores for select
  to anon
  using (true);

drop policy if exists "Anyone can add a sensible score" on public.scores;
create policy "Anyone can add a sensible score"
  on public.scores for insert
  to anon
  with check (
    score between 0 and 5000
    and char_length(name) between 1 and 20
    and char_length(group_code) between 1 and 30
    and char_length(squares) <= 40
    and day between current_date - 1 and current_date + 1
  );
