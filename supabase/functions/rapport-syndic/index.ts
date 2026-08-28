// Edge function « rapport-syndic » - rapport mensuel de portefeuille envoyé
// par e-mail aux cabinets de syndic : chaque directeur reçoit l'état de tout
// le portefeuille de son enseigne, chaque gestionnaire celui de ses seules
// copropriétés. Contenu par dossier : phase, avancement, logements, montant
// d'opération, choix de financement transmis, PF définitif validé, tâches en
// retard - avec une liste de points de vigilance.
//
// Un envoi par enseigne et par mois (journal rapport_syndic_envois) ;
// déclenchée au premier chargement de l'app AMO du mois (api/rapportSyndic.ts)
// et relançable à la main depuis Paramètres (body { force: true }).
// Envoi réel via Resend si RESEND_API_KEY est configuré ; sans clé, l'envoi
// est simulé et rien n'est journalisé (le rapport partira au vrai branchement).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const PHASE_LABEL: Record<string, string> = {
  diagnostic: "Diagnostic",
  etudes: "Études",
  travaux: "Travaux",
};

const euro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

interface LigneCopro {
  id: string;
  name: string;
  city: string | null;
  phase: string;
  progress: number;
  fragile: boolean;
  gestionnaire: string;
  logements: number;
  montant: number | null;
  choixTransmis: number | null; // null = pas de plan partagé (pas encore d'attente)
  coproprietaires: number;
  pfValide: boolean;
  tachesEnRetard: number;
}

/** Tableau HTML des copropriétés (colonne gestionnaire pour les directeurs). */
function tableCopros(lignes: LigneCopro[], avecGestionnaire: boolean): string {
  const th = (t: string, right = false) =>
    `<th style="text-align:${right ? "right" : "left"};padding:7px 10px;border-bottom:2px solid #355717;font-size:12.5px;color:#355717;white-space:nowrap">${t}</th>`;
  const td = (t: string, right = false, extra = "") =>
    `<td style="text-align:${right ? "right" : "left"};padding:7px 10px;border-bottom:1px solid #e3e6dd;font-size:13px;${extra}">${t}</td>`;
  const rows = lignes
    .map((l) =>
      `<tr>
        ${td(`<strong>${l.name}</strong>${l.fragile ? ' <span style="color:#b3261e;font-weight:bold">(fragile)</span>' : ""}${l.city ? `<br/><span style="color:#777;font-size:12px">${l.city}</span>` : ""}`)}
        ${avecGestionnaire ? td(l.gestionnaire || "-") : ""}
        ${td(PHASE_LABEL[l.phase] ?? l.phase)}
        ${td(`${l.progress} %`, true)}
        ${td(String(l.logements || "-"), true)}
        ${td(l.montant != null ? euro(l.montant) : "-", true)}
        ${td(l.choixTransmis != null ? `${l.choixTransmis}/${l.coproprietaires}` : "-", true)}
        ${td(l.pfValide ? "Oui" : "-", true)}
        ${td(l.tachesEnRetard > 0 ? `<span style="color:#b3261e;font-weight:bold">${l.tachesEnRetard}</span>` : "-", true)}
      </tr>`,
    )
    .join("");
  return `
    <table style="border-collapse:collapse;width:100%;margin:14px 0">
      <thead><tr>
        ${th("Copropriété")}
        ${avecGestionnaire ? th("Gestionnaire") : ""}
        ${th("Phase")}
        ${th("Avancement", true)}
        ${th("Logements", true)}
        ${th("Montant TTC", true)}
        ${th("Financement transmis", true)}
        ${th("PF validé", true)}
        ${th("Tâches en retard", true)}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** Points de vigilance : dossiers fragiles, tâches en retard, choix en attente. */
function vigilance(lignes: LigneCopro[]): string {
  const points: string[] = [];
  for (const l of lignes) {
    if (l.tachesEnRetard > 0) {
      points.push(`<strong>${l.name}</strong> : ${l.tachesEnRetard} tâche${l.tachesEnRetard > 1 ? "s" : ""} dont l'échéance est dépassée.`);
    }
    if (l.choixTransmis != null && l.coproprietaires > 0 && l.choixTransmis < l.coproprietaires) {
      points.push(`<strong>${l.name}</strong> : ${l.coproprietaires - l.choixTransmis} copropriétaire${l.coproprietaires - l.choixTransmis > 1 ? "s n'ont" : " n'a"} pas encore transmis de mode de financement.`);
    }
  }
  if (points.length === 0) return "";
  return `
    <p style="margin:18px 0 6px"><strong>Points de vigilance :</strong></p>
    <ul style="margin:0 0 14px;padding-left:20px">${points.map((p) => `<li style="margin:4px 0">${p}</li>`).join("")}</ul>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- L'appelant doit être un AMO actif ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || !profile.active || profile.role !== "amo") {
    return json(403, { error: "Réservé à l'équipe AMO" });
  }

  const { force } = await req.json().catch(() => ({}));

  const maintenant = new Date();
  const periode = maintenant.toISOString().slice(0, 7); // 'AAAA-MM'
  const moisLabel = maintenant.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const aujourdHui = maintenant.toISOString().slice(0, 10);

  // --- Données du portefeuille ---
  const [{ data: orgs }, { data: copros }, { data: dejaEnvoyes }] = await Promise.all([
    admin.from("organisations").select("id, nom"),
    admin
      .from("coproprietes")
      .select("id, name, city, phase, fragile, nb_logements, gestionnaire_nom, organisation_id")
      .is("deleted_at", null)
      .not("organisation_id", "is", null),
    admin.from("rapport_syndic_envois").select("organisation_id").eq("periode", periode),
  ]);
  const coproIds = (copros ?? []).map((c) => c.id);
  if (coproIds.length === 0) return json(200, { organisations: 0, envoyes: 0, simules: 0, erreurs: 0, mode: "aucun dossier" });

  const [{ data: stats }, { data: pfs }, { data: taches }, { data: scenarios }, { data: membres }, { data: orgMembres }] =
    await Promise.all([
      admin.from("copro_stats").select("id, lots_hab, coproprietaires, montant_ttc").in("id", coproIds),
      admin.from("plans_definitifs").select("copro_id").eq("statut", "valide").in("copro_id", coproIds),
      admin.from("syndic_taches").select("copro_id, echeance, statut").in("copro_id", coproIds),
      admin.from("scenarios_financiers").select("id, copro_id").eq("statut", "partage").in("copro_id", coproIds),
      admin.from("copro_members").select("copro_id, user_id, member_role").in("copro_id", coproIds).eq("member_role", "syndic"),
      admin.from("organisation_membres").select("organisation_id, user_id, org_role, profiles(full_name, active)"),
    ]);

  // choix de financement transmis, par copro (via les scénarios partagés)
  const scenarioParCopro = new Map((scenarios ?? []).map((s) => [s.id, s.copro_id]));
  const choixParCopro = new Map<string, number>();
  if (scenarioParCopro.size > 0) {
    const { data: choix } = await admin
      .from("choix_financement")
      .select("scenario_id")
      .in("scenario_id", [...scenarioParCopro.keys()]);
    for (const ch of choix ?? []) {
      const cid = scenarioParCopro.get(ch.scenario_id);
      if (cid) choixParCopro.set(cid, (choixParCopro.get(cid) ?? 0) + 1);
    }
  }
  const coprosAvecPlanPartage = new Set((scenarios ?? []).map((s) => s.copro_id));

  const statsById = new Map((stats ?? []).map((s) => [s.id, s]));
  const pfValides = new Set((pfs ?? []).map((p) => p.copro_id));
  // tâches syndic : retards + avancement (% de tâches faites)
  const retardParCopro = new Map<string, number>();
  const tachesParCopro = new Map<string, { total: number; faites: number }>();
  for (const t of taches ?? []) {
    const acc = tachesParCopro.get(t.copro_id) ?? { total: 0, faites: 0 };
    acc.total++;
    if (t.statut === "done") acc.faites++;
    tachesParCopro.set(t.copro_id, acc);
    if (t.statut !== "done" && t.echeance && t.echeance < aujourdHui) {
      retardParCopro.set(t.copro_id, (retardParCopro.get(t.copro_id) ?? 0) + 1);
    }
  }
  // dossier jamais ouvert côté syndic (gabarit pas semé) : équivalent du semis
  // d'après la phase - gabarit 0048 : 5 diagnostic + 6 études + 10 travaux
  const avancement = (coproId: string, phase: string): number => {
    const acc = tachesParCopro.get(coproId);
    if (acc?.total) return Math.round((acc.faites / acc.total) * 100);
    const faites = phase === "travaux" ? 11 : phase === "etudes" ? 5 : 0;
    return Math.round((faites / 21) * 100);
  };

  const lignesParOrg = new Map<string, LigneCopro[]>();
  for (const c of copros ?? []) {
    const s = statsById.get(c.id);
    const ligne: LigneCopro = {
      id: c.id,
      name: c.name,
      city: c.city,
      phase: c.phase,
      progress: avancement(c.id, c.phase),
      fragile: !!c.fragile,
      gestionnaire: c.gestionnaire_nom ?? "",
      logements: s?.lots_hab || c.nb_logements || 0,
      montant: s?.montant_ttc != null ? Number(s.montant_ttc) : null,
      choixTransmis: coprosAvecPlanPartage.has(c.id) ? (choixParCopro.get(c.id) ?? 0) : null,
      coproprietaires: s?.coproprietaires ?? 0,
      pfValide: pfValides.has(c.id),
      tachesEnRetard: retardParCopro.get(c.id) ?? 0,
    };
    lignesParOrg.set(c.organisation_id!, [...(lignesParOrg.get(c.organisation_id!) ?? []), ligne]);
  }

  // périmètre des gestionnaires : leurs copros rattachées (copro_members)
  const coprosParUser = new Map<string, Set<string>>();
  for (const m of membres ?? []) {
    const set = coprosParUser.get(m.user_id) ?? new Set<string>();
    set.add(m.copro_id);
    coprosParUser.set(m.user_id, set);
  }

  const dejaFait = new Set((dejaEnvoyes ?? []).map((r) => r.organisation_id));
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

  let totalEnvoyes = 0, totalSimules = 0, totalErreurs = 0, orgsTraitees = 0;

  for (const org of orgs ?? []) {
    const lignesOrg = (lignesParOrg.get(org.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    if (lignesOrg.length === 0) continue;
    if (dejaFait.has(org.id) && !force) continue;
    orgsTraitees++;

    const destinataires: { email: string; role: string }[] = [];
    let envoyes = 0, erreurs = 0;

    const membresOrg = (orgMembres ?? []).filter((m) => {
      const p = m.profiles as { active?: boolean } | null;
      return m.organisation_id === org.id && p?.active;
    });

    for (const m of membresOrg) {
      const estDirecteur = m.org_role === "directeur";
      const lignes = estDirecteur
        ? lignesOrg
        : lignesOrg.filter((l) => coprosParUser.get(m.user_id)?.has(l.id));
      if (lignes.length === 0) continue;

      const { data: u } = await admin.auth.admin.getUserById(m.user_id);
      const email = u?.user?.email;
      if (!email) continue;

      if (!resendKey) {
        totalSimules++;
        continue;
      }

      const nom = (m.profiles as { full_name?: string } | null)?.full_name ?? "";
      const totalLogements = lignes.reduce((s, l) => s + l.logements, 0);
      const totalMontant = lignes.reduce((s, l) => s + (l.montant ?? 0), 0);
      const enTravaux = lignes.filter((l) => l.phase === "travaux").length;

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:780px">
          <p>Bonjour${nom ? " " + nom : ""},</p>
          <p>Voici l'état d'avancement au mois de <strong>${moisLabel}</strong> des rénovations énergétiques
          ${estDirecteur ? `du portefeuille <strong>${org.nom}</strong>` : "des copropriétés dont vous avez la charge"},
          accompagnées par Strat Eco :</p>
          <p style="padding:10px 14px;background:#f4f6f0;border-left:3px solid #7AB52C;border-radius:4px">
            <strong>${lignes.length}</strong> copropriété${lignes.length > 1 ? "s" : ""} ·
            <strong>${totalLogements}</strong> logements ·
            <strong>${euro(totalMontant)}</strong> de travaux TTC ·
            <strong>${enTravaux}</strong> dossier${enTravaux > 1 ? "s" : ""} en travaux
          </p>
          ${tableCopros(lignes, estDirecteur)}
          ${vigilance(lignes)}
          <p style="margin:22px 0">
            <a href="${appUrl}/syndic"
               style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
              Ouvrir mon espace syndic
            </a>
          </p>
          <p style="color:#777;font-size:12.5px">Ce rapport est envoyé chaque mois par le progiciel Strat Eco pro.
          Le détail de chaque dossier (financement, documents, suivi des paiements) est disponible dans votre espace.</p>
          <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
        </div>`;

      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [email],
            subject: `Rapport mensuel de votre portefeuille - ${moisLabel} · ${org.nom}`,
            html,
          }),
        });
        if (r.ok) {
          envoyes++;
          destinataires.push({ email, role: m.org_role });
        } else {
          erreurs++;
          console.error("Resend a refusé l'envoi", r.status, await r.text().catch(() => ""));
        }
      } catch (e) {
        erreurs++;
        console.error("Envoi impossible", e);
      }
    }

    totalEnvoyes += envoyes;
    totalErreurs += erreurs;

    // journalisation (envoi réel uniquement : en simulation le rapport reste dû)
    if (resendKey && (envoyes > 0 || erreurs > 0)) {
      await admin.from("rapport_syndic_envois").upsert(
        {
          organisation_id: org.id,
          periode,
          destinataires,
          envoyes,
          erreurs,
          created_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id,periode" },
      );
    }
  }

  return json(200, {
    periode,
    organisations: orgsTraitees,
    envoyes: totalEnvoyes,
    simules: totalSimules,
    erreurs: totalErreurs,
    mode: resendKey ? "resend" : "simulation",
  });
});
