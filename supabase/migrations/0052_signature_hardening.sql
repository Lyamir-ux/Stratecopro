-- 0052 - Hygiène : les fonctions trigger du module signature ne sont pas
-- appelables en RPC (même logique que 0004 pour is_amo).
revoke execute on function audit_log_chain() from anon, authenticated, public;
revoke execute on function signataires_protege_colonnes() from anon, authenticated, public;
