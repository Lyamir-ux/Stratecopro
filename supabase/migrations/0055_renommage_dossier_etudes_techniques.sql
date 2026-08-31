-- Feedback Amir 31/08/2026 : le dossier « Études techniques » devient
-- « Devis des études techniques et Frais Annexes » (onglet Fichiers).
-- Appliquée en prod le 31/08/2026 (MCP, nom : renommage_dossier_devis_etudes_techniques_frais_annexes).
update public.fichiers
set dossier = 'Devis des études techniques et Frais Annexes'
where dossier = 'Études techniques';
