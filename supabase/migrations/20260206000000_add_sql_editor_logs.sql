create table if not exists sql_editor_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  sql_text text not null,
  rows_returned integer not null default 0,
  duration_ms integer not null default 0,
  status text not null,
  error_message text,
  auth_mode text
);

create index if not exists sql_editor_logs_created_at_idx
  on sql_editor_logs (created_at desc);

create index if not exists sql_editor_logs_user_id_idx
  on sql_editor_logs (user_id);
