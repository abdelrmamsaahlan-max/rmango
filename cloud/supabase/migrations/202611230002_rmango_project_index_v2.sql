-- Extend the project index with persistence, UI and asset relationship categories.
-- Apply after 202611230001_rmango_learning_loop.sql.

alter table public.project_file_dependencies
  drop constraint if exists project_file_dependencies_dependency_type_check;

alter table public.project_file_dependencies
  add constraint project_file_dependencies_dependency_type_check
  check (dependency_type in (
    'module_require',
    'instance_reference',
    'service_reference',
    'remote_reference',
    'datastore_reference',
    'ui_reference',
    'asset_reference'
  ));

create index if not exists project_file_dependencies_kind_name_idx
  on public.project_file_dependencies(owner_id, project_id, dependency_type, target_name);
