"""Moteur de calcul d'un plan de financement - portage Python fidèle de
Strat Eco Pro (src/lib/finance/planDefinitif.ts, computePlanDefinitif) et des
règles de reconnaissance de l'importeur du PF définitif
(src/lib/finance/importPlanDefinitif.ts : norm, classifyMoe, classifyAide,
calibrerAides).

Le plan suit exactement le modèle de données du logiciel (PlanDefinitifData) :
    infos, lots[lignes], moe, aides[calcul], params, variantes
avec les mêmes noms de champs (nomCopro, montantHt, tvaPct, eligibleMprEtudes…).

À garder synchronisé avec le logiciel : toute évolution de computePlanDefinitif
ou de l'importeur doit être reportée ici (voir references/format-import.md).
"""
from __future__ import annotations

import copy
import re
import unicodedata

# ---------------------------------------------------------------- défauts

PHASES_MOE = [("etude", "1. Phase Étude"), ("projet", "2. Phase Projet"), ("travaux", "3. Phase Travaux")]
MODES_MOE = {"forfait", "pctTravauxHt", "pctTravauxTtc"}
MODES_AIDE = {"manuel", "parM2Shab", "pctAssietteTravaux", "pctEtudes", "pctAmo", "forfaitPlusParLogement", "parLogement", "info"}

INFOS_DEFAUT = {
    "nomCopro": "",
    "adresse": "",
    "nbLogements": 0,
    "nbLogementsEquiv": 0,
    "surfaceHabitable": 0,
    "nbEtages": 0,
    "nbEntrees": 0,
    "typeChauffage": "",
    "cepInitial": 0,
    "cepProjet": 0,
    "dispositifClimaxion": False,
    "etiquetteInitiale": "",
    "etiquetteProjet": "",
}

PARAMS_DEFAUT = {
    "imprevusPct": 7,
    "plafondTravauxParLogement": 25000,
    "plafondMprParLogement": 11250,
    "fondsTravaux": 0,
    "totalTantiemes": 10000,
    "tantiemesExemples": [],
    "dureeEcoPtzAns": 20,
    "coefAssurance": 1.03,
    "tauxPretAvancePct": 5.45,
    "pctAvanceAides": 70,
}

VARIANTES_DEFAUT = {"collectif": True, "collectifSansAvance": False, "individuel": True}


def completer_plan(plan: dict) -> dict:
    """Plan complété des valeurs par défaut du logiciel (makeDefaultPlanDefinitif)."""
    p = copy.deepcopy(plan)
    p["infos"] = {**INFOS_DEFAUT, **(p.get("infos") or {})}
    if not p["infos"].get("nbLogementsEquiv"):
        p["infos"]["nbLogementsEquiv"] = p["infos"]["nbLogements"]
    p["params"] = {**PARAMS_DEFAUT, **(p.get("params") or {})}
    p["variantes"] = {**VARIANTES_DEFAUT, **(p.get("variantes") or {})}
    p.setdefault("lots", [])
    p.setdefault("moe", [])
    p.setdefault("aides", [])
    for lot in p["lots"]:
        lot.setdefault("remisePct", 0)
        lot.setdefault("lignes", [])
    return p


# ---------------------------------------------------------------- calcul


def plafond_amo_regle(nb_logements: float) -> float:
    """600 € HT/logt au-delà de 20 logements, 1 000 € en dessous (règle du 23/09/2026)."""
    return 600 if nb_logements > 20 else 1000


def est_bonus_fragile(a: dict) -> bool:
    return "fragile" in (a.get("id") or "") or re.search("fragile", a.get("libelle") or "", re.I) is not None


def est_bonus_mpr(a: dict) -> bool:
    return est_bonus_fragile(a) or "bonus" in (a.get("id") or "") or re.search("bonus", a.get("libelle") or "", re.I) is not None


def compute_lot(lot: dict) -> dict:
    lignes = lot.get("lignes") or []
    remise_pct = lot.get("remisePct") or 0
    total_ht = 0.0
    for l in lignes:
        total_ht += l["montantHt"]
    remise = total_ht * remise_pct / 100
    total_ht_apres = total_ht - remise
    retenu_brut = 0.0
    for l in lignes:
        if l.get("retenu"):
            retenu_brut += l["montantHt"]
    total_ht_retenu = retenu_brut * (1 - remise_pct / 100)
    base_par_taux: dict[float, float] = {}
    saisie_par_taux: dict[float, float] = {}
    ordre: list[float] = []
    for l in lignes:
        t = l["tvaPct"]
        if l.get("tvaMontant") is not None:
            if t not in saisie_par_taux:
                saisie_par_taux[t] = 0.0
            saisie_par_taux[t] += l["tvaMontant"]
        else:
            if t not in base_par_taux:
                base_par_taux[t] = 0.0
            base_par_taux[t] += l["montantHt"]
    for t in list(base_par_taux) + list(saisie_par_taux):
        if t not in ordre:
            ordre.append(t)
    tva_par_taux = []
    for t in ordre:
        m = (base_par_taux.get(t, 0) * t) / 100 + saisie_par_taux.get(t, 0)
        if m != 0:
            tva_par_taux.append({"taux": t, "montant": m})
    tva_par_taux.sort(key=lambda x: -x["taux"])
    total_tva = 0.0
    for t in tva_par_taux:
        total_tva += t["montant"]
    total_ttc = total_ht_apres + total_tva
    return {
        "numero": lot["numero"],
        "titre": lot["titre"],
        "entreprise": lot.get("entreprise"),
        "totalHt": total_ht,
        "remise": remise,
        "totalHtApresRemise": total_ht_apres,
        "totalHtRetenu": total_ht_retenu,
        "tvaParTaux": tva_par_taux,
        "totalTtc": total_ttc,
    }


def ht_ligne_moe(m: dict, travaux_ht: float, travaux_ttc: float) -> float:
    if m["mode"] == "forfait":
        return m["montantHt"]
    if m["mode"] == "pctTravauxHt":
        return (travaux_ht * m["taux"]) / 100
    if m["mode"] == "pctTravauxTtc":
        return (travaux_ttc * m["taux"]) / 100
    raise ValueError(f"mode MOE inconnu : {m['mode']}")


def montant_aide(c: dict, infos: dict, assiette_mpr: float, ht_etudes: float, assiette_amo: float, prorata: float):
    mode = c["mode"]
    if mode == "manuel":
        return c["montant"]
    if mode == "parM2Shab":
        return infos["surfaceHabitable"] * c["tauxEurM2"] * c["coef"]
    if mode == "pctAssietteTravaux":
        return assiette_mpr * (c["taux"] / 100) * c["coef"]
    if mode == "pctEtudes":
        return ht_etudes * (c["taux"] / 100) * c["coef"] * prorata
    if mode == "pctAmo":
        return assiette_amo * (c["taux"] / 100)
    if mode == "forfaitPlusParLogement":
        return c["base"] + c["parLogement"] * (infos["nbLogementsEquiv"] if c["surEquivalent"] else infos["nbLogements"])
    if mode == "parLogement":
        return c["montant"] * (infos["nbLogementsEquiv"] if c["surEquivalent"] else infos["nbLogements"])
    if mode == "info":
        return None
    raise ValueError(f"mode d'aide inconnu : {mode}")


def compute_plan(plan: dict) -> dict:
    """Équivalent de computePlanDefinitif (mêmes formules, même ordre d'opérations)."""
    infos, params = plan["infos"], plan["params"]
    perf = 100 - (100 * infos["cepProjet"]) / infos["cepInitial"] if infos["cepInitial"] > 0 else 0

    lots = [compute_lot(l) for l in plan["lots"]]
    total_travaux_ht = 0.0
    travaux_retenus_ht = 0.0
    total_travaux_ttc = 0.0
    for l in lots:
        total_travaux_ht += l["totalHtApresRemise"]
        travaux_retenus_ht += l["totalHtRetenu"]
        total_travaux_ttc += l["totalTtc"]
    plafond_assiette = params["plafondTravauxParLogement"] * infos["nbLogements"]
    assiette_mpr = min(travaux_retenus_ht, plafond_assiette)
    total_ttc_imprevus = total_travaux_ttc * (1 + params["imprevusPct"] / 100)

    moe = []
    for l in plan["moe"]:
        ht = ht_ligne_moe(l["montant"], total_travaux_ht, total_travaux_ttc)
        moe.append({"designation": l["designation"], "phase": l["phase"], "montantHt": ht, "montantTtc": ht * (1 + l["tvaPct"] / 100)})
    total_moe_ttc = 0.0
    for m in moe:
        total_moe_ttc += m["montantTtc"]
    total_operation = total_ttc_imprevus + total_moe_ttc
    moe_phase_travaux = 0.0
    for m in moe:
        if m["phase"] == "travaux":
            moe_phase_travaux += m["montantTtc"]
    phase_travaux = total_ttc_imprevus + moe_phase_travaux

    ht_etudes = 0.0
    ht_amo = 0.0
    for l, m in zip(plan["moe"], moe):
        if l.get("eligibleMprEtudes"):
            ht_etudes += m["montantHt"]
        if l.get("eligibleMprAmo"):
            ht_amo += m["montantHt"]
    plafond_amo = plafond_amo_regle(infos["nbLogements"])
    assiette_amo = min(ht_amo, plafond_amo * infos["nbLogements"]) if infos["nbLogements"] > 0 else ht_amo
    prorata = assiette_mpr / total_travaux_ht if total_travaux_ht > 0 else 0

    aides = []
    for a in plan["aides"]:
        aides.append(
            {
                "id": a.get("id", ""),
                "groupe": a["groupe"],
                "libelle": a["libelle"],
                "montant": montant_aide(a["calcul"], infos, assiette_mpr, ht_etudes, assiette_amo, prorata),
                "publique": a["publique"],
            }
        )
    total_aides = 0.0
    total_publiques = 0.0
    for a in aides:
        total_aides += a["montant"] or 0
        total_publiques += (a["montant"] or 0) if a["publique"] else 0
    prime_cee = total_aides - total_publiques

    taux_couverture = total_aides / total_operation if total_operation > 0 else 0
    reste_a_charge = total_operation - (total_aides + params["fondsTravaux"])
    T = params["totalTantiemes"] or 10000
    cout_tantieme_avant = total_operation / T
    mois = params["dureeEcoPtzAns"] * 12

    reste_a_financer = reste_a_charge + prime_cee
    ex_coll, ex_sans = [], []
    for t in params["tantiemesExemples"]:
        part = t / T
        raf = reste_a_financer * part
        cout_avance = total_publiques * (params["tauxPretAvancePct"] / 100) * part
        cee = prime_cee * part
        mens = (raf / mois) * params["coefAssurance"] if mois > 0 else 0
        base = {"tantiemes": t, "quotePartAvant": total_operation * part, "resteAFinancer": raf, "mensualiteEcoPtz": mens, "subventionsPubliques": total_publiques * part, "primeCee": cee}
        ex_coll.append({**base, "coutPretAvance": cout_avance, "prixRevient": raf - cee + cout_avance})
        ex_sans.append({**base, "prixRevient": raf - cee})

    aides_avancees = total_publiques * (params["pctAvanceAides"] / 100)
    aides_fin = total_publiques - aides_avancees
    appels = total_operation - (aides_avancees + params["fondsTravaux"])
    ct_apres_aides = reste_a_charge / T
    ct_avec_avance = appels / T
    ex_ind = []
    for t in params["tantiemesExemples"]:
        a = ct_avec_avance * t
        ex_ind.append(
            {
                "tantiemes": t,
                "quotePartAvant": cout_tantieme_avant * t,
                "prixRevient": ct_apres_aides * t,
                "appelsFonds": a,
                "remboursementFinChantier": (ct_avec_avance - ct_apres_aides) * t,
                "mensualiteEcoPtz": (a / mois) * params["coefAssurance"] if mois > 0 else 0,
            }
        )

    nb = infos["nbLogements"] or 1
    mpr_travaux = 0.0
    for a, r in zip(plan["aides"], aides):
        if a["calcul"]["mode"] == "pctAssietteTravaux" and not est_bonus_mpr(a):
            mpr_travaux += r["montant"] or 0
    pt = params["plafondTravauxParLogement"]
    pm = params["plafondMprParLogement"]
    garde_fous = [
        {"libelle": f"Plafond travaux < {fmt_nombre(pt / 1000)} K€/logt", "valeur": assiette_mpr / nb, "plafond": pt, "ok": assiette_mpr / nb <= pt},
        {"libelle": f"MPR travaux < {fmt_nombre(pm)} €/logt", "valeur": mpr_travaux / nb, "plafond": pm, "ok": mpr_travaux / nb <= pm},
        {"libelle": f"AMO < {fmt_nombre(plafond_amo)} €/logt", "valeur": ht_amo / nb, "plafond": plafond_amo, "ok": ht_amo / nb <= plafond_amo},
    ]

    return {
        "performancePct": perf,
        "lots": lots,
        "totalTravauxHt": total_travaux_ht,
        "travauxRetenusHt": travaux_retenus_ht,
        "assietteMprTravaux": assiette_mpr,
        "plafondAssiette": plafond_assiette,
        "totalTravauxTtc": total_travaux_ttc,
        "totalTravauxTtcImprevus": total_ttc_imprevus,
        "moe": moe,
        "totalMoeTtc": total_moe_ttc,
        "totalOperationTtc": total_operation,
        "totalPhaseTravauxTtc": phase_travaux,
        "aides": aides,
        "totalAides": total_aides,
        "totalAidesPubliques": total_publiques,
        "primeCee": prime_cee,
        "tauxCouverture": taux_couverture,
        "resteACharge": reste_a_charge,
        "coutTantiemeAvant": cout_tantieme_avant,
        "collectif": {"resteAFinancer": reste_a_financer, "coutTantiemeApres": reste_a_financer / T, "exemples": ex_coll},
        "collectifSansAvance": {"resteAFinancer": reste_a_financer, "coutTantiemeApres": reste_a_financer / T, "exemples": ex_sans},
        "individuel": {
            "aidesAvancees": aides_avancees,
            "aidesFinChantier": aides_fin,
            "appelsFonds": appels,
            "coutTantiemeApresAides": ct_apres_aides,
            "coutTantiemeAvecAvance": ct_avec_avance,
            "exemples": ex_ind,
        },
        "gardeFous": garde_fous,
        "htEtudes": ht_etudes,
        "htAmo": ht_amo,
        "prorataEnergetique": prorata,
    }


def suggest_mpr_copro_pct(gain_pct: float):
    """Palier MaPrimeRénov' Copro 2026 (hors IDF) : 30 % dès 35 % de gain, 45 % dès 50 %."""
    if gain_pct >= 50:
        return 45
    if gain_pct >= 35:
        return 30
    return None


# ---------------------------------------------------------------- formats


def fmt_nombre(n: float, dec: int | None = None) -> str:
    """Nombre « à la française » (espace des milliers, virgule décimale)."""
    if dec is None:
        if float(n).is_integer():
            s = f"{int(round(n)):,}"
        else:
            s = f"{n:,.2f}".rstrip("0").rstrip(".")
    else:
        s = f"{n:,.{dec}f}"
    return s.replace(",", " ").replace(".", ",")


def fmt_euro(n) -> str:
    return "-" if n is None else fmt_nombre(n, 2) + " €"


def fmt_taux(t: float) -> str:
    """Taux comme le logiciel : String(5.5).replace(".", ",") → « 5,5 »."""
    return js_nombre(t).replace(".", ",")


def js_nombre(x: float) -> str:
    """Représentation d'un nombre comme String(x) en JavaScript (7 → « 7 », 5.5 → « 5.5 »)."""
    if isinstance(x, bool):
        raise TypeError("booléen")
    if float(x).is_integer() and abs(x) < 1e21:
        return str(int(x))
    r = repr(float(x))
    if "e" in r:
        # JavaScript n'écrit en notation scientifique qu'en dessous de 1e-6 : rare ici
        return format(float(x), "f").rstrip("0").rstrip(".")
    return r


# ---------------------------------------------------------------- importeur du PF définitif


def norm(s) -> str:
    """norm() de importPlanDefinitif.ts : minuscules, sans accents, « : » et espaces réduits."""
    s = "" if s is None else str(s)
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if not (0x300 <= ord(ch) <= 0x36F))
    s = s.replace("œ", "oe").replace("Œ", "oe").lower()
    s = re.sub(r"[:\s]+", " ", s)
    return s.strip()


def parse_tva(comment: str):
    m = re.search(r"tva\s*(?:de)?\s*([\d]+(?:[.,]\d+)?)\s*%", comment or "", re.I)
    return float(m.group(1).replace(",", ".")) if m else None


def tva_vraisemblable(ttc: float, candidats: list[float], defaut: float) -> float:
    def score(tva):
        ht = ttc / (1 + tva / 100)
        if abs(ht - round(ht)) < 0.005:
            return 2
        if abs(ht * 100 - round(ht * 100)) < 0.005:
            return 1
        return 0

    meilleur, meilleur_score = defaut, score(defaut)
    for t in candidats:
        s = score(t)
        if s > meilleur_score:
            meilleur, meilleur_score = t, s
    return meilleur


def classify_moe(designation: str, ttc: float, travaux_ht: float, travaux_ttc: float) -> dict:
    """classifyMoe : mode, TVA et éligibilités que l'importeur du PF définitif déduit du libellé."""
    n = norm(designation)

    def forfait(tva):
        return {"mode": "forfait", "montantHt": ttc / (1 + tva / 100)}

    if "assistance maitrise d'ouvrage" in n or re.search(r"\bamo\b", n):
        return {"montant": forfait(20), "tvaPct": 20, "eligibleMprEtudes": False, "eligibleMprAmo": True, "reconnue": True}
    if "maitrise d'oeuvre" in n and "travaux" in n:
        ht = ttc / 1.055
        return {
            "montant": {"mode": "pctTravauxHt", "taux": (ht / travaux_ht) * 100 if travaux_ht > 0 else 0},
            "tvaPct": 5.5,
            "eligibleMprEtudes": True,
            "eligibleMprAmo": False,
            "reconnue": True,
        }
    if "maitrise d'oeuvre" in n:
        tva = tva_vraisemblable(ttc, [10, 20], 10)
        return {"montant": forfait(tva), "tvaPct": tva, "eligibleMprEtudes": True, "eligibleMprAmo": False, "reconnue": True}
    if "controle technique" in n or "csps" in n:
        return {"montant": forfait(20), "tvaPct": 20, "eligibleMprEtudes": True, "eligibleMprAmo": False, "reconnue": True}
    if "dommage" in n and "ouvrage" in n:
        return {
            "montant": {"mode": "pctTravauxTtc", "taux": (ttc / travaux_ttc) * 100 if travaux_ttc > 0 else 0},
            "tvaPct": 0,
            "eligibleMprEtudes": False,
            "eligibleMprAmo": False,
            "reconnue": True,
        }
    if "syndic" in n:
        ht = ttc / 1.2
        return {
            "montant": {"mode": "pctTravauxHt", "taux": (ht / travaux_ht) * 100 if travaux_ht > 0 else 0},
            "tvaPct": 20,
            "eligibleMprEtudes": False,
            "eligibleMprAmo": False,
            "reconnue": True,
        }
    if "amiante" in n or "etancheite" in n:
        return {"montant": forfait(20), "tvaPct": 20, "eligibleMprEtudes": False, "eligibleMprAmo": False, "reconnue": True}
    return {"montant": forfait(20), "tvaPct": 20, "eligibleMprEtudes": False, "eligibleMprAmo": False, "reconnue": False}


def classify_aide(groupe: str, libelle: str, montant) -> dict:
    """classifyAide : formule standard que l'importeur associe au libellé."""
    n = norm(libelle)
    publique = norm(groupe) != "cee"
    base = {"id": re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", n)), "groupe": groupe, "libelle": libelle, "publique": publique}
    if montant is None:
        return {**base, "calcul": {"mode": "info"}}
    if "cee" in n:
        return {**base, "calcul": {"mode": "parM2Shab", "tauxEurM2": 27, "coef": 0.9}}
    if "maprimerenov" in n and "fragile" in n:
        return {**base, "calcul": {"mode": "pctAssietteTravaux", "taux": 20, "coef": 0.9}}
    if "maprimerenov" in n and "travaux" in n:
        return {**base, "calcul": {"mode": "pctAssietteTravaux", "taux": 45, "coef": 0.9}}
    if "maprimerenov" in n and "etudes" in n:
        return {**base, "calcul": {"mode": "pctEtudes", "taux": 45, "coef": 0.9}}
    if "maprimerenov" in n and "amo" in n:
        return {**base, "calcul": {"mode": "pctAmo", "taux": 50}}
    if "climaxion" in n and "travaux" in n:
        return {**base, "calcul": {"mode": "forfaitPlusParLogement", "base": 10000, "parLogement": 2500, "surEquivalent": True}}
    if "ems" in n and "travaux" in n:
        return {**base, "calcul": {"mode": "parLogement", "montant": 1000, "surEquivalent": True}}
    if "bbc" in n:
        return {**base, "calcul": {"mode": "parLogement", "montant": 500, "surEquivalent": False}}
    return {**base, "calcul": {"mode": "manuel", "montant": montant}}


def calibrer_aides(plan: dict, valeurs: list) -> list[str]:
    """calibrerAides : coefficient 0,9 / 1 retrouvé d'après le montant du fichier, sinon montant figé."""
    notes = []
    proche = lambda a, b: abs(a - b) <= 1  # noqa: E731
    for i, aide in enumerate(plan["aides"]):
        cible = valeurs[i]
        c = aide["calcul"]
        if cible is None or c["mode"] in ("manuel", "info"):
            continue

        def montant():
            return compute_plan(plan)["aides"][i]["montant"] or 0

        if proche(montant(), cible):
            continue
        if c["mode"] not in ("parM2Shab", "pctAssietteTravaux", "pctEtudes"):
            aide["calcul"] = {"mode": "manuel", "montant": cible}
            continue
        coef_initial = c["coef"]
        calibre = False
        for coef in (coef_initial, 1, 0.9):
            c["coef"] = coef
            m = montant()
            if proche(m, cible):
                calibre = True
                break
            if c["mode"] != "parM2Shab":
                r = compute_plan(plan)
                if r["travauxRetenusHt"] > r["assietteMprTravaux"] and r["assietteMprTravaux"] > 0:
                    if proche(m * (r["travauxRetenusHt"] / r["assietteMprTravaux"]), cible):
                        calibre = True
                        notes.append(f"Aide « {aide['libelle']} » : montant du fichier calculé sans plafond, le logiciel garde le plafond.")
                        break
        if not calibre:
            c["coef"] = coef_initial
            aide["calcul"] = {"mode": "manuel", "montant": cible}
    return notes


def decrire_calcul(c: dict) -> str:
    """Formule d'une aide en clair."""
    m = c["mode"]
    if m == "manuel":
        return "montant saisi (figé)"
    if m == "info":
        return "ligne informative (sans montant)"
    if m == "parM2Shab":
        return f"{fmt_taux(c['tauxEurM2'])} €/m² × coef {fmt_taux(c['coef'])}"
    if m == "pctAssietteTravaux":
        return f"{fmt_taux(c['taux'])} % de l'assiette travaux × coef {fmt_taux(c['coef'])}"
    if m == "pctEtudes":
        return f"{fmt_taux(c['taux'])} % des études HT × coef {fmt_taux(c['coef'])} × prorata"
    if m == "pctAmo":
        return f"{fmt_taux(c['taux'])} % de l'AMO HT plafonnée"
    if m == "forfaitPlusParLogement":
        return f"{fmt_nombre(c['base'])} + {fmt_nombre(c['parLogement'])} €/logt{' équiv.' if c['surEquivalent'] else ''}"
    if m == "parLogement":
        return f"{fmt_nombre(c['montant'])} €/logt{' équiv.' if c['surEquivalent'] else ''}"
    return m


def decrire_moe(l: dict) -> str:
    m = l["montant"]
    if m["mode"] == "forfait":
        s = f"forfait {fmt_nombre(m['montantHt'], 2)} € HT"
    elif m["mode"] == "pctTravauxHt":
        s = f"{fmt_nombre(m['taux'], 3).rstrip('0').rstrip(',')} % des travaux HT"
    else:
        s = f"{fmt_nombre(m['taux'], 3).rstrip('0').rstrip(',')} % des travaux TTC"
    s += f", TVA {fmt_taux(l['tvaPct'])} %"
    elig = [x for x, ok in (("MPR études", l.get("eligibleMprEtudes")), ("MPR AMO", l.get("eligibleMprAmo"))) if ok]
    if elig:
        s += ", " + " + ".join(elig)
    return s
