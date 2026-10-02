-- 0130 - E-mail de confirmation quand le copropriétaire transmet son enquête
-- (remarque d'Amir du 02/10/2026, 20:09) : « lorsque le copropriétaire a terminé
-- son enquête, il reçoit un mail pour lui dire que son enquête a été prise en
-- compte ».
--
-- L'envoi est fait par l'edge function notifier-enquete-transmise, appelée par
-- le portail après une transmission complète. Trace sur la réponse, comme
-- refus_email_statut pour les pièces refusées : envoye | simule | erreur |
-- sans_email, et la date d'envoi - qui sert aussi à ne pas renvoyer l'e-mail
-- deux fois pour la même transmission (double clic, onglet rechargé).
alter table public.enquete_reponses
  add column if not exists transmission_email_statut text
    check (transmission_email_statut in ('envoye', 'simule', 'erreur', 'sans_email')),
  add column if not exists transmission_email_le timestamptz;

comment on column public.enquete_reponses.transmission_email_statut is
  'E-mail de confirmation de transmission de l''enquête au copropriétaire (notifier-enquete-transmise) : envoye | simule | erreur | sans_email';
comment on column public.enquete_reponses.transmission_email_le is
  'Date du dernier e-mail de confirmation de transmission (au plus tôt la date de transmission notifiée) ; pas de nouvel envoi pour une transmission antérieure ou égale à cette date ; non posée si l''envoi est en erreur';
