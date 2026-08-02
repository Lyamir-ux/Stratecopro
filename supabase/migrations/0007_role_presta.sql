-- 0007 — Nouveau rôle d'espace : prestataire (MOE, diagnostiqueur, CT, SPS…).
-- Isolé dans sa propre migration : une nouvelle valeur d'enum ne peut pas être
-- utilisée dans la transaction qui la crée.
alter type app_role add value if not exists 'presta';
