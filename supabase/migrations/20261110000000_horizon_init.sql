-- Horizon: crew spaces, family messages and shared health reports.
-- Health readings themselves never come here; they stay on the astronaut's device.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated;

-- Crew spaces --------------------------------------------------------------

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  mission text not null default 'station' check (mission in ('station', 'spacecraft', 'moon', 'mars')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('astronaut', 'family', 'surgeon')),
  display_name text not null check (char_length(display_name) between 1 and 60),
  relationship text check (char_length(relationship) <= 40),
  status text not null default 'pending' check (status in ('pending', 'approved', 'removed')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index crew_members_user_idx on public.crew_members (user_id);

create table public.invites (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  crew_id uuid not null references public.crews (id) on delete cascade,
  role text not null default 'family' check (role in ('family', 'surgeon')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
create index invites_crew_idx on public.invites (crew_id);
create index invites_created_by_idx on public.invites (created_by);

-- Shared health reports (only what the astronaut chooses to send) ---------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  astronaut_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  level text not null check (level in ('green', 'amber', 'red')),
  summary text not null check (char_length(summary) <= 1000),
  snapshot jsonb not null default '{}'::jsonb,
  delay_seconds integer not null default 0 check (delay_seconds between 0 and 86400),
  created_at timestamptz not null default now(),
  deliver_at timestamptz not null default now()
);
create index reports_crew_idx on public.reports (crew_id, deliver_at desc);
create index reports_astronaut_idx on public.reports (astronaut_id);

-- Messages (text, voice, video), delivered after the mission's signal delay -

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient_id uuid references auth.users (id) on delete cascade, -- null = everyone in the crew
  kind text not null check (kind in ('text', 'voice', 'video')),
  body text check (char_length(body) <= 2000),
  media_path text check (char_length(media_path) <= 200),
  media_type text check (char_length(media_type) <= 60),
  open_when text check (char_length(open_when) <= 80),
  report_id uuid references public.reports (id) on delete set null,
  delay_seconds integer not null default 0 check (delay_seconds between 0 and 86400),
  sent_at timestamptz not null default now(),
  deliver_at timestamptz not null default now(),
  opened_at timestamptz
);
create index messages_crew_idx on public.messages (crew_id, deliver_at desc);
create index messages_sender_idx on public.messages (sender_id);
create index messages_recipient_idx on public.messages (recipient_id);
create index messages_report_idx on public.messages (report_id);

-- The server, not the client, stamps send and delivery times.
create or replace function private.stamp_delivery() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'messages' then
    new.sent_at := now();
  else
    new.created_at := now();
  end if;
  new.deliver_at := now() + make_interval(secs => new.delay_seconds);
  return new;
end;
$$;
create trigger messages_stamp before insert on public.messages
  for each row execute function private.stamp_delivery();
create trigger reports_stamp before insert on public.reports
  for each row execute function private.stamp_delivery();

-- Membership helpers (private schema: not callable through the API) -------

create or replace function private.member_role(c uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.crew_members m
  where m.crew_id = c and m.user_id = (select auth.uid()) and m.status = 'approved';
$$;

create or replace function private.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.crew_members m
    where m.crew_id = c and m.user_id = (select auth.uid()) and m.status = 'approved'
  );
$$;

create or replace function private.is_member_or_pending(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.crew_members m
    where m.crew_id = c and m.user_id = (select auth.uid()) and m.status in ('approved', 'pending')
  );
$$;

create or replace function private.is_astronaut(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.member_role(c) = 'astronaut', false);
$$;

create or replace function private.is_member_folder(folder text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return private.is_member(folder::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;

grant execute on all functions in schema private to authenticated;

-- Row-level security -------------------------------------------------------

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.invites enable row level security;
alter table public.reports enable row level security;
alter table public.messages enable row level security;

create policy "Members see their crew" on public.crews
  for select to authenticated using (private.is_member_or_pending(id));
create policy "Astronaut updates their crew" on public.crews
  for update to authenticated using (private.is_astronaut(id)) with check (private.is_astronaut(id));
create policy "Astronaut deletes their crew" on public.crews
  for delete to authenticated using (private.is_astronaut(id));

create policy "Members see the crew list" on public.crew_members
  for select to authenticated using (user_id = (select auth.uid()) or private.is_member(crew_id));
create policy "People can leave, astronaut can remove" on public.crew_members
  for delete to authenticated using (user_id = (select auth.uid()) or private.is_astronaut(crew_id));

create policy "Astronaut sees their invites" on public.invites
  for select to authenticated using (private.is_astronaut(crew_id));
create policy "Astronaut deletes their invites" on public.invites
  for delete to authenticated using (private.is_astronaut(crew_id));

create policy "Astronaut and surgeon see reports" on public.reports
  for select to authenticated using (
    astronaut_id = (select auth.uid())
    or (private.member_role(crew_id) = 'surgeon' and deliver_at <= now())
  );
create policy "Astronaut shares reports" on public.reports
  for insert to authenticated with check (astronaut_id = (select auth.uid()) and private.is_astronaut(crew_id));
create policy "Astronaut deletes reports" on public.reports
  for delete to authenticated using (astronaut_id = (select auth.uid()));

create policy "Members see delivered messages" on public.messages
  for select to authenticated using (
    private.is_member(crew_id)
    and (
      sender_id = (select auth.uid())
      or ((recipient_id is null or recipient_id = (select auth.uid())) and deliver_at <= now())
    )
  );
create policy "Members send messages" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and private.is_member(crew_id)
    and (recipient_id is null or exists (
      select 1 from public.crew_members m
      where m.crew_id = messages.crew_id and m.user_id = messages.recipient_id and m.status = 'approved'
    ))
  );
create policy "Recipients mark messages opened" on public.messages
  for update to authenticated
  using (private.is_member(crew_id) and (recipient_id = (select auth.uid()) or recipient_id is null) and deliver_at <= now())
  with check (private.is_member(crew_id));
create policy "Senders delete their messages" on public.messages
  for delete to authenticated using (sender_id = (select auth.uid()));

-- Only the opened time can be changed after sending.
revoke update on public.messages from authenticated, anon;
grant update (opened_at) on public.messages to authenticated;
revoke update on public.crews from authenticated, anon;
grant update (name, mission) on public.crews to authenticated;
revoke all on public.crews, public.crew_members, public.invites, public.reports, public.messages from anon;

-- API functions -------------------------------------------------------------

create or replace function public.create_crew(p_name text, p_mission text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_crew uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  insert into public.crews (name, mission, created_by)
    values (p_name, coalesce(p_mission, 'station'), (select auth.uid()))
    returning id into v_crew;
  insert into public.crew_members (crew_id, user_id, role, display_name, status)
    values (v_crew, (select auth.uid()), 'astronaut', p_display_name, 'approved');
  return v_crew;
end;
$$;

create or replace function public.create_invite(p_crew uuid, p_role text default 'family')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text := '';
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if not private.is_astronaut(p_crew) then raise exception 'Only the astronaut can invite people'; end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.invites where code = v_code);
  end loop;
  insert into public.invites (code, crew_id, role, created_by)
    values (v_code, p_crew, coalesce(p_role, 'family'), (select auth.uid()));
  return v_code;
end;
$$;

create or replace function public.join_crew(p_code text, p_display_name text, p_relationship text default null)
returns table (crew_id uuid, crew_name text, mission text, role text, status text)
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invites%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  select * into v_inv from public.invites i where i.code = upper(trim(p_code)) and i.expires_at > now();
  if not found then raise exception 'That invite code is not valid or has expired'; end if;
  insert into public.crew_members as m (crew_id, user_id, role, display_name, relationship, status)
    values (v_inv.crew_id, (select auth.uid()), v_inv.role, p_display_name, p_relationship, 'pending')
    on conflict on constraint crew_members_pkey do update
      set display_name = excluded.display_name, relationship = excluded.relationship
      where m.status <> 'removed';
  return query
    select c.id, c.name, c.mission, m.role, m.status
    from public.crews c join public.crew_members m on m.crew_id = c.id and m.user_id = (select auth.uid())
    where c.id = v_inv.crew_id;
end;
$$;

create or replace function public.set_member_status(p_crew uuid, p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_astronaut(p_crew) then raise exception 'Only the astronaut can approve or remove people'; end if;
  if p_status not in ('approved', 'removed') then raise exception 'Unknown status'; end if;
  if p_user = (select auth.uid()) then raise exception 'You cannot change your own status'; end if;
  update public.crew_members set status = p_status where crew_id = p_crew and user_id = p_user;
end;
$$;

revoke execute on function public.create_crew(text, text, text) from public, anon;
revoke execute on function public.create_invite(uuid, text) from public, anon;
revoke execute on function public.join_crew(text, text, text) from public, anon;
revoke execute on function public.set_member_status(uuid, uuid, text) from public, anon;
grant execute on function public.create_crew(text, text, text) to authenticated;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.join_crew(text, text, text) to authenticated;
grant execute on function public.set_member_status(uuid, uuid, text) to authenticated;

-- Private bucket for voice and video messages, one folder per crew --------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 26214400,
  array['video/webm', 'video/mp4', 'video/quicktime', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'])
on conflict (id) do nothing;

create policy "Crew members upload media" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'media' and private.is_member_folder((storage.foldername(name))[1])
  );
create policy "Crew members read media" on storage.objects
  for select to authenticated using (
    bucket_id = 'media' and private.is_member_folder((storage.foldername(name))[1])
  );
create policy "Uploaders delete their media" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and owner_id = (select auth.uid())::text);
