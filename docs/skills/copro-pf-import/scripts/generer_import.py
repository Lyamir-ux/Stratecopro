#!/usr/bin/env python3
"""Génère le classeur à importer dans Strat Eco Pro depuis un plan de
financement décrit en JSON (le « pivot », voir references/pivot.md).

    python generer_import.py pivot.json [--sortie DOSSIER]

Produit :
  - nature « definitif » : « Import PF définitif - <copro>.xlsx » (un fichier
    par scénario s'il y en a plusieurs), au format relu par le bouton
    « Importer un classeur » de l'onglet Financement (onglets « PF définitif
    Eco PTZ collectif / individuel » + un onglet « Lot NN » par lot) ;
  - nature « estimatif » : « Import PF estimatif - <copro>.xlsx », une feuille,
    une colonne par scénario, avec les formules que le logiciel relit (lignes
    retenues, TVA, MOE, aides) ;
  - « Rapport conversion PF - <copro>.md » : calcul du logiciel comparé aux
    totaux du classeur source, ce que l'import lira autrement (à reprendre
    dans l'éditeur), garde-fous.

Code de sortie : 0 si le classeur est produit, 1 si le pivot est invalide
(les erreurs sont listées, rien n'est écrit).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from moteur_pf import (  # noqa: E402
    MODES_AIDE,
    MODES_MOE,
    PHASES_MOE,
    calibrer_aides,
    classify_aide,
    classify_moe,
    completer_plan,
    compute_plan,
    decrire_calcul,
    decrire_moe,
    fmt_euro,
    fmt_nombre,
    fmt_taux,
    js_nombre,
    norm,
    parse_tva,
    suggest_mpr_copro_pct,
    est_bonus_mpr,
)
from xlsx_ecriture import GRAS, MONTANT, MONTANT_GRAS, NORMAL, POURCENT, Classeur, ref  # noqa: E402

TVA_TRAVAUX_DEFAUT = 5.5
TVA_USUELLES = {0, 2.1, 5.5, 10, 20}


def round2(x: float) -> float:
    """Math.round(x * 100) / 100 (JavaScript)."""
    return math.floor(x * 100 + 0.5) / 100


def coef_tva(tva: float) -> float:
    """Math.round((1 + tva / 100) * 10000) / 10000."""
    return math.floor((1 + tva / 100) * 10000 + 0.5) / 10000


class Journal:
    def __init__(self):
        self.erreurs: list[str] = []
        self.avert: list[str] = []

    def err(self, m: str):
        self.erreurs.append(m)

    def av(self, m: str):
        self.avert.append(m)


# =====================================================================
# Validation et normalisation du pivot
# =====================================================================


def est_nombre(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def verifier_nombre(j: Journal, ou: str, v, obligatoire=True):
    if v is None:
        if obligatoire:
            j.err(f"{ou} : nombre attendu, valeur absente.")
        return
    if not est_nombre(v):
        j.err(f"{ou} : nombre attendu, reçu {v!r} (pas de texte, pas de « 12 000 € »).")


def texte(v) -> str:
    """Texte nettoyé : apostrophes droites (l'import ne reconnaît pas « ’ ») et tirets simples (jamais « — »)."""
    if v is None:
        return ""
    s = v if isinstance(v, str) else str(v)
    s = s.replace("’", "'").replace("‘", "'").replace("—", "-").replace("–", "-")
    return s.strip()


def normaliser_scenario(sc: dict, nature: str, j: Journal) -> dict:
    pre = f"Scénario {sc.get('ordre', '?')}"
    plan = completer_plan(sc)
    infos, params = plan["infos"], plan["params"]

    # --- infos
    plan["infos"]["nomCopro"] = texte(infos["nomCopro"])
    if not plan["infos"]["nomCopro"]:
        j.err(f"{pre} : infos.nomCopro (nom de la copropriété) est obligatoire.")
    for k in ("nbLogements", "nbLogementsEquiv", "surfaceHabitable", "nbEtages", "nbEntrees", "cepInitial", "cepProjet"):
        verifier_nombre(j, f"{pre} : infos.{k}", infos[k])
    if est_nombre(infos["nbLogements"]) and infos["nbLogements"] <= 0:
        j.err(f"{pre} : infos.nbLogements doit être positif (plafond MPR, garde-fous et aides par logement en dépendent).")
    if not isinstance(infos["dispositifClimaxion"], bool):
        j.err(f"{pre} : infos.dispositifClimaxion doit valoir true ou false.")
    for k in ("etiquetteInitiale", "etiquetteProjet"):
        v = texte(infos[k]).upper()
        if v and v not in "ABCDEFG":
            j.err(f"{pre} : infos.{k} = {v!r} : une lettre de A à G attendue.")
        infos[k] = v
    for k in ("adresse", "typeChauffage"):
        infos[k] = texte(infos[k])

    # --- params
    for k in ("imprevusPct", "plafondTravauxParLogement", "plafondMprParLogement", "fondsTravaux", "totalTantiemes", "dureeEcoPtzAns", "coefAssurance", "tauxPretAvancePct", "pctAvanceAides"):
        verifier_nombre(j, f"{pre} : params.{k}", params[k])
    if not isinstance(params["tantiemesExemples"], list) or not all(est_nombre(t) for t in params["tantiemesExemples"]):
        j.err(f"{pre} : params.tantiemesExemples doit être une liste de nombres (tantièmes des lots donnés en exemple).")
    if params.get("commentaireFondsTravaux") is not None:
        params["commentaireFondsTravaux"] = texte(params["commentaireFondsTravaux"]) or None
    if params.get("commentaireFondsTravaux") is None:
        params.pop("commentaireFondsTravaux", None)

    # --- variantes
    for k in ("collectif", "collectifSansAvance", "individuel"):
        if not isinstance(plan["variantes"].get(k), bool):
            j.err(f"{pre} : variantes.{k} doit valoir true ou false.")
    if nature == "definitif" and not any(plan["variantes"].get(k) for k in ("collectif", "collectifSansAvance", "individuel")):
        j.err(f"{pre} : au moins une variante de financement (collectif, collectifSansAvance ou individuel) doit être retenue.")

    # --- lots
    numeros = set()
    for li, lot in enumerate(plan["lots"]):
        ou = f"{pre} : lot n°{lot.get('numero', li + 1)}"
        if not isinstance(lot.get("numero"), int) or isinstance(lot.get("numero"), bool) or lot["numero"] < 1:
            j.err(f"{ou} : « numero » doit être un entier positif.")
        elif lot["numero"] in numeros:
            j.err(f"{ou} : numéro de lot en double (fusionner les lignes dans un seul lot, ou renuméroter).")
        else:
            numeros.add(lot["numero"])
        lot["titre"] = texte(lot.get("titre"))
        if not lot["titre"]:
            j.err(f"{ou} : « titre » obligatoire.")
        if lot.get("entreprise") is not None:
            lot["entreprise"] = texte(lot["entreprise"]) or None
        if lot.get("entreprise") is None:
            lot.pop("entreprise", None)
        verifier_nombre(j, f"{ou} : remisePct", lot.get("remisePct"))
        if not lot["lignes"]:
            j.err(f"{ou} : aucune ligne.")
        for i, l in enumerate(lot["lignes"]):
            oul = f"{ou}, ligne {i + 1}"
            l["designation"] = texte(l.get("designation"))
            if not l["designation"]:
                j.err(f"{oul} : « designation » obligatoire.")
            if not isinstance(l.get("retenu"), bool):
                j.err(f"{oul} : « retenu » doit valoir true (assiette MaPrimeRénov') ou false.")
            verifier_nombre(j, f"{oul} : montantHt", l.get("montantHt"))
            verifier_nombre(j, f"{oul} : tvaPct", l.get("tvaPct"))
            if est_nombre(l.get("tvaPct")) and l["tvaPct"] not in TVA_USUELLES:
                j.av(f"{oul} « {l['designation']} » : TVA de {fmt_taux(l['tvaPct'])} % inhabituelle (5,5 / 10 / 20 %).")
            if l.get("tvaMontant") is not None:
                verifier_nombre(j, f"{oul} : tvaMontant", l["tvaMontant"])
                if nature == "definitif":
                    j.err(
                        f"{oul} : « tvaMontant » (TVA saisie en euros) n'est pas relu par l'import du PF définitif. "
                        "Découper la ligne par taux de TVA (une ligne à 5,5 %, une à 10 %…) pour retrouver le TTC."
                    )
            else:
                l.pop("tvaMontant", None)
            for k in ("groupe", "commentaire", "cleRepartition"):
                if l.get(k) is not None:
                    l[k] = texte(l[k]) or None
                if l.get(k) is None:
                    l.pop(k, None)

    # --- MOE
    for i, l in enumerate(plan["moe"]):
        ou = f"{pre} : MOE ligne {i + 1}"
        l["designation"] = texte(l.get("designation"))
        if not l["designation"]:
            j.err(f"{ou} : « designation » obligatoire.")
        if l.get("phase") not in ("etude", "projet", "travaux"):
            j.err(f"{ou} « {l['designation']} » : « phase » doit valoir etude, projet ou travaux.")
        m = l.get("montant")
        if not isinstance(m, dict) or m.get("mode") not in MODES_MOE:
            j.err(f"{ou} « {l['designation']} » : « montant » doit être {{\"mode\": \"forfait\", \"montantHt\": …}}, {{\"mode\": \"pctTravauxHt\", \"taux\": …}} ou {{\"mode\": \"pctTravauxTtc\", \"taux\": …}}.")
        elif m["mode"] == "forfait":
            verifier_nombre(j, f"{ou} : montant.montantHt", m.get("montantHt"))
            if est_nombre(m.get("montantHt")):
                arrondi = round2(m["montantHt"])
                if abs(arrondi - m["montantHt"]) > 0.0049:
                    j.av(f"{ou} « {l['designation']} » : HT {m['montantHt']} arrondi au centime ({fmt_euro(arrondi)}).")
                m["montantHt"] = arrondi
        else:
            verifier_nombre(j, f"{ou} : montant.taux", m.get("taux"))
        verifier_nombre(j, f"{ou} : tvaPct", l.get("tvaPct"))
        for k in ("eligibleMprEtudes", "eligibleMprAmo"):
            if not isinstance(l.get(k), bool):
                j.err(f"{ou} « {l['designation']} » : « {k} » doit valoir true ou false.")
        for k in ("entreprise", "commentaire", "cleRepartition"):
            if l.get(k) is not None:
                l[k] = texte(l[k]) or None
            if l.get(k) is None:
                l.pop(k, None)

    # --- aides
    ids = set()
    for i, a in enumerate(plan["aides"]):
        ou = f"{pre} : aide {i + 1}"
        a["libelle"] = texte(a.get("libelle"))
        a["groupe"] = texte(a.get("groupe"))
        if not a["libelle"]:
            j.err(f"{ou} : « libelle » obligatoire.")
        c = a.get("calcul")
        if not isinstance(c, dict) or c.get("mode") not in MODES_AIDE:
            j.err(f"{ou} « {a['libelle']} » : « calcul.mode » doit être l'un de {', '.join(sorted(MODES_AIDE))}.")
        else:
            champs = {
                "manuel": ["montant"],
                "parM2Shab": ["tauxEurM2", "coef"],
                "pctAssietteTravaux": ["taux", "coef"],
                "pctEtudes": ["taux", "coef"],
                "pctAmo": ["taux"],
                "forfaitPlusParLogement": ["base", "parLogement"],
                "parLogement": ["montant"],
                "info": [],
            }[c["mode"]]
            for k in champs:
                verifier_nombre(j, f"{ou} « {a['libelle']} » : calcul.{k}", c.get(k))
            if c["mode"] in ("forfaitPlusParLogement", "parLogement") and not isinstance(c.get("surEquivalent"), bool):
                j.err(f"{ou} « {a['libelle']} » : calcul.surEquivalent doit valoir true (logements + équivalents) ou false (logements principaux).")
        if not isinstance(a.get("publique"), bool):
            j.err(f"{ou} « {a['libelle']} » : « publique » doit valoir true (aide publique) ou false (prime CEE).")
        else:
            # Ce que l'import lira : définitif = groupe « CEE » seul ; estimatif = groupe ou mot « CEE »
            privee_lue = norm(a["groupe"]) == "cee" or (nature == "estimatif" and re.search(r"\bcee\b", norm(a["libelle"])) is not None)
            if privee_lue == a["publique"]:
                regle = "le groupe « CEE »" if nature == "definitif" else "le groupe « CEE » ou le mot « CEE » dans le libellé"
                j.err(
                    f"{ou} « {a['libelle']} » (groupe « {a['groupe']} ») : déclarée {'publique' if a['publique'] else 'privée'}, "
                    f"mais l'import la lira {'privée' if privee_lue else 'publique'} - seul {regle} marque la prime privée."
                )
        base_id = texte(a.get("id")) or re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", norm(a["libelle"]))) or f"aide-{i + 1}"
        aid, n = base_id, 2
        while aid in ids:
            aid = f"{base_id}-{n}"
            n += 1
        ids.add(aid)
        a["id"] = aid
        for k in ("commentaire", "cleRepartition"):
            if a.get(k) is not None:
                a[k] = texte(a[k]) or None
            if a.get(k) is None:
                a.pop(k, None)
        if a.get("montant_source") is not None:
            verifier_nombre(j, f"{ou} « {a['libelle']} » : montant_source", a["montant_source"])
    return plan


def charger(pivot: dict, j: Journal) -> tuple[str, list[dict]]:
    nature = pivot.get("nature")
    if nature not in ("definitif", "estimatif"):
        j.err("« nature » doit valoir \"definitif\" ou \"estimatif\".")
        return "", []
    scs = pivot.get("scenarios")
    if not isinstance(scs, list) or not scs:
        j.err("« scenarios » doit être une liste non vide (un seul élément pour un PF définitif).")
        return nature, []
    ordres = set()
    out = []
    for i, sc in enumerate(scs):
        if not isinstance(sc, dict):
            j.err(f"scenarios[{i}] doit être un objet.")
            continue
        o = sc.get("ordre", i + 1)
        if not isinstance(o, int) or isinstance(o, bool) or o < 1:
            j.err(f"scenarios[{i}].ordre doit être un entier positif.")
            o = i + 1
        if o in ordres:
            j.err(f"Numéro de scénario {o} en double.")
        ordres.add(o)
        plan = normaliser_scenario({**sc, "ordre": o}, nature, j)
        plan["ordre"] = o
        plan["libelle"] = texte(sc.get("libelle"))
        plan["totaux_source"] = sc.get("totaux_source") or {}
        plan["notes"] = [texte(n) for n in (sc.get("notes") or []) if texte(n)]
        out.append(plan)
    out.sort(key=lambda p: p["ordre"])
    return nature, out


# =====================================================================
# Garde-fous de libellés (ce qui casserait la lecture de l'importeur)
# =====================================================================


def assainir_libelles_definitif(plan: dict, j: Journal):
    """Titres et désignations que l'import du PF définitif lirait mal."""
    pre = f"Scénario {plan['ordre']}" if plan.get("_plusieurs") else "PF"
    for lot in plan["lots"]:
        t = lot["titre"]
        if "(" in t or ")" in t:
            nouveau = " ".join(t.replace("(", "- ").replace(")", " ").split())
            j.av(f"{pre} : titre du lot {lot['numero']} « {t} » écrit « {nouveau} » (une parenthèse serait lue comme le nom de l'entreprise).")
            lot["titre"] = nouveau
        if lot.get("entreprise") and ("(" in lot["entreprise"] or ")" in lot["entreprise"]):
            lot["entreprise"] = " ".join(lot["entreprise"].replace("(", " ").replace(")", " ").split())
        for l in lot["lignes"]:
            d = l["designation"]
            if re.search(r"€\s*ht", d, re.I):
                nouveau = re.sub(r"€\s*(ht)", r"euros \1", d, flags=re.I)
                j.av(f"{pre} : lot {lot['numero']}, désignation « {d} » écrite « {nouveau} » (« € HT » fait ignorer la ligne à l'import).")
                l["designation"] = nouveau
            if norm(l["designation"]) == "total ht":
                l["designation"] = "Total HT (ligne de devis)"
                j.av(f"{pre} : lot {lot['numero']}, une ligne s'appelait « Total HT » : renommée « Total HT (ligne de devis) » (sinon l'import s'arrêterait là).")


# =====================================================================
# Format « PF définitif » (export du logiciel : exportPlanDefinitif.ts)
# =====================================================================

VARIANTE_TITRE = {
    "collectif": "ECO PTZ COLLECTIF",
    "collectifSansAvance": "ECO PTZ COLLECTIF SANS AVANCE DE SUBVENTIONS",
    "individuel": "ECO PTZ INDIVIDUEL",
}
VARIANTE_ONGLET = {
    "collectif": "PF définitif Eco PTZ collectif",
    "collectifSansAvance": "PF définitif sans avance",
    "individuel": "PF définitif Eco PTZ individuel",
}


def lignes_pf_definitif(plan: dict, r: dict, variante: str) -> list[list]:
    """Lignes [A, B, C, D, E, F] d'un onglet « PF définitif … » (mêmes libellés que l'export du logiciel)."""
    infos, params = plan["infos"], plan["params"]
    rows: list[list] = []

    def push(a=None, b=None, c=None, d=None, e=None, f=None):
        rows.append([a, b, c, d, e, f])

    avec_cles = any(l.get("cleRepartition") for lot in plan["lots"] for l in lot["lignes"]) or any(l.get("cleRepartition") for l in plan["moe"]) or any(a.get("cleRepartition") for a in plan["aides"])

    push(None, f"PLAN DE FINANCEMENT DEFINITIF {infos['nomCopro'].upper()} - {VARIANTE_TITRE[variante]}")
    push()
    push(None, "Nom de la copropriété :", None, infos["nomCopro"])
    push(None, "Adresse de l'immeuble :", None, infos["adresse"])
    push(None, "Nombre de logements principaux :", None, infos["nbLogements"])
    push(None, "Nombre de logt + équivalent :", None, infos["nbLogementsEquiv"], "La surface des locaux tertiaires est divisée par 75 pour avoir l'équivalent logement")
    push(None, "Surface habitable ou équivalent :", None, infos["surfaceHabitable"], "La surface chauffée des locaux tertiaires doit être additionnée à la surface habitable")
    push(None, "Nombre d'étages :", None, infos["nbEtages"])
    push(None, "Nombre d'entrées :", None, infos["nbEntrees"])
    push(None, "Type de chauffage :", None, infos["typeChauffage"])
    push(None, "Consommation énergie primaire initial", None, infos["cepInitial"])
    push(None, "Consommation énergie primaire projet", None, infos["cepProjet"])
    push(None, "Performance du scénario :", None, r["performancePct"], "% d'économie d'énergie")
    push(None, "Dispositif CLIMAXION :", None, "Oui" if infos["dispositifClimaxion"] else "Non")
    if infos["etiquetteInitiale"] and infos["etiquetteProjet"]:
        push(None, "Etiquette énergétique :", None, f"De {infos['etiquetteInitiale']} à {infos['etiquetteProjet']}")
    push()
    push()

    push(None, "Descriptif des travaux", None, "Scénario 1", "Commentaires", "Total TTC")
    for lot in r["lots"]:
        push(f"Lot {lot['numero']}", lot["titre"], None, lot["totalHtApresRemise"], f"{lot['titre']} ({lot['entreprise']})" if lot.get("entreprise") else lot["titre"], lot["totalTtc"])
    push(None, "TOTAL TRAVAUX HT €", None, r["totalTravauxHt"])
    push(None, "Total travaux HT énergétiques et induits", None, r["assietteMprTravaux"], f"Travaux retenus MaPrimeRénov' plafonnés à {fmt_nombre(params['plafondTravauxParLogement'])} € HT par logement")
    push(None, "Total travaux TTC €", None, r["totalTravauxTtc"])
    push(None, f"Total travaux TTC € y compris imprévus {fmt_taux(params['imprevusPct'])}%", None, r["totalTravauxTtcImprevus"])
    push()
    push()

    push(None, "MOE et frais annexes", None, "Scénario 1", None, "Clé de répartition" if avec_cles else None)
    for ph, label in PHASES_MOE:
        first = True
        for i, l in enumerate(plan["moe"]):
            if l["phase"] != ph:
                continue
            push(label.replace(" ", "", 1) if first else None, l["designation"], None, r["moe"][i]["montantTtc"], commentaire_moe(l), l.get("cleRepartition") if avec_cles else None)
            first = False
    push(None, "Total MOE et annexes TTC", None, r["totalMoeTtc"])
    push(None, "Total de toutes les phases de l'opération TTC avec imprévus", None, r["totalOperationTtc"])
    push(None, f"Total restant en phase travaux TTC y compris imprévus {fmt_taux(params['imprevusPct'])}%", None, r["totalOperationTtc"])
    push()
    push()

    push(None, "Aides mobilisables", None, "Scénario 1", "Commentaires", "Clé de répartition" if avec_cles else None)
    dernier = ""
    for i, a in enumerate(r["aides"]):
        push(a["groupe"] if a["groupe"] != dernier else None, a["libelle"], None, a["montant"], plan["aides"][i].get("commentaire"), plan["aides"][i].get("cleRepartition") if avec_cles else None)
        dernier = a["groupe"]
    push(None, "Total Aides NET", None, r["totalAides"])
    push(None, "Total aides publiques", None, r["totalAidesPubliques"])
    if variante == "individuel":
        push(None, f"{fmt_taux(params['pctAvanceAides'])}% des aides publiques", None, r["individuel"]["aidesAvancees"])
        push(None, f"{fmt_taux(100 - params['pctAvanceAides'])}% des aides publiques", None, r["individuel"]["aidesFinChantier"])
    push()
    push()

    T = params["totalTantiemes"]
    duree = js_nombre(params["dureeEcoPtzAns"])
    push(None, None, None, "Scénario 1", "Commentaires")
    push(None, "Taux de couverture %", None, r["tauxCouverture"], "Pourcentage du montant de l'opération TTC couvert par les aides")
    push(None, "Fonds travaux disponible", None, params["fondsTravaux"], params.get("commentaireFondsTravaux"))
    push(None, "Reste à charge définitif collectif", None, r["resteACharge"])
    if variante in ("collectif", "collectifSansAvance"):
        sans = variante == "collectifSansAvance"
        v = r["collectifSansAvance"] if sans else r["collectif"]
        push(None, "Reste à financer", None, v["resteAFinancer"])
        push()
        push(None, "Coût au tantième avant aides", T, r["coutTantiemeAvant"])
        push(None, "Coût au tantième après déduction des aides publiques, montants déjà appelés et fonds travaux", T, v["coutTantiemeApres"])
        push()
        push(None, "Quote part avant déduction des aides")
        for e in v["exemples"]:
            push(None, f"Quote part pour un appartement de ({js_nombre(e['tantiemes'])}/{js_nombre(T)})", e["tantiemes"], e["quotePartAvant"])
        push()
        push(None, "Reste à financer après déduction des aides publiques")
        for e in v["exemples"]:
            push(None, f"Reste à financer pour un appartement de ({js_nombre(e['tantiemes'])}/{js_nombre(T)})", e["tantiemes"], e["resteAFinancer"])
        push()
        push("Exemples", f"Mensualité ECO PTZ pour une durée de {duree} ans")
        for e in v["exemples"]:
            push(None, f"Mensualité ECO PTZ pour ({js_nombre(e['tantiemes'])}/{js_nombre(T)}) pour une durée de {duree} ans", e["tantiemes"], e["mensualiteEcoPtz"], "Exemple pris pour un prêt collectif Eco PTZ")
        push()
        push("Exemples", "Montant des subventions publiques")
        for e in v["exemples"]:
            push(None, f"Montant des subventions publiques pour {js_nombre(e['tantiemes'])} tantièmes", e["tantiemes"], e["subventionsPubliques"], "Subventions perçues directement par la copropriété, sans prêt d'avance" if sans else None)
        push()
        if not sans:
            push("Exemples", "Le coût du prêt avance de subventions publiques")
            for e in r["collectif"]["exemples"]:
                push(None, f"Le coût du prêt avance de subventions publiques : ({js_nombre(e['tantiemes'])}/{js_nombre(T)})", e["tantiemes"], e["coutPretAvance"], "Prêt avance de subventions publiques : à payer en une fois à la fin des travaux")
            push()
        push("Exemples", "La prime des CEE")
        for e in v["exemples"]:
            push(None, f"La prime des CEE : ({js_nombre(e['tantiemes'])}/{js_nombre(T)})", e["tantiemes"], e["primeCee"], "La prime CEE est attribuée à la fin des travaux")
        push()
        push(None, "Récapitulatif")
        for e in v["exemples"]:
            push(
                "Exemples",
                f"Prix de revient de l'opération pour {js_nombre(e['tantiemes'])} tantièmes",
                e["tantiemes"],
                e["prixRevient"],
                "Prix de revient : Reste à financer - Prime CEE (sans prêt d'avance de subventions)" if sans else "Prix de revient : Reste à financer + Coût du prêt avance de subvention - Prime CEE",
            )
    else:
        pct = fmt_taux(params["pctAvanceAides"])
        ind = r["individuel"]
        push(None, f"Appels de fonds avec déduction de {pct}% des aides", None, ind["appelsFonds"])
        push()
        push(None, "Coût au tantième avant aides", T, r["coutTantiemeAvant"])
        push(None, "Coût au tantième après déduction des aides, montants déjà appelés et fonds travaux", T, ind["coutTantiemeApresAides"])
        push(None, f"Coût au tantième avec {pct}% des aides publiques déduites, montants déjà versés et fonds travaux", T, ind["coutTantiemeAvecAvance"])
        push()
        push(None, "Quote part avant déduction des aides")
        for e in ind["exemples"]:
            push(None, f"Quote part pour un appartement de ({js_nombre(e['tantiemes'])}/{js_nombre(T)})", e["tantiemes"], e["quotePartAvant"])
        push()
        push(None, "Prix de revient après déduction des aides")
        for e in ind["exemples"]:
            push(None, f"Prix de revient pour un appartement de ({js_nombre(e['tantiemes'])}/{js_nombre(T)})", e["tantiemes"], e["prixRevient"])
        push()
        push(None, f"Appels de fonds avec déduction de {pct}% des aides selon tantièmes", None, None, f"Remboursement de {fmt_taux(100 - params['pctAvanceAides'])}% des aides en fin de chantier")
        for e in ind["exemples"]:
            push("Exemples", f"Appels de fonds avec déduction de {pct}% pour ({js_nombre(e['tantiemes'])}/{js_nombre(T)})", e["tantiemes"], e["appelsFonds"], e["remboursementFinChantier"])
        push()
        push("Exemples", f"Remboursement mensuel moyen par lot pendant {duree} ans")
        for e in ind["exemples"]:
            push(None, f"Remboursement mensuel moyen par lot pendant {duree} ans : ({js_nombre(e['tantiemes'])}/{js_nombre(T)})", e["tantiemes"], e["mensualiteEcoPtz"], "Exemple pris pour un prêt ECO PTZ individuel")
    push()
    push()
    push("Garde-fous")
    for g in r["gardeFous"]:
        push(None, g["libelle"], None, g["valeur"], "OK" if g["ok"] else "DÉPASSEMENT")
    push()
    push(None, "Les valeurs sont présentées à titre indicatif. Ce document n'a aucune valeur contractuelle.")
    push(None, "Document confidentiel à l'attention des copropriétaires.")
    push()
    push(None, "CEE : Certificat d'économie d'énergie")
    push(None, "ANAH : Agence nationale de l'habitat")
    push(None, "Climaxion : Dispositif aide région Grand Est")
    push(None, "EMS : Dispositif aide Eurométropole de Strasbourg")
    return rows


def commentaire_moe(l: dict):
    """Commentaire de la ligne MOE ; l'entreprise y est ajoutée si elle n'y figure pas (l'import ne lit pas le champ entreprise)."""
    com = l.get("commentaire") or ""
    ent = l.get("entreprise")
    if ent and norm(ent) not in norm(com):
        com = f"{com} ({ent})" if com else ent
    return com or None


def lignes_lot(lot: dict, rl: dict, avec_cles: bool) -> list[list]:
    rows = [[None, f"Lot {lot['numero']:02d} : {lot['titre']}" + (f" ({lot['entreprise']})" if lot.get("entreprise") else ""), "Retenu", "Scénario", None, "Clé de répartition" if avec_cles else None]]
    rows.append([None, None, None, "€ HT", None, None])
    for l in lot["lignes"]:
        rows.append([l.get("groupe"), l["designation"], "oui" if l["retenu"] else "non", l["montantHt"], f"TVA de {fmt_taux(l['tvaPct'])}%", l.get("cleRepartition") if avec_cles else None])
    rows.append([None, "Total HT", None, rl["totalHt"], None, None])
    if lot["remisePct"] > 0:
        rows.append([None, f"Remise {fmt_taux(lot['remisePct'])}%", None, rl["remise"], None, None])
        rows.append([None, "Total HT avec remise", None, rl["totalHtApresRemise"], None, None])
        rows.append([None, "Total HT retenu avec remise", None, rl["totalHtRetenu"], None, None])
    else:
        rows.append([None, "Total HT retenu", None, rl["totalHtRetenu"], None, None])
    for t in rl["tvaParTaux"]:
        rows.append([None, f"TVA {fmt_taux(t['taux'])}%", None, t["montant"], None, None])
    rows.append([None, "Total TTC", None, rl["totalTtc"], None, None])
    return rows


def ecrire_lignes(ws, rows: list[list], largeurs: list[float], montants_cols=(3, 5), gras_col_b: set[str] | None = None):
    for c, w in enumerate(largeurs):
        ws.largeurs[c] = w
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            if v is None:
                continue
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                ws.ecrire(r, c, v, style=MONTANT if c in montants_cols else NORMAL)
            else:
                gras = c == 1 and gras_col_b is not None and norm(v) in gras_col_b
                ws.ecrire(r, c, v, style=GRAS if (gras or (r == 0 and c in (0, 1))) else NORMAL)


GRAS_DEFINITIF = {norm(x) for x in ("Descriptif des travaux", "MOE et frais annexes", "Aides mobilisables", "TOTAL TRAVAUX HT €", "Total MOE et annexes TTC", "Total Aides NET", "Reste à charge définitif collectif", "Reste à financer")}


def variantes_definitif(plan: dict) -> list[str]:
    v = [k for k in ("collectif", "collectifSansAvance", "individuel") if plan["variantes"].get(k)]
    return v or ["collectif"]


def ecrire_definitif(plan: dict, r: dict, chemin: str) -> dict:
    """Écrit le classeur et renvoie les lignes écrites (pour la relecture simulée)."""
    wb = Classeur()
    onglets = {}
    for v in variantes_definitif(plan):
        rows = lignes_pf_definitif(plan, r, v)
        ws = wb.feuille(VARIANTE_ONGLET[v])
        ecrire_lignes(ws, rows, [12, 62, 8, 16, 60, 14], gras_col_b=GRAS_DEFINITIF)
        for i, row in enumerate(rows):
            if norm(row[1]) == "taux de couverture %":
                ws.ecrire(i, 3, row[3], style=POURCENT)
        onglets[v] = (ws.nom, rows)
    avec_cles = any(l.get("cleRepartition") for lot in plan["lots"] for l in lot["lignes"]) or any(l.get("cleRepartition") for l in plan["moe"]) or any(a.get("cleRepartition") for a in plan["aides"])
    lots = []
    for lot in plan["lots"]:
        rl = next(x for x in r["lots"] if x["numero"] == lot["numero"])
        rows = lignes_lot(lot, rl, avec_cles)
        ws = wb.feuille(f"Lot {lot['numero']:02d}  {lot['titre']}")
        ecrire_lignes(ws, rows, [26, 58, 8, 14, 14, 18])
        lots.append((ws.nom, rows))
    wb.enregistrer(chemin)
    return {"onglets": onglets, "lots": lots}


# ---------- relecture simulée (importPlanDefinitif.ts) ----------


def simuler_import_definitif(ecrit: dict) -> tuple[dict, list[str]]:
    """Ce que l'import du PF définitif reconstruira du classeur écrit."""
    problemes: list[str] = []
    data = completer_plan({"aides": []})
    data["params"] = {**data["params"]}
    onglets = ecrit["onglets"]
    data["variantes"] = {"collectif": "collectif" in onglets, "collectifSansAvance": "collectifSansAvance" in onglets, "individuel": "individuel" in onglets}
    main = onglets.get("collectif") or onglets.get("collectifSansAvance") or onglets.get("individuel")
    rows = main[1]

    def lib(i):
        return norm(rows[i][1]) if i < len(rows) else ""

    def find(includes, start=0):
        for i in range(max(start, 0), len(rows)):
            if includes in lib(i):
                return i
        return -1

    def num(v):
        return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

    def valD(includes):
        i = find(includes)
        return num(rows[i][3]) if i >= 0 else None

    def info(label):
        i = find(label)
        return rows[i][3] if i >= 0 else None

    # lots
    for nom, lr in ecrit["lots"]:
        titre1 = texte(lr[0][1])
        m = re.search(r"lot\s*0?(\d+)", titre1, re.I) or re.search(r"lot\s*0?(\d+)", nom, re.I)
        if not m:
            problemes.append(f"Onglet « {nom} » : numéro de lot illisible.")
            continue
        mt = re.match(r"^lot\s*\d+\s*:\s*([^(]+?)\s*(?:\(([^)]+)\))?\s*$", titre1, re.I)
        lot = {"numero": int(m.group(1)), "titre": mt.group(1).strip() if mt else re.sub(r"^lot\s*\d+\s*", "", nom, flags=re.I).strip(), "remisePct": 0, "lignes": []}
        if mt and mt.group(2):
            lot["entreprise"] = mt.group(2).strip()
        i_total = -1
        for i in range(1, len(lr)):
            if norm(lr[i][1]) == "total ht":
                i_total = i
                break
            d = texte(lr[i][1])
            mnt = num(lr[i][3])
            if not d or mnt is None or re.search(r"€\s*ht", d, re.I):
                continue
            rr = norm(lr[i][2])
            if rr not in ("oui", "non", ""):
                continue
            tva = parse_tva(texte(lr[i][4]))
            ligne = {"designation": d, "retenu": rr == "oui", "montantHt": mnt, "tvaPct": tva if tva is not None else (5.5 if rr == "oui" else 10)}
            if lr[i][0]:
                ligne["groupe"] = lr[i][0]
            lot["lignes"].append(ligne)
        for i in range(max(i_total, 0), len(lr)):
            mr = re.match(r"^remise\s*([\d]+(?:[.,]\d+)?)\s*%", norm(lr[i][1]))
            if mr:
                lot["remisePct"] = float(mr.group(1).replace(",", "."))
        data["lots"].append(lot)
    data["lots"].sort(key=lambda l: l["numero"])

    inf = data["infos"]
    inf["nomCopro"] = texte(info("nom de la copropriete"))
    inf["adresse"] = texte(info("adresse de l'immeuble"))
    inf["nbLogements"] = num(info("logements principaux")) or 0
    v = num(info("logt + equivalent"))
    inf["nbLogementsEquiv"] = v if v is not None else inf["nbLogements"]
    inf["surfaceHabitable"] = num(info("surface habitable")) or 0
    inf["nbEtages"] = num(info("nombre d'etages")) or 0
    inf["nbEntrees"] = num(info("nombre d'entrees")) or 0
    inf["typeChauffage"] = texte(info("type de chauffage"))
    inf["cepInitial"] = num(info("energie primaire initial")) or 0
    inf["cepProjet"] = num(info("energie primaire projet")) or 0
    inf["dispositifClimaxion"] = norm(info("dispositif climaxion")) == "oui"
    me = re.search(r"de\s+(\S+)\s+a\s+(\S+)", norm(info("etiquette energetique")))
    if me:
        inf["etiquetteInitiale"], inf["etiquetteProjet"] = me.group(1).upper(), me.group(2).upper()

    travaux_ht = valD("total travaux ht") or 0
    travaux_ttc = valD("total travaux ttc") or 0

    i_moe = find("moe et frais annexes")
    i_moe_fin = find("total moe", i_moe + 1)
    if i_moe >= 0 and i_moe_fin > i_moe:
        phase = "etude"
        for i in range(i_moe + 1, i_moe_fin):
            a = norm(rows[i][0])
            for motif, ph in (("etude", "etude"), ("projet", "projet"), ("travaux", "travaux")):
                if a and motif in a:
                    phase = ph
            d = texte(rows[i][1])
            ttc = num(rows[i][3])
            if not d or ttc is None:
                continue
            cls = classify_moe(d, ttc, travaux_ht, travaux_ttc)
            ligne = {"designation": d, "phase": phase, **{k: cls[k] for k in ("montant", "tvaPct", "eligibleMprEtudes", "eligibleMprAmo")}, "_reconnue": cls["reconnue"]}
            if rows[i][4]:
                ligne["commentaire"] = rows[i][4]
            data["moe"].append(ligne)
    else:
        problemes.append("Section « MOE et frais annexes » introuvable à la relecture.")

    i_aides = find("aides mobilisables")
    i_aides_fin = find("total aides", i_aides + 1)
    valeurs = []
    if i_aides >= 0 and i_aides_fin > i_aides:
        groupe = ""
        for i in range(i_aides + 1, i_aides_fin):
            if rows[i][0]:
                groupe = texte(rows[i][0])
            l = texte(rows[i][1])
            if not l or norm(l) == "scenario 1":
                continue
            val = num(rows[i][3])
            a = classify_aide(groupe, l, val)
            if rows[i][4]:
                a["commentaire"] = rows[i][4]
            data["aides"].append(a)
            valeurs.append(val)
    else:
        problemes.append("Section « Aides mobilisables » introuvable à la relecture.")

    p = data["params"]
    i_imp = find("y compris imprevus")
    if i_imp >= 0:
        mi = re.search(r"imprevus\s*(\d+(?:[.,]\d+)?)\s*%", lib(i_imp))
        if mi:
            p["imprevusPct"] = float(mi.group(1).replace(",", "."))
    i_fonds = find("fonds travaux")
    if i_fonds >= 0:
        p["fondsTravaux"] = num(rows[i_fonds][3]) or 0
        if rows[i_fonds][4]:
            p["commentaireFondsTravaux"] = rows[i_fonds][4]
    i_tant = find("cout au tantieme avant")
    if i_tant >= 0:
        p["totalTantiemes"] = num(rows[i_tant][2]) or 10000
    exemples = set()
    for i in range(len(rows)):
        b = lib(i)
        if re.search(r"(quote part|reste a financer|mensualite|appels de fonds|prix de revient)", b):
            t = num(rows[i][2])
            if t is not None and 0 < t < (p["totalTantiemes"] or 10000):
                exemples.add(t)
        md = re.search(r"(?:duree de|pendant)\s*(\d+)\s*ans", b)
        if md:
            p["dureeEcoPtzAns"] = int(md.group(1))
    if exemples:
        p["tantiemesExemples"] = sorted(exemples)
    if "individuel" in onglets:
        for row in onglets["individuel"][1]:
            mp = re.match(r"^(\d+)\s*%\s*des aides publiques", norm(row[1]))
            if mp and int(mp.group(1)) > 50:
                p["pctAvanceAides"] = int(mp.group(1))
                break
    notes = calibrer_aides(data, valeurs)
    problemes.extend(notes)
    return data, problemes


# =====================================================================
# Format « PF estimatif » (export du logiciel : exportPlanEstimatif)
# =====================================================================


def est_lot_provisions(lot: dict) -> bool:
    return re.match(r"^provisions?$", lot["titre"].strip(), re.I) is not None


def est_ajustement_tva(l: dict) -> bool:
    return l["montantHt"] == 0 and l.get("tvaMontant") is not None


def aligner_travaux(S: list[dict]) -> list[dict]:
    rows: dict[str, dict] = {}
    for k, s in enumerate(S):
        for lot in s["lots"]:
            vus: dict[str, int] = {}
            for l in lot["lignes"]:
                if est_ajustement_tva(l):
                    continue
                base = f"{lot['numero']}|{norm(l['designation'])}"
                occ = vus.get(base, 0) + 1
                vus[base] = occ
                key = f"{base}|{occ}"
                row = rows.get(key)
                if row is None:
                    row = {
                        "key": key,
                        "lotNumero": lot["numero"],
                        "lotTitre": lot["titre"],
                        "designation": l["designation"],
                        "provisions": est_lot_provisions(lot),
                        "montants": [None] * len(S),
                        "retenus": [None] * len(S),
                        "tva": [None] * len(S),
                        "commentaire": l.get("commentaire"),
                        "titres": [None] * len(S),
                    }
                    rows[key] = row
                row["montants"][k] = (row["montants"][k] or 0) + l["montantHt"] * (1 - lot["remisePct"] / 100)
                row["retenus"][k] = l["retenu"]
                row["tva"][k] = l["tvaPct"]
                row["titres"][k] = lot["titre"]
                row["commentaire"] = row["commentaire"] or l.get("commentaire")
    return sorted(rows.values(), key=lambda t: (t["provisions"], t["lotNumero"]))


def aligner_moe(S: list[dict]) -> list[dict]:
    rows: dict[str, dict] = {}
    ordre: list[str] = []
    for k, s in enumerate(S):
        vus: dict[str, int] = {}
        precedente = None
        for i, l in enumerate(s["moe"]):
            base = f"{l['phase']}|{norm(l['designation'])}"
            occ = vus.get(base, 0) + 1
            vus[base] = occ
            key = f"{base}|{occ}"
            row = rows.get(key)
            if row is None:
                row = {"key": key, "phase": l["phase"], "designation": l["designation"], "index": [None] * len(S), "commentaire": l.get("commentaire")}
                rows[key] = row
                pos = 0 if precedente is None else ordre.index(precedente) + 1
                ordre.insert(pos, key)
            row["index"][k] = i
            precedente = key
    rang = {ph: n for n, (ph, _) in enumerate(PHASES_MOE)}
    return sorted((rows[k] for k in ordre), key=lambda x: rang[x["phase"]])


def aligner_aides(S: list[dict]) -> list[dict]:
    rows: dict[str, dict] = {}
    ordre: list[str] = []
    for k, s in enumerate(S):
        for i, a in enumerate(s["aides"]):
            key = a.get("id") or norm(a["libelle"])
            row = rows.get(key)
            if row is None:
                row = {"key": key, "groupe": a["groupe"], "libelle": a["libelle"], "index": [None] * len(S), "commentaire": a.get("commentaire")}
                rows[key] = row
                ordre.append(key)
            row["index"][k] = i
    return [rows[k] for k in ordre]


def ecrire_estimatif(S: list[dict], R: list[dict], chemin: str, j: Journal) -> dict:
    """Port de exportPlanEstimatif (src/lib/finance/planEstimatif.ts), relu à l'identique par l'import."""
    d0 = S[0]
    cD = 3
    cols = [cD + k for k in range(len(S))]
    cCom = cD + len(S)
    wb = Classeur()
    ws = wb.feuille(f"PF estimatif {d0['infos']['nomCopro']}")
    etat = {"row": 0}
    libelles_b: dict[int, str] = {}

    def setc(r, c, v, f=None, style=None):
        if v is None and f is None:
            return
        ws.ecrire(r, c, v, f, style)

    def ligne(b, par_scenario=None, com=None, a=None, c_val=None, style_b=None, style_v=None):
        r = etat["row"]
        etat["row"] += 1
        if a:
            setc(r, 0, a, style=GRAS)
        if b:
            setc(r, 1, b, style=style_b if style_b is not None else NORMAL)
            libelles_b[r] = b
        if c_val is not None:
            setc(r, 2, c_val, style=NORMAL)
        if par_scenario:
            for k in range(len(S)):
                x = par_scenario(k, r)
                if x:
                    setc(r, cols[k], x.get("v"), x.get("f"), style_v)
        if com:
            setc(r, cCom, com)
        return r

    def vide(n=1):
        etat["row"] += n

    def R_(k, c):
        return ref(cols[k], c)

    def pareil(vals):
        return all(v == vals[0] for v in vals)

    nom = d0["infos"]["nomCopro"]
    setc(0, 0, f"PLAN DE FINANCEMENT ESTIMATIF {nom}".strip(), style=GRAS)
    etat["row"] = 1
    vide()
    ligne("Nom de la copropriété :", lambda k, r: {"v": nom} if k == 0 else None)
    ligne("Adresse de l'immeuble :", lambda k, r: {"v": d0["infos"]["adresse"]} if k == 0 and d0["infos"]["adresse"] else None)
    rLogts = ligne("Nombre de logements principaux :", lambda k, r: {"v": S[k]["infos"]["nbLogements"]}, style_v=NORMAL)
    rEquiv = ligne("Nombre de logt + équivalent :", lambda k, r: {"v": S[k]["infos"]["nbLogementsEquiv"]}, "La surface des locaux tertiaires est divisée par 75 pour avoir l'équivalent logement", style_v=NORMAL)
    rSurface = ligne("Surface habitable ou équivalent :", lambda k, r: {"v": S[k]["infos"]["surfaceHabitable"]}, "La surface chauffée des locaux tertiaires doit être additionnée à la surface habitable", style_v=NORMAL)
    ligne("Nombre de niveaux y compris sous-sol :", lambda k, r: {"v": S[k]["infos"]["nbEtages"]}, style_v=NORMAL)
    ligne("Nombre d'entrées :", lambda k, r: {"v": S[k]["infos"]["nbEntrees"]}, style_v=NORMAL)
    ligne("Type de chauffage :", lambda k, r: {"v": S[k]["infos"]["typeChauffage"]} if S[k]["infos"]["typeChauffage"] else None)
    rCepI = ligne("Consommation énergie primaire initial :", lambda k, r: {"v": S[k]["infos"]["cepInitial"]}, style_v=NORMAL)
    rCepP = ligne("Consommation énergie primaire projet :", lambda k, r: {"v": S[k]["infos"]["cepProjet"]}, style_v=NORMAL)
    ligne(
        "Performance du scénario :",
        lambda k, r: {"v": R[k]["performancePct"], "f": f"100-100*{R_(k, rCepP)}/{R_(k, rCepI)}"} if S[k]["infos"]["cepInitial"] > 0 else {"v": 0},
        "% d'économie d'énergie",
    )
    ligne("Dispositif CLIMAXION :", lambda k, r: {"v": "Oui" if S[k]["infos"]["dispositifClimaxion"] else "Non"})
    ligne(
        "Passage d'étiquette :",
        lambda k, r: {"v": f"De {S[k]['infos']['etiquetteInitiale']} à {S[k]['infos']['etiquetteProjet']}"} if S[k]["infos"]["etiquetteInitiale"] and S[k]["infos"]["etiquetteProjet"] else None,
    )
    vide(2)

    # ---- descriptif des travaux
    rHead = ligne("Descriptif des travaux", lambda k, r: {"v": f"Scénario {S[k]['ordre']}"}, style_b=GRAS)
    ligne(None, lambda k, r: {"v": S[k]["libelle"]} if S[k]["libelle"] else None)
    travaux = aligner_travaux(S)
    if travaux and all(t["provisions"] for t in travaux):
        j.err("PF estimatif : aucune ligne de travaux dans un lot numéroté (seulement des provisions). Donner un numéro de lot aux travaux.")
    sans_formule_ttc = [any(l["remisePct"] != 0 or any(x.get("tvaMontant") is not None for x in l["lignes"]) for l in s["lots"]) for s in S]
    rTravaux: list[int] = []
    retenus_par_sc: list[list[int]] = [[] for _ in S]
    for t in travaux:
        tvas = [x for x in t["tva"] if x is not None]
        meme_tva = bool(tvas) and all(x == tvas[0] for x in tvas)
        tva_com = tvas[0] if meme_tva and tvas[0] != TVA_TRAVAUX_DEFAUT else None
        if tvas and not meme_tva:
            for k, x in enumerate(t["tva"]):
                if x is not None and sans_formule_ttc[k] and x != TVA_TRAVAUX_DEFAUT:
                    j.av(
                        f"Scénario {S[k]['ordre']} : « {t['designation']} » à {fmt_taux(x)} % de TVA (autre taux dans un autre scénario) - "
                        "relue à 5,5 % car ce scénario a une remise ou une TVA saisie ; le TTC reste calé par une ligne d'ajustement."
                    )
        titres = {x for x in t["titres"] if x is not None}
        if len(titres) > 1:
            j.av(f"Lot {t['lotNumero']} : titres différents selon les scénarios ({' / '.join(sorted(titres))}) - le logiciel gardera « {t['lotTitre']} ».")
        com = " - ".join(x for x in [t["commentaire"] or t["designation"], f"TVA de {fmt_taux(tva_com)}%" if tva_com is not None else None] if x)
        numero = f"Lot {t['lotNumero']:02d}"
        a = None if t["provisions"] else (f"{numero} - {t['lotTitre']}" if t["lotTitre"] != t["designation"] else numero)
        r = ligne(t["designation"], lambda k, r, t=t: {"v": t["montants"][k]} if t["montants"][k] is not None else None, com, a)
        rTravaux.append(r)
        for k, x in enumerate(t["retenus"]):
            if x:
                retenus_par_sc[k].append(r)
    r1 = rTravaux[0] if rTravaux else etat["row"]
    rN = rTravaux[-1] if rTravaux else etat["row"]
    rHt = ligne("Total travaux HT €", lambda k, r: {"v": R[k]["totalTravauxHt"], "f": f"SUM({R_(k, r1)}:{R_(k, rN)})" if rTravaux else None}, style_b=GRAS, style_v=MONTANT_GRAS)
    plafonne = [x["travauxRetenusHt"] > x["assietteMprTravaux"] + 0.005 for x in R]

    def retenu(k, r):
        refs = "+".join(R_(k, x) for x in retenus_par_sc[k])
        if not refs:
            return {"v": 0}
        if plafonne[k]:
            # Plafond dans la ligne elle-même : l'import contrôle cette ligne contre
            # l'assiette plafonnée, et en relit les lignes retenues (références)
            P = js_nombre(S[k]["params"]["plafondTravauxParLogement"])
            return {"v": R[k]["assietteMprTravaux"], "f": f"MIN({refs},{P}*{R_(k, rLogts)})"}
        return {"v": R[k]["travauxRetenusHt"], "f": refs}

    rRetenu = ligne(
        "Total travaux HT retenu",
        retenu,
        f"Pour le calcul MPR (plafonné à {fmt_nombre(d0['params']['plafondTravauxParLogement'])} € HT par logement)" if any(plafonne) else "Pour le calcul MPR",
    )

    def formule_ttc(k):
        if sans_formule_ttc[k]:
            return None
        par_taux: dict[float, list[str]] = {}
        for i, t in enumerate(travaux):
            tva = t["tva"][k]
            if t["montants"][k] is None or tva is None:
                continue
            par_taux.setdefault(tva, []).append(R_(k, rTravaux[i]))
        if not par_taux:
            return None
        return "+".join(f"({'+'.join(refs)})" + (f"*{js_nombre(coef_tva(tva))}" if tva else "") for tva, refs in par_taux.items())

    rTtc = ligne("TOTAL TRAVAUX TTC €", lambda k, r: {"v": R[k]["totalTravauxTtc"], "f": formule_ttc(k)}, style_b=GRAS, style_v=MONTANT_GRAS)
    imprevus = [s["params"]["imprevusPct"] for s in S]
    rTtcImp = ligne(
        f"Total TTC € avec imprévus {fmt_taux(imprevus[0]) if pareil(imprevus) else 'N'} %",
        lambda k, r: {"v": R[k]["totalTravauxTtcImprevus"], "f": f"{R_(k, rTtc)}*{js_nombre(1 + S[k]['params']['imprevusPct'] / 100)}"},
    )
    vide(3)

    # ---- MOE
    rMoeHead = ligne("MOE et frais annexes", lambda k, r: {"v": f"Scénario {S[k]['ordre']}"}, style_b=GRAS)
    moe = aligner_moe(S)
    rMoe: list[int] = []
    etudes_sc: list[list[tuple[int, float]]] = [[] for _ in S]
    amo_sc: list[list[tuple[int, float]]] = [[] for _ in S]
    phase_prec = None
    labels_phase = dict(PHASES_MOE)
    for m in moe:
        a = re.sub(r"\.\s*", ".", labels_phase[m["phase"]], count=1) if m["phase"] != phase_prec else None
        phase_prec = m["phase"]

        def val(k, r, m=m):
            i = m["index"][k]
            if i is None:
                return None
            l = S[k]["moe"][i]
            coef = js_nombre(1 + l["tvaPct"] / 100)
            v = R[k]["moe"][i]["montantTtc"]
            mm = l["montant"]
            if mm["mode"] == "forfait":
                # TVA nulle écrite « *1 » : relue comme forfait à 0 % (sans suffixe, l'import supposerait la TVA du libellé)
                return {"v": v, "f": f"{js_nombre(round2(mm['montantHt']))}*{coef}"}
            if mm["mode"] == "pctTravauxHt":
                return {"v": v, "f": f"({R_(k, rHt)}*{js_nombre(mm['taux'])}/100)" + (f"*{coef}" if l["tvaPct"] else "")}
            return {"v": v, "f": f"{R_(k, rTtc)}*{js_nombre(mm['taux'])}/100" + (f"*{coef}" if l["tvaPct"] else "")}

        com = m["commentaire"]
        ents = {S[k]["moe"][i].get("entreprise") for k, i in enumerate(m["index"]) if i is not None} - {None}
        for ent in ents:
            if norm(ent) not in norm(com or ""):
                com = f"{com} ({ent})" if com else ent
        r = ligne(m["designation"], val, com, a)
        rMoe.append(r)
        for k, i in enumerate(m["index"]):
            if i is None:
                continue
            l = S[k]["moe"][i]
            if l["eligibleMprEtudes"]:
                etudes_sc[k].append((r, 1 + l["tvaPct"] / 100))
            if l["eligibleMprAmo"]:
                amo_sc[k].append((r, 1 + l["tvaPct"] / 100))
    rMoeTotal = ligne(
        "Total MOE et annexes TTC",
        lambda k, r: {"v": R[k]["totalMoeTtc"], "f": f"SUM({R_(k, rMoe[0])}:{R_(k, rMoe[-1])})" if rMoe else None},
        style_b=GRAS,
        style_v=MONTANT_GRAS,
    )
    ligne("Total opération TTC sans imprévus", lambda k, r: {"v": R[k]["totalMoeTtc"] + R[k]["totalTravauxTtc"], "f": f"{R_(k, rMoeTotal)}+{R_(k, rTtc)}"})
    rOp = ligne("Total opération TTC avec imprévus", lambda k, r: {"v": R[k]["totalOperationTtc"], "f": f"{R_(k, rMoeTotal)}+{R_(k, rTtcImp)}"}, style_b=GRAS, style_v=MONTANT_GRAS)
    vide(3)

    # ---- aides
    rAidesHead = ligne("Aides mobilisables", lambda k, r: {"v": f"Scénario {S[k]['ordre']}"}, "Commentaires", style_b=GRAS)

    def somme_ht(k, lignes):
        par_coef: dict[float, list[int]] = {}
        for r, c in lignes:
            par_coef.setdefault(c, []).append(r)
        morceaux = []
        for c, rs in par_coef.items():
            s = "+".join(R_(k, r) for r in rs)
            morceaux.append(f"({s})" if c == 1 else f"({s})/{js_nombre(c)}")
        return "+".join(morceaux)

    aides = aligner_aides(S)
    rAides: list[int] = []
    rPubliques: list[list[int]] = [[] for _ in S]
    groupe_prec = ""
    for al in aides:
        a = al["groupe"] if al["groupe"] != groupe_prec else None
        groupe_prec = al["groupe"]

        def val(k, r, al=al):
            i = al["index"][k]
            if i is None:
                return None
            d = S[k]["aides"][i]
            v = R[k]["aides"][i]["montant"]
            c = d["calcul"]
            assiette = R_(k, rRetenu)  # déjà plafonnée
            logts = lambda eq: R_(k, rEquiv if eq else rLogts)  # noqa: E731
            mode = c["mode"]
            if mode == "info":
                return None
            if mode == "manuel":
                return {"v": c["montant"]}
            if mode == "pctAssietteTravaux":
                return {"v": v, "f": f"{assiette}*{js_nombre(c['taux'] / 100)}*{js_nombre(c['coef'])}"}
            if mode == "parM2Shab":
                return {"v": v, "f": f"{R_(k, rSurface)}*{js_nombre(c['tauxEurM2'])}*{js_nombre(c['coef'])}"}
            if mode == "pctEtudes":
                if not etudes_sc[k]:
                    return {"v": v}
                return {"v": v, "f": f"({somme_ht(k, etudes_sc[k])})*{js_nombre(c['taux'] / 100)}*{js_nombre(c['coef'])}*({assiette}/{R_(k, rHt)})"}
            if mode == "pctAmo":
                if not amo_sc[k]:
                    return {"v": v}
                nb = S[k]["infos"]["nbLogements"]
                plafond_amo = (600 if nb > 20 else 1000) * nb
                if nb > 0 and R[k]["htAmo"] > plafond_amo:
                    # assiette AMO plafonnée par logement (plafondAmoRegle), comme le moteur
                    return {"v": v, "f": f"MIN({somme_ht(k, amo_sc[k])},{js_nombre(600 if nb > 20 else 1000)}*{R_(k, rLogts)})*{js_nombre(c['taux'] / 100)}"}
                return {"v": v, "f": f"({somme_ht(k, amo_sc[k])})*{js_nombre(c['taux'] / 100)}"}
            if mode == "forfaitPlusParLogement":
                return {"v": v, "f": f"{js_nombre(c['base'])}+({js_nombre(c['parLogement'])})*{logts(c['surEquivalent'])}"}
            if mode == "parLogement":
                return {"v": v, "f": f"{js_nombre(c['montant'])}*{logts(c['surEquivalent'])}"}
            return None

        r = ligne(al["libelle"], val, al["commentaire"], a)
        rAides.append(r)
        for k, i in enumerate(al["index"]):
            if i is not None and S[k]["aides"][i]["publique"]:
                rPubliques[k].append(r)
    avec_cee = any(x["primeCee"] != 0 for x in R)
    rAidesTotal = ligne(
        "Total Aides NET",
        lambda k, r: {"v": R[k]["totalAides"], "f": f"SUM({R_(k, rAides[0])}:{R_(k, rAides[-1])})" if rAides else None},
        style_b=GRAS,
        style_v=MONTANT_GRAS,
    )
    rPub = (
        ligne("Total aides publiques", lambda k, r: {"v": R[k]["totalAidesPubliques"], "f": "+".join(R_(k, x) for x in rPubliques[k]) or None})
        if avec_cee
        else rAidesTotal
    )
    vide(2)

    # ---- indicateurs
    ligne(None, None, "Commentaires")
    ligne("Taux de couverture %", lambda k, r: {"v": R[k]["tauxCouverture"], "f": f"{R_(k, rAidesTotal)}/{R_(k, rOp)}"}, "Pourcentage du montant de l'opération TTC couvert par les aides", style_v=POURCENT)
    coms = [s["params"].get("commentaireFondsTravaux") or "" for s in S]
    rFonds = ligne("Fonds travaux disponible", lambda k, r: {"v": S[k]["params"]["fondsTravaux"]}, next((c for c in coms if c), None))
    rRac = ligne(
        "Reste à charge définitif collectif",
        lambda k, r: {"v": R[k]["resteACharge"], "f": f"{R_(k, rOp)}-({R_(k, rAidesTotal)}+{R_(k, rFonds)})"},
        style_b=GRAS,
        style_v=MONTANT_GRAS,
    )
    rRaf = (
        ligne(
            "Reste à financer",
            lambda k, r: {"v": R[k]["collectif"]["resteAFinancer"], "f": f"{R_(k, rRac)}+({R_(k, rAidesTotal)}-{R_(k, rPub)})"},
            "Reste à charge + prime CEE (versée en fin de travaux)",
            style_b=GRAS,
            style_v=MONTANT_GRAS,
        )
        if avec_cee
        else rRac
    )
    if any(s["variantes"].get("individuel") for s in S):
        pcts = [s["params"]["pctAvanceAides"] for s in S]
        ligne(
            f"Appels de fonds avec déduction de {fmt_taux(pcts[0]) if pareil(pcts) else 'N'}% des aides",
            lambda k, r: {"v": R[k]["individuel"]["appelsFonds"]},
            "Variante éco-PTZ individuel : aides publiques avancées en partie, le reste remboursé en fin de chantier",
        )
    vide(2)
    T = d0["params"]["totalTantiemes"] or 10000
    rCta = ligne("Coût au tantième avant aides", lambda k, r: {"v": R[k]["coutTantiemeAvant"], "f": f"{R_(k, rOp)}/$C${r + 1}"}, None, None, T)
    rCtp = ligne(
        "Coût au tantième après déduction des aides, fonds travaux et études déjà appelées",
        lambda k, r: {"v": R[k]["collectif"]["coutTantiemeApres"], "f": f"{R_(k, rRaf)}/$C${r + 1}"},
        None,
        None,
        T,
    )
    vide(2)
    ex = d0["params"]["tantiemesExemples"]

    def bloc(titre, libelle, valeur, com=None):
        if not ex:
            return
        ligne(titre, None, style_b=GRAS)
        for i, t in enumerate(ex):
            ligne(libelle(t), lambda k, r, i=i: valeur(k, i, r), com if i == 0 else None, "Exemples" if i == 0 else None, t)
        vide(2)

    bloc(
        "Quote part selon tantièmes (hors aides)",
        lambda t: f"Quote part pour {js_nombre(t)} tantièmes",
        lambda k, i, r: {"v": R[k]["collectif"]["exemples"][i]["quotePartAvant"], "f": f"{R_(k, rCta)}*$C${r + 1}"},
    )
    r_restes: dict[int, int] = {}

    def val_reste(k, i, r):
        if k == 0:
            r_restes[i] = r
        return {"v": R[k]["collectif"]["exemples"][i]["resteAFinancer"], "f": f"{R_(k, rCtp)}*$C${r + 1}"}

    bloc(
        "Reste à financer selon tantièmes (après déduction des aides publiques)" if avec_cee else "Reste à charge selon tantièmes (après déduction des aides)",
        lambda t: f"{'Reste à financer' if avec_cee else 'Reste à charge'} pour {js_nombre(t)} tantièmes",
        val_reste,
    )
    duree = js_nombre(d0["params"]["dureeEcoPtzAns"])
    mois = js_nombre(round(d0["params"]["dureeEcoPtzAns"] * 12))
    bloc(
        f"Remboursement mensuel moyen par lot pendant {duree} ans",
        lambda t: f"Remboursement mensuel moyen par lot pendant {duree} ans : ({js_nombre(t)}/{js_nombre(T)})",
        lambda k, i, r: {"v": R[k]["collectif"]["exemples"][i]["mensualiteEcoPtz"], "f": f"{R_(k, r_restes[i])}/{mois}*{js_nombre(S[k]['params']['coefAssurance'])}" if i in r_restes else None},
        f"Exemple pris pour un prêt ECO PTZ sur {duree} ans avec un prêt avance de subvention",
    )
    bloc(
        "Montant des subventions publiques",
        lambda t: f"Montant des subventions publiques pour ({js_nombre(t)}/{js_nombre(T)})",
        lambda k, i, r: {"v": R[k]["collectif"]["exemples"][i]["subventionsPubliques"], "f": f"{R_(k, rPub)}*$C${r + 1}/$C${rCta + 1}"},
    )
    if any(s["variantes"].get("collectif") for s in S):
        bloc(
            "Coût du prêt avance de subventions publiques",
            lambda t: f"Coût du prêt avance de subventions publiques pour ({js_nombre(t)}/{js_nombre(T)})",
            lambda k, i, r: {"v": R[k]["collectif"]["exemples"][i]["coutPretAvance"], "f": f"{R_(k, rPub)}*{js_nombre(S[k]['params']['tauxPretAvancePct'] / 100)}*$C${r + 1}/$C${rCta + 1}"},
            "Prêt avance de subvention : à rembourser en une fois à la fin des travaux",
        )
    if avec_cee:
        bloc(
            "Prime CEE",
            lambda t: f"Prime CEE pour ({js_nombre(t)}/{js_nombre(T)})",
            lambda k, i, r: {"v": R[k]["collectif"]["exemples"][i]["primeCee"]},
            "La prime CEE est attribuée à la fin des travaux",
        )
    for jg, gf in enumerate(R[0]["gardeFous"]):
        ligne(gf["libelle"], lambda k, r, jg=jg: {"v": R[k]["gardeFous"][jg]["valeur"]}, None, "Garde-fous" if jg == 0 else None)
    vide()
    ligne("Les valeurs sont présentées à titre indicatif. Ce document n'a aucune valeur contractuelle.")
    ligne("Document confidentiel à l'attention des copropriétaires.")
    ligne("Ne pas jeter sur la voie publique")

    for c, w in enumerate([14, 62, 9] + [18] * len(S) + [70]):
        ws.largeurs[c] = w
    wb.enregistrer(chemin)
    return {
        "libelles": libelles_b,
        "rHead": rHead,
        "rHt": rHt,
        "rRetenu": rRetenu,
        "rTtc": rTtc,
        "rTtcImp": rTtcImp,
        "rMoeHead": rMoeHead,
        "rMoeTotal": rMoeTotal,
        "rAidesHead": rAidesHead,
        "rAidesTotal": rAidesTotal,
        "rOp": rOp,
        "rLogts": rLogts,
        "rEquiv": rEquiv,
        "rSurface": rSurface,
        "rFonds": rFonds,
        "rCta": rCta,
        "travaux": travaux,
        "moe": moe,
        "aides": aides,
        "rAides": rAides,
        "etudes_sc": etudes_sc,
        "amo_sc": amo_sc,
    }


def verifier_lecture_estimatif(S: list[dict], ecrit: dict, j: Journal) -> list[str]:
    """Relecture simulée des repères de l'import estimatif (planEstimatif.ts) : chaque repère doit tomber sur sa ligne."""
    libs = ecrit["libelles"]
    n = max(libs) + 1 if libs else 0

    def lib(r):
        return norm((libs.get(r) or "").replace("€", " "))

    def trouver(test, start=0, end=None):
        for r in range(max(start, 0), n if end is None else end):
            if test(lib(r)):
                return r
        return -1

    attendu = {}
    head = trouver(lambda l: l == "descriptif des travaux")
    attendu["Descriptif des travaux"] = (head, ecrit["rHead"])
    iTotalHt = trouver(lambda l: l.startswith("total travaux ht") and "retenu" not in l and "energetique" not in l, head + 1)
    attendu["Total travaux HT"] = (iTotalHt, ecrit["rHt"])
    attendu["Total travaux HT retenu"] = (trouver(lambda l: l.startswith("total travaux ht retenu") or "energetiques et induits" in l, iTotalHt), ecrit["rRetenu"])
    attendu["Total travaux TTC"] = (trouver(lambda l: l.startswith("total travaux ttc") and "imprevus" not in l, iTotalHt), ecrit["rTtc"])
    iMoe = trouver(lambda l: l.startswith("moe et frais annexes"), iTotalHt)
    attendu["MOE et frais annexes"] = (iMoe, ecrit["rMoeHead"])
    attendu["Total TTC avec imprévus"] = (trouver(lambda l: l.startswith("total") and "ttc" in l and "imprevus" in l, iTotalHt, iMoe if iMoe >= 0 else None), ecrit["rTtcImp"])
    iMoeFin = trouver(lambda l: l.startswith("total moe"), iMoe + 1)
    attendu["Total MOE"] = (iMoeFin, ecrit["rMoeTotal"])
    iAides = trouver(lambda l: l.startswith("aides mobilisables"), max(iMoeFin, iTotalHt))
    attendu["Aides mobilisables"] = (iAides, ecrit["rAidesHead"])
    attendu["Total aides"] = (trouver(lambda l: l.startswith("total aides"), iAides + 1), ecrit["rAidesTotal"])
    attendu["Total opération avec imprévus"] = (trouver(lambda l: (l.startswith("total operation") or "toutes les phases" in l) and "avec imprevus" in l, iMoeFin if iMoeFin >= 0 else iTotalHt), ecrit["rOp"])
    attendu["Logements principaux"] = (trouver(lambda l: "logements principaux" in l, 0, head), ecrit["rLogts"])
    attendu["Logements + équivalents"] = (trouver(lambda l: "logt + equivalent" in l or "logements + equivalent" in l, 0, head), ecrit["rEquiv"])
    attendu["Surface habitable"] = (trouver(lambda l: "surface habitable" in l, 0, head), ecrit["rSurface"])
    iAidesFin = ecrit["rAidesTotal"]
    attendu["Fonds travaux"] = (trouver(lambda l: re.match(r"^(montant du )?fonds (de )?travaux", l) is not None, iAidesFin), ecrit["rFonds"])
    attendu["Coût au tantième avant aides"] = (trouver(lambda l: re.match(r"^cout au (?:tan\w*me|millieme)s? avant", l) is not None), ecrit["rCta"])
    for nom, (trouve, voulu) in attendu.items():
        if trouve != voulu:
            j.err(f"Relecture simulée : le repère « {nom} » serait lu ligne {trouve + 1} au lieu de {voulu + 1} - un libellé de travaux, de MOE ou d'aide le masque (renommer ce libellé).")

    differences: list[str] = []
    # Aide présente dans un autre scénario mais pas dans celui-ci : l'import crée une ligne informative vide
    for al in ecrit["aides"]:
        for k, i in enumerate(al["index"]):
            if i is None and len(S) > 1:
                differences.append(f"Scénario {S[k]['ordre']} : aide « {al['libelle']} » absente de ce scénario - elle apparaîtra comme ligne informative sans montant (à supprimer dans l'éditeur si besoin).")
    # Éligibilité MPR études / AMO : références de la PREMIÈRE aide « MaPrimeRénov' … études » (resp. « … AMO »)
    rAides = ecrit["rAides"]
    for k, s in enumerate(S):
        pre = f"Scénario {s['ordre']}"
        for cle, test, champ in (
            ("études", lambda l: "maprimerenov" in l and "etudes" in l, "eligibleMprEtudes"),
            ("AMO", lambda l: "maprimerenov" in l and re.search(r"\bamo\b", l) is not None, "eligibleMprAmo"),
        ):
            mode_vise = "pctEtudes" if champ == "eligibleMprEtudes" else "pctAmo"
            if not any(a["calcul"]["mode"] == mode_vise for a in s["aides"]):
                continue
            premiere = next((r for r in rAides if test(lib(r))), None)
            al = ecrit["aides"][rAides.index(premiere)] if premiere is not None else None
            i = al["index"][k] if al else None
            aide = s["aides"][i] if i is not None else None
            if aide is None or aide["calcul"]["mode"] != mode_vise:
                differences.append(
                    f"{pre} : l'aide MaPrimeRénov' {cle} doit s'appeler « MaPrimeRénov' … {cle} » (et être la première de ce nom) pour que le logiciel retrouve les lignes MOE éligibles ; à défaut, l'éligibilité sera devinée d'après le libellé des lignes MOE."
                )
        for a in s["aides"]:
            n = norm(a["libelle"])
            if a["calcul"]["mode"] == "pctAmo" and not re.search(r"\bamo\b", n):
                differences.append(f"{pre} : aide « {a['libelle']} » (MPR AMO) sans le mot « AMO » dans le libellé : son montant sera importé figé.")
            publique_lue = not (norm(a["groupe"]) == "cee" or re.search(r"\bcee\b", n))
            if publique_lue != a["publique"]:
                differences.append(
                    f"{pre} : aide « {a['libelle']} » lue comme {'publique' if publique_lue else 'privée (CEE)'} : groupe « CEE » ou mot « CEE » dans le libellé = prime privée, toute autre aide = publique."
                )
    return differences


# =====================================================================
# Rapport
# =====================================================================

CONTROLES = [
    ("totalTravauxHt", "Total travaux HT"),
    ("travauxRetenusHt", "Travaux retenus HT (avant plafond)"),
    ("assietteMprTravaux", "Assiette MaPrimeRénov' travaux (plafonnée)"),
    ("totalTravauxTtc", "Total travaux TTC"),
    ("totalTravauxTtcImprevus", "Total travaux TTC avec imprévus"),
    ("totalMoeTtc", "Total MOE et frais annexes TTC"),
    ("totalOperationTtc", "Total de l'opération TTC"),
    ("totalAides", "Total aides"),
    ("totalAidesPubliques", "Total aides publiques"),
    ("resteACharge", "Reste à charge collectif"),
    ("resteAFinancer", "Reste à financer (+ CEE)"),
    ("appelsFonds", "Appels de fonds (variante individuelle)"),
]


def valeur_resultat(r: dict, cle: str):
    if cle == "resteAFinancer":
        return r["collectif"]["resteAFinancer"]
    if cle == "appelsFonds":
        return r["individuel"]["appelsFonds"]
    return r[cle]


def section_scenario(plan: dict, r: dict, nature: str, predit: dict | None, differences: list[str]) -> list[str]:
    out = []
    titre = f"Scénario {plan['ordre']}" + (f" - {plan['libelle']}" if plan["libelle"] else "")
    out.append(f"## {titre}")
    out.append("")
    ts = plan["totaux_source"]
    out.append("### Totaux : classeur source / calcul du logiciel")
    out.append("")
    out.append("| Contrôle | Classeur source | Logiciel | Écart |")
    out.append("|---|---:|---:|---:|")
    for cle, lib in CONTROLES:
        v = valeur_resultat(r, cle)
        s = ts.get(cle)
        if s is None and cle in ("appelsFonds",) and not plan["variantes"].get("individuel"):
            continue
        if s is None:
            out.append(f"| {lib} | - | {fmt_euro(v)} | |")
        else:
            ecart = v - s
            marque = "OK" if abs(ecart) <= 1 else f"**{fmt_euro(ecart)}**"
            out.append(f"| {lib} | {fmt_euro(s)} | {fmt_euro(v)} | {marque} |")
    out.append("")

    out.append("### Aides")
    out.append("")
    out.append("| Aide | Formule du logiciel | Classeur source | Logiciel | Lue à l'import |")
    out.append("|---|---|---:|---:|---|")
    for i, a in enumerate(plan["aides"]):
        m = r["aides"][i]["montant"]
        src = a.get("montant_source")
        lu = ""
        if predit is not None:
            ap = predit["aides"][i] if i < len(predit["aides"]) else None
            if ap is None:
                lu = "**absente**"
            elif ap["calcul"]["mode"] == "manuel" and a["calcul"]["mode"] != "manuel":
                lu = "montant figé"
            elif ap["calcul"]["mode"] == a["calcul"]["mode"]:
                lu = "formule" if a["calcul"]["mode"] not in ("manuel", "info") else ("montant saisi" if a["calcul"]["mode"] == "manuel" else "informative")
            else:
                lu = decrire_calcul(ap["calcul"])
        else:
            lu = "formule" if a["calcul"]["mode"] not in ("manuel", "info") else ("montant saisi" if a["calcul"]["mode"] == "manuel" else "informative")
        ecart = "" if src is None or m is None or abs(m - src) <= 1 else " (écart)"
        out.append(f"| {a['groupe'] + ' - ' if a['groupe'] else ''}{a['libelle']}{'' if a['publique'] else ' (privée)'} | {decrire_calcul(a['calcul'])} | {fmt_euro(src) if src is not None else '-'} | {fmt_euro(m)}{ecart} | {lu} |")
    out.append("")

    # garde-fous et palier MPR
    alertes = []
    for g in r["gardeFous"]:
        if not g["ok"]:
            alertes.append(f"Garde-fou dépassé : {g['libelle']} ({fmt_nombre(g['valeur'], 2)} pour un plafond de {fmt_nombre(g['plafond'])}).")
    ci, cp = plan["infos"]["cepInitial"], plan["infos"]["cepProjet"]
    if ci > 0 and cp > 0:
        gain = 100 - 100 * cp / ci
        palier = suggest_mpr_copro_pct(gain)
        for a in plan["aides"]:
            c = a["calcul"]
            if c["mode"] != "pctAssietteTravaux" or est_bonus_mpr(a) or c["taux"] == palier:
                continue
            if palier is None:
                alertes.append(f"Aide « {a['libelle']} » à {fmt_taux(c['taux'])} % alors que le gain énergétique ({fmt_nombre(gain, 1)} %) est sous le seuil de 35 % de MaPrimeRénov' Copro.")
            else:
                alertes.append(f"Aide « {a['libelle']} » à {fmt_taux(c['taux'])} % alors que le gain énergétique ({fmt_nombre(gain, 1)} %) donne le palier à {palier} % : taux à vérifier.")
    else:
        alertes.append("Consommations d'énergie primaire (Cep) non renseignées : le logiciel affichera un gain de 0 %.")
    if alertes:
        out.append("### Alertes")
        out.append("")
        out.extend(f"- {a}" for a in alertes)
        out.append("")

    if differences:
        out.append("### À reprendre dans l'éditeur après l'import")
        out.append("")
        out.extend(f"- {d}" for d in differences)
        out.append("")
    if plan["notes"]:
        out.append("### Choix de conversion")
        out.append("")
        out.extend(f"- {n}" for n in plan["notes"])
        out.append("")
    return out


def differences_definitif(plan: dict, predit: dict, r: dict, rp: dict) -> list[str]:
    """Ce que l'import du PF définitif lira autrement que le pivot."""
    d: list[str] = []
    # MOE : mode, TVA, éligibilité devinés d'après le libellé
    for i, l in enumerate(plan["moe"]):
        if i >= len(predit["moe"]):
            d.append(f"MOE « {l['designation']} » : absente à la relecture.")
            continue
        p = predit["moe"][i]
        ecarts = []
        if p["tvaPct"] != l["tvaPct"]:
            ecarts.append(f"TVA {fmt_taux(p['tvaPct'])} % au lieu de {fmt_taux(l['tvaPct'])} %")
        if p["montant"]["mode"] != l["montant"]["mode"]:
            libm = {"forfait": "forfait", "pctTravauxHt": "% des travaux HT", "pctTravauxTtc": "% des travaux TTC"}
            ecarts.append(f"{libm[p['montant']['mode']]} au lieu de {libm[l['montant']['mode']]}")
        if p["eligibleMprEtudes"] != l["eligibleMprEtudes"]:
            ecarts.append(f"{'éligible' if p['eligibleMprEtudes'] else 'non éligible'} MPR études")
        if p["eligibleMprAmo"] != l["eligibleMprAmo"]:
            ecarts.append(f"{'éligible' if p['eligibleMprAmo'] else 'non éligible'} MPR AMO")
        if ecarts:
            d.append(f"MOE « {l['designation']} » lue {', '.join(ecarts)} (TTC inchangé) : à corriger dans l'éditeur ({decrire_moe(l)}).")
        if not p.get("_reconnue"):
            d.append(f"MOE « {l['designation']} » : libellé non reconnu par l'import (avertissement « importée en forfait TVA 20 % » attendu).")
    entreprises: dict[str, list[str]] = {}
    for l in plan["moe"]:
        if l.get("entreprise"):
            entreprises.setdefault(l["entreprise"], []).append(l["designation"])
    if entreprises:
        detail = " ; ".join(f"{e} ({', '.join(ds)})" for e, ds in entreprises.items())
        d.append(f"Entreprises des lignes MOE à saisir dans l'éditeur (reprises au suivi financier du syndic ; l'import les laisse en commentaire) : {detail}.")
    for i, a in enumerate(plan["aides"]):
        if i >= len(predit["aides"]):
            continue
        p = predit["aides"][i]
        if p["calcul"]["mode"] == "manuel" and a["calcul"]["mode"] not in ("manuel",):
            d.append(f"Aide « {a['libelle']} » importée en montant figé ({fmt_euro(r['aides'][i]['montant'])}) au lieu de la formule « {decrire_calcul(a['calcul'])} » : la remettre en formule dans l'éditeur si elle doit suivre les travaux.")
        elif p["calcul"]["mode"] != a["calcul"]["mode"]:
            d.append(f"Aide « {a['libelle']} » lue « {decrire_calcul(p['calcul'])} » au lieu de « {decrire_calcul(a['calcul'])} » (même montant).")
        elif p["calcul"] != a["calcul"] and a["calcul"]["mode"] not in ("manuel", "info"):
            d.append(f"Aide « {a['libelle']} » lue « {decrire_calcul(p['calcul'])} » au lieu de « {decrire_calcul(a['calcul'])} ».")
        if p["publique"] != a["publique"]:
            d.append(f"Aide « {a['libelle']} » lue {'publique' if p['publique'] else 'privée'} : seul le groupe « CEE » marque une prime privée.")
        if a.get("cleRepartition"):
            d.append(f"Aide « {a['libelle']} » : clé de répartition « {a['cleRepartition']} » à choisir dans l'éditeur (l'import ne la lit pas).")
    if any(l.get("cleRepartition") for lot in plan["lots"] for l in lot["lignes"]) or any(l.get("cleRepartition") for l in plan["moe"]):
        d.append("Clés de répartition des lignes de travaux / MOE : à choisir après l'import (onglet Financement, « Clés de répartition ») - l'import ne les lit pas.")
    pp, pl = predit["params"], plan["params"]
    noms = {
        "imprevusPct": "imprévus (%)",
        "fondsTravaux": "fonds travaux",
        "totalTantiemes": "total des tantièmes",
        "dureeEcoPtzAns": "durée de l'éco-PTZ",
        "pctAvanceAides": "part des aides avancées (variante individuelle)",
        "tauxPretAvancePct": "coût du prêt avance (%)",
        "coefAssurance": "coefficient d'assurance des mensualités",
        "plafondTravauxParLogement": "plafond des travaux MPR par logement",
        "plafondMprParLogement": "garde-fou MPR travaux par logement",
    }
    for k, lib in noms.items():
        if abs((pp.get(k) or 0) - (pl.get(k) or 0)) > 1e-9:
            if k == "pctAvanceAides" and not plan["variantes"].get("individuel"):
                continue
            d.append(f"Paramètre « {lib} » lu {js_nombre(pp.get(k))} au lieu de {js_nombre(pl.get(k))} : à ressaisir dans l'éditeur.")
    if sorted(pp["tantiemesExemples"]) != sorted(pl["tantiemesExemples"]):
        d.append(f"Tantièmes d'exemple lus {pp['tantiemesExemples']} au lieu de {pl['tantiemesExemples']}.")
    for k in ("nbLogements", "nbLogementsEquiv", "surfaceHabitable", "cepInitial", "cepProjet", "etiquetteInitiale", "etiquetteProjet", "dispositifClimaxion"):
        if predit["infos"].get(k) != plan["infos"].get(k):
            d.append(f"Information « {k} » lue {predit['infos'].get(k)!r} au lieu de {plan['infos'].get(k)!r}.")
    for cle, lib in CONTROLES:
        a, b = valeur_resultat(r, cle), valeur_resultat(rp, cle)
        if abs(a - b) > 1:
            d.append(f"**Écart après import sur « {lib} » : {fmt_euro(b)} au lieu de {fmt_euro(a)}.**")
    return d


def differences_estimatif(plan: dict) -> list[str]:
    d: list[str] = []
    p = plan["params"]
    if p["plafondTravauxParLogement"] != 25000:
        d.append(f"Plafond des travaux MPR de {fmt_nombre(p['plafondTravauxParLogement'])} € par logement : l'import estimatif repart de 25 000 € - à ressaisir.")
    if p["plafondMprParLogement"] != 11250:
        d.append(f"Garde-fou MPR travaux de {fmt_nombre(p['plafondMprParLogement'])} € par logement : l'import repart de 11 250 € - à ressaisir.")
    if plan["variantes"].get("individuel") and p["pctAvanceAides"] != 70:
        d.append(f"Part des aides avancées de {fmt_taux(p['pctAvanceAides'])} % : l'import estimatif repart de 70 %.")
    if any(l.get("cleRepartition") for lot in plan["lots"] for l in lot["lignes"]) or any(l.get("cleRepartition") for l in plan["moe"]) or any(a.get("cleRepartition") for a in plan["aides"]):
        d.append("Clés de répartition : non reprises par l'import estimatif.")
    for lot in plan["lots"]:
        if lot.get("entreprise"):
            d.append(f"Lot {lot['numero']} : entreprise « {lot['entreprise']} » non reprise par l'import estimatif.")
            break
    if any(lot["remisePct"] for lot in plan["lots"]):
        d.append("Remises de lot : intégrées au HT des lignes (le format estimatif n'a pas de remise) ; TTC calé par une ligne « Ajustement de TVA ».")
    nb_ajust = sum(1 for lot in plan["lots"] for l in lot["lignes"] if l.get("tvaMontant") is not None)
    if nb_ajust:
        d.append("TVA saisie en montant : regroupée en une seule ligne « Ajustement de TVA (TTC travaux du classeur) » dans le lot Provisions.")
    for lot in plan["lots"]:
        if len(lot["lignes"]) > 1 and not est_lot_provisions(lot):
            pref = [re.match(r"^(.+?)\s+-\s+(.+)$", l["designation"]) for l in lot["lignes"]]
            if all(pref) and len({m.group(1) for m in pref}) == 1:
                d.append(f"Lot {lot['numero']} : toutes les désignations commencent par « {pref[0].group(1)} - » ; le logiciel retirera ce préfixe.")
    return d


# =====================================================================


def nom_fichier(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', " ", s).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pivot", help="fichier JSON du plan (voir references/pivot.md)")
    ap.add_argument("--sortie", default=None, help="dossier de sortie (défaut : celui du pivot)")
    a = ap.parse_args()

    with open(a.pivot, encoding="utf-8") as fh:
        try:
            pivot = json.load(fh)
        except json.JSONDecodeError as e:
            print(f"ERREUR : JSON invalide ({e}).")
            return 1
    j = Journal()
    nature, plans = charger(pivot, j)
    if j.erreurs:
        print("ERREURS - aucun fichier écrit :")
        for e in j.erreurs:
            print(f"  - {e}")
        return 1

    sortie = a.sortie or os.path.dirname(os.path.abspath(a.pivot))
    os.makedirs(sortie, exist_ok=True)
    nom = plans[0]["infos"]["nomCopro"]
    fichiers = []
    lignes_rapport = [f"# Conversion du plan de financement - {nom}", ""]
    src = texte(pivot.get("classeur_source"))
    lignes_rapport.append(f"- Nature : PF {'définitif' if nature == 'definitif' else 'estimatif'}" + (f" - classeur source : {src}" + (f", onglet « {texte(pivot.get('onglet_source'))} »" if pivot.get("onglet_source") else "") if src else ""))

    if nature == "definitif":
        for plan in plans:
            plan["_plusieurs"] = len(plans) > 1
            assainir_libelles_definitif(plan, j)
        sections = []
        for plan in plans:
            r = compute_plan(plan)
            suffixe = f" - scénario {plan['ordre']}" if len(plans) > 1 else ""
            chemin = os.path.join(sortie, nom_fichier(f"Import PF définitif - {nom}{suffixe}.xlsx"))
            ecrit = ecrire_definitif(plan, r, chemin)
            predit, problemes = simuler_import_definitif(ecrit)
            for pb in problemes:
                j.av(pb)
            # contrôle de structure : tout ce qui a été écrit doit être relu
            if len(predit["lots"]) != len(plan["lots"]) or any(len(a["lignes"]) != len(b["lignes"]) for a, b in zip(predit["lots"], sorted(plan["lots"], key=lambda x: x["numero"]))):
                j.err("Relecture simulée : des lignes de travaux ne seraient pas relues (voir les désignations).")
            if len(predit["moe"]) != len(plan["moe"]):
                j.err("Relecture simulée : des lignes MOE ne seraient pas relues - un libellé de MOE contient sans doute « Total MOE ».")
            if len(predit["aides"]) != len(plan["aides"]):
                j.err("Relecture simulée : des aides ne seraient pas relues - un libellé d'aide contient sans doute « Total aides » ou vaut « Scénario 1 ».")
            for k in ("fondsTravaux", "imprevusPct", "totalTantiemes"):
                if abs(predit["params"][k] - plan["params"][k]) > 1e-9:
                    j.err(f"Relecture simulée : « {k} » relu {predit['params'][k]} au lieu de {plan['params'][k]} - un libellé contient sans doute « fonds travaux » ou « y compris imprévus » avant la bonne ligne.")
            rp = compute_plan(predit)
            diffs = differences_definitif(plan, predit, r, rp)
            fichiers.append(chemin)
            sections.extend(section_scenario(plan, r, nature, predit, diffs))
    else:
        R = [compute_plan(p) for p in plans]
        T = {p["params"]["totalTantiemes"] for p in plans}
        if len(T) > 1:
            j.av(f"Total des tantièmes différent selon les scénarios ({sorted(T)}) : le classeur estimatif n'en porte qu'un (celui du scénario {plans[0]['ordre']}).")
        ex = {tuple(p["params"]["tantiemesExemples"]) for p in plans}
        if len(ex) > 1:
            j.av("Tantièmes d'exemple différents selon les scénarios : ceux du premier scénario sont repris pour tous.")
        chemin = os.path.join(sortie, nom_fichier(f"Import PF estimatif - {nom}.xlsx"))
        ecrit = ecrire_estimatif(plans, R, chemin, j)
        diffs_commun = verifier_lecture_estimatif(plans, ecrit, j)
        fichiers.append(chemin)
        sections = []
        for k, plan in enumerate(plans):
            pre = f"Scénario {plan['ordre']} : "
            diffs = [x[len(pre):] for x in diffs_commun if x.startswith(pre)] + differences_estimatif(plan)
            sections.extend(section_scenario(plan, R[k], nature, None, diffs))

    if j.erreurs:
        for f in fichiers:
            try:
                os.remove(f)
            except OSError:
                pass
        print("ERREURS - aucun fichier conservé :")
        for e in j.erreurs:
            print(f"  - {e}")
        return 1

    lignes_rapport.append("- Fichier(s) à importer : " + ", ".join(f"`{os.path.basename(f)}`" for f in fichiers))
    lignes_rapport.append(
        "- Import : Strat Eco Pro > dossier de la copropriété > onglet **Financement** > **Importer un classeur**. "
        + ("Le plan arrive en brouillon dans l'éditeur du PF définitif." if nature == "definitif" else "Les scénarios arrivent en brouillon dans le comparatif estimatif.")
    )
    lignes_rapport.append("")
    if j.avert:
        lignes_rapport.append("## Avertissements de conversion")
        lignes_rapport.append("")
        lignes_rapport.extend(f"- {x}" for x in j.avert)
        lignes_rapport.append("")
    lignes_rapport.extend(sections)
    rapport = os.path.join(sortie, nom_fichier(f"Rapport conversion PF - {nom}.md"))
    with open(rapport, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lignes_rapport))

    print("Fichiers écrits :")
    for f in fichiers + [rapport]:
        print(f"  - {f}")
    print()
    print("\n".join(lignes_rapport))
    return 0


if __name__ == "__main__":
    sys.exit(main())
