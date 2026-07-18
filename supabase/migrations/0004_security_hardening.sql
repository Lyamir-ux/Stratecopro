-- Durcissement suite aux advisors Supabase
alter function set_updated_at() set search_path = public;
revoke execute on function is_amo() from anon, public;
-- authenticated conserve EXECUTE : les policies RLS évaluent is_amo() avec les droits de l'appelant.
