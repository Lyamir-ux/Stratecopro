-- 0080 - Suivi PPT : journalisation de la requalification d'un document
--
-- Le type d'un document est deviné au dépôt d'après le nom du fichier (un
-- classeur « PPT_<Copro>.xlsx » arrive en « Tableau PPT »). Le dirigeant peut
-- le corriger depuis la file de revue pour ramener un PPPT dans la file
-- d'analyse ; la correction est tracée au même titre que le dépôt.
create or replace function ppt_journal_requalification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type is distinct from old.type then
    perform ppt_journaliser(new.ppt_copro_id, new.id, 'requalification',
      jsonb_build_object('avant', old.type, 'apres', new.type, 'name', new.name));
  end if;
  return new;
end;
$$;
revoke execute on function ppt_journal_requalification() from anon, authenticated, public;

drop trigger if exists trg_ppt_rapports_journal_type on ppt_rapports;
create trigger trg_ppt_rapports_journal_type after update of type on ppt_rapports
  for each row execute function ppt_journal_requalification();
