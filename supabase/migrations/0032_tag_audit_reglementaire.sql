-- Feedback Amir (18/08/2026) : la tâche « Vérif. audit énergétique » porte une
-- bulle « Audit réglementaire », pas « DPE ». Aligne les dossiers existants sur
-- le gabarit (src/lib/taskTemplate.ts).
update taches
   set tag = 'Audit réglementaire'
 where tag = 'DPE';
