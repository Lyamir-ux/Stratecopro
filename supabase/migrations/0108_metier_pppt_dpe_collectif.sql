-- Métier « PPPT + DPE collectif » (demande d'Amir, 27/09/2026).
--
-- Nouvelle prestation couverte par les prestataires de la Base prestataires,
-- et type de consultation correspondant : réalisation du projet de plan
-- pluriannuel de travaux et du DPE collectif d'une copropriété. C'est le métier
-- des consultations issues des demandes « PPPT + DPE collectif » des syndics
-- (suivi des PPT, 0107).
-- Aucune fiche n'est cochée d'office : l'équipe coche le métier sur les
-- entreprises concernées.

alter type type_consultation add value if not exists 'pppt_dpe' after 'be';
