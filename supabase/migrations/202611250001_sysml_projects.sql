begin;

create table public.projects (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  schema_version integer not null check (schema_version > 0),
  revision integer not null check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, owner_id)
);

create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

create table public.workspace_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  project_id uuid not null,
  opened_at timestamptz not null default clock_timestamp(),
  foreign key (project_id, user_id) references public.projects (id, owner_id) on delete cascade
);

alter table public.projects enable row level security;
alter table public.workspace_state enable row level security;
revoke all on public.projects, public.workspace_state from public, anon, authenticated;
grant select, insert, update on public.projects, public.workspace_state to authenticated;

create policy own_projects on public.projects
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy own_workspace_state on public.workspace_state
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function public.remember_sysml_project(p_user_id uuid, p_project_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'Project session does not match.';
  end if;

  insert into public.workspace_state (user_id, project_id)
  values (p_user_id, p_project_id)
  on conflict (user_id) do update
    set project_id = excluded.project_id, opened_at = clock_timestamp();
end;
$$;

create function public.save_sysml_project(
  p_user_id uuid,
  p_project_id uuid,
  p_expected_revision integer,
  p_title text,
  p_schema_version integer,
  p_payload jsonb
)
returns setof public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project public.projects%rowtype;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'Project session does not match.';
  end if;

  if p_expected_revision = 0 then
    insert into public.projects (id, owner_id, title, schema_version, revision, payload)
    values (p_project_id, p_user_id, p_title, p_schema_version, 1, p_payload)
    on conflict (id) do nothing
    returning * into project;
  else
    update public.projects as existing
      set title = p_title,
          schema_version = p_schema_version,
          revision = existing.revision + 1,
          payload = p_payload,
          updated_at = clock_timestamp()
      where existing.id = p_project_id and existing.owner_id = p_user_id
        and existing.revision = p_expected_revision
    returning existing.* into project;
  end if;

  if not found then
    -- A retry after a lost response can still confirm the matching committed snapshot.
    select * into project from public.projects as existing
      where existing.id = p_project_id and existing.owner_id = p_user_id
        and existing.revision = p_expected_revision + 1
        and existing.title = p_title and existing.schema_version = p_schema_version
        and existing.payload = p_payload;
    if not found then
      raise exception using errcode = 'PT409', message = 'Project revision conflict.';
    end if;
  end if;

  perform public.remember_sysml_project(p_user_id, p_project_id);
  return next project;
end;
$$;

revoke execute on function public.remember_sysml_project(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.save_sysml_project(uuid, uuid, integer, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.remember_sysml_project(uuid, uuid) to authenticated;
grant execute on function public.save_sysml_project(uuid, uuid, integer, text, integer, jsonb) to authenticated;

commit;
