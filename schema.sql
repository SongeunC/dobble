-- 도블 찾기 1차 버전 (모임 코드 방식): Supabase SQL Editor에 통째로 붙여넣고 실행한다.
-- 교사는 관리자가 오프라인으로 알려 준 '모임 코드'와 별명으로 들어온다. 이메일은 받지 않는다.
-- 덱(카드 세트)은 모임 안에서 함께 본다. 사진은 작게 줄여 덱 안에 넣으므로 파일 저장소는 쓰지 않는다.
-- 판 진행 상태, 학생 닉네임, 점수는 저장하지 않는다.
--
-- ※ 모임 코드는 이 파일에 적지 않는다(이 폴더는 그대로 공개 배포된다).
--   코드를 정하거나 바꿀 때는 SQL Editor에서 아래 한 줄만 따로 실행한다. 코드를 바꾸면 예전 코드로는 못 들어온다.
--   insert into private.team (id, code_hash) values (1, extensions.crypt('여기에_모임코드', extensions.gen_salt('bf')))
--   on conflict (id) do update set code_hash = excluded.code_hash;

create extension if not exists pgcrypto with schema extensions;

-- 이전 버전(구글 로그인 방식)에서 만든 것 정리
drop table if exists public.set_items;
drop table if exists public.card_sets;
drop policy if exists "teacher reads own images" on storage.objects;
drop policy if exists "teacher uploads own images" on storage.objects;
drop policy if exists "teacher deletes own images" on storage.objects;

-- 모임 코드: 바깥에서 읽을 수 없는 private 스키마에 암호화해서 둔다
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.team (
  id int primary key default 1 check (id = 1),
  code_hash text not null
);

-- 덱: 항목 57개를 JSON 배열로 저장 ([{kind:'word', text} | {kind:'image', image:'data:...'} | null])
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  author text not null check (char_length(author) between 1 and 20),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) = 57),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 테이블은 직접 열지 못하게 막고, 아래 함수(모임 코드 확인)로만 읽고 쓴다
alter table public.decks enable row level security;
revoke all on public.decks from public, anon, authenticated;

create or replace function private.check_code(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.team t where t.code_hash = extensions.crypt(p_code, t.code_hash)) then
    perform pg_sleep(1); -- 코드를 마구 넣어 보는 걸 느리게 만든다
    raise exception 'wrong_code';
  end if;
end $$;

create or replace function public.team_login(p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_code(p_code);
  return true;
end $$;

create or replace function public.list_decks(p_code text)
returns table (id uuid, name text, author text, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_code(p_code);
  return query select d.id, d.name, d.author, d.updated_at from public.decks d order by d.updated_at desc;
end $$;

create or replace function public.get_deck(p_code text, p_id uuid)
returns table (id uuid, name text, author text, items jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_code(p_code);
  return query select d.id, d.name, d.author, d.items from public.decks d where d.id = p_id;
end $$;

create or replace function public.save_deck(p_code text, p_id uuid, p_name text, p_author text, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.check_code(p_code);
  if octet_length(p_items::text) > 3000000 then
    raise exception 'deck_too_large';
  end if;
  if p_id is null then
    insert into public.decks (name, author, items) values (p_name, p_author, p_items) returning id into v_id;
  else
    update public.decks set name = p_name, items = p_items, updated_at = now() where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'deck_not_found';
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_deck(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_code(p_code);
  delete from public.decks where id = p_id;
end $$;

revoke all on function private.check_code(text) from public, anon, authenticated;
revoke all on function public.team_login(text) from public;
revoke all on function public.list_decks(text) from public;
revoke all on function public.get_deck(text, uuid) from public;
revoke all on function public.save_deck(text, uuid, text, text, jsonb) from public;
revoke all on function public.delete_deck(text, uuid) from public;
grant execute on function public.team_login(text) to anon;
grant execute on function public.list_decks(text) to anon;
grant execute on function public.get_deck(text, uuid) to anon;
grant execute on function public.save_deck(text, uuid, text, text, jsonb) to anon;
grant execute on function public.delete_deck(text, uuid) to anon;
