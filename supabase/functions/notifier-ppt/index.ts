// Edge function « notifier-ppt » - alertes e-mail du module Suivi PPT.
//   - depot  : un cabinet a déposé un PPPT, un PPT adopté ou un DPE → les dirigeants de
//              Strat Eco (profiles.dirigeant) sont prévenus, lien vers la revue ;
//   - valide : le dirigeant a validé l'analyse → gestionnaire affecté et
//              directeurs de l'enseigne ;
//   - rejete : le rapport est rejeté → déposant.
// Envoi réel via Resend si RESEND_API_KEY est configuré, sinon 'simule'
// (même parti pris que notifier-syndic). Tirets simples partout.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

type TypeNotif = "depot" | "valide" | "rejete";

const BOUTON = (href: string, libelle: string) =>
  `<p style="margin:22px 0">
     <a href="${href}" style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${libelle}</a>
   </p>`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, full_name, dirigeant")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || !profile.active) return json(403, { error: "Profil inactif" });

  const { type, rapport_id } = await req.json().catch(() => ({}));
  if (!type || !rapport_id) return json(400, { error: "type et rapport_id attendus" });
  const typeNotif = type as TypeNotif;
  if (!["depot", "valide", "rejete"].includes(typeNotif)) return json(400, { error: "type inconnu" });
  if (typeNotif !== "depot" && !(profile.role === "amo" && profile.dirigeant)) {
    return json(403, { error: "Seul le dirigeant notifie une validation ou un rejet" });
  }

  const { data: rapport } = await admin
    .from("ppt_rapports")
    .select("id, type, name, statut, motif_rejet, depose_par, taux_honoraires_pct, ppt_copro_id, ppt_coproprietes(id, nom, organisation_id, gestionnaire_nom)")
    .eq("id", rapport_id)
    .maybeSingle();
  if (!rapport) return json(404, { error: "Rapport introuvable" });
  const copro = rapport.ppt_coproprietes as unknown as { id: string; nom: string; organisation_id: string; gestionnaire_nom: string | null } | null;
  if (!copro) return json(404, { error: "Copropriété introuvable" });

  // --- Destinataires ---
  const cibles = new Map<string, { user_id: string; nom: string }>();
  if (typeNotif === "depot") {
    const { data: dirigeants } = await admin.from("profiles").select("user_id, full_name").eq("role", "amo").eq("active", true).eq("dirigeant", true);
    for (const d of dirigeants ?? []) cibles.set(d.user_id, { user_id: d.user_id, nom: d.full_name ?? "" });
  } else if (typeNotif === "valide") {
    const { data: aff } = await admin.from("ppt_affectations").select("user_id, nom").eq("ppt_copro_id", copro.id).is("au", null);
    for (const a of aff ?? []) if (a.user_id) cibles.set(a.user_id, { user_id: a.user_id, nom: a.nom ?? "" });
    const { data: dirs } = await admin
      .from("organisation_membres")
      .select("user_id, org_role, profiles(full_name, active)")
      .eq("organisation_id", copro.organisation_id)
      .eq("org_role", "directeur");
    for (const d of dirs ?? []) {
      const p = d.profiles as { full_name?: string; active?: boolean } | null;
      if (p?.active) cibles.set(d.user_id, { user_id: d.user_id, nom: p.full_name ?? "" });
    }
  } else if (rapport.depose_par) {
    const { data: p } = await admin.from("profiles").select("user_id, full_name").eq("user_id", rapport.depose_par).maybeSingle();
    if (p) cibles.set(p.user_id, { user_id: p.user_id, nom: p.full_name ?? "" });
  }
  cibles.delete(userData.user.id);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";
  const style = `font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px`;
  const LIBELLE: Record<string, string> = { pppt: "PPPT", ppt_adopte: "PPT adopté", dpe_collectif: "DPE collectif", pv_ag: "PV d'AG", tableau_ppt: "Tableau PPT" };
  const libelleDoc = LIBELLE[rapport.type] ?? "Document";
  const typeDoc = LIBELLE[rapport.type] ? `un ${libelleDoc}` : "un document";

  const contenu = (nom: string): { sujet: string; html: string } => {
    const bonjour = `<p>Bonjour${nom ? " " + nom : ""},</p>`;
    const signature = `<p>Bien cordialement,<br/><strong>Strat Eco pro</strong></p>`;
    if (typeNotif === "depot") {
      return {
        sujet: `${libelleDoc} déposé - ${copro.nom}`,
        html: `<div style="${style}">${bonjour}
          <p>${profile.full_name || "Un gestionnaire"}${copro.gestionnaire_nom && copro.gestionnaire_nom !== profile.full_name ? ` (dossier de ${copro.gestionnaire_nom})` : ""} vient de déposer ${typeDoc} pour la copropriété <strong>${copro.nom}</strong> : « ${rapport.name} ».</p>
          ${rapport.taux_honoraires_pct != null ? `<p><strong>Taux d'honoraires de suivi de travaux indiqué par le syndic : ${Number(rapport.taux_honoraires_pct).toLocaleString("fr-FR")} %</strong> - à appliquer au tableau PPT de sortie.</p>` : ""}
          <p>À faire : télécharger le PDF, lancer l'analyse avec le skill pppt-verif, importer le JSON, relire et valider.</p>
          ${BOUTON(`${appUrl}/ppt/rapports/${rapport.id}`, "Ouvrir la revue")}${signature}</div>`,
      };
    }
    if (typeNotif === "valide") {
      return {
        sujet: `Plan pluriannuel de travaux analysé - ${copro.nom}`,
        html: `<div style="${style}">${bonjour}
          <p>L'analyse du PPPT de la copropriété <strong>${copro.nom}</strong> est terminée. L'échéancier des travaux, les remarques sur le rapport d'origine et le tableau PPT sont disponibles dans votre espace syndic, branche « Suivi des PPT ».</p>
          ${BOUTON(`${appUrl}/syndic/ppt/copros/${copro.id}`, "Consulter le plan")}${signature}</div>`,
      };
    }
    return {
      sujet: `Document non exploitable - ${copro.nom}`,
      html: `<div style="${style}">${bonjour}
        <p>Le document « ${rapport.name} » déposé pour <strong>${copro.nom}</strong> n'a pas pu être exploité comme plan pluriannuel de travaux.</p>
        ${rapport.motif_rejet ? `<p>Motif : ${rapport.motif_rejet}</p>` : ""}
        <p>Vous pouvez déposer une nouvelle version depuis l'onglet Documents de la copropriété.</p>
        ${BOUTON(`${appUrl}/syndic/ppt/copros/${copro.id}/documents`, "Ouvrir la copropriété")}${signature}</div>`,
    };
  };

  let envoyes = 0, simules = 0, erreurs = 0;
  for (const cible of cibles.values()) {
    const { data: u } = await admin.auth.admin.getUserById(cible.user_id);
    const email = u?.user?.email;
    if (!email) continue;
    if (!resendKey) {
      simules++;
      continue;
    }
    const { sujet, html } = contenu(cible.nom);
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], subject: sujet, html }),
      });
      if (r.ok) envoyes++;
      else {
        erreurs++;
        console.error("Resend a refusé l'envoi", r.status, await r.text().catch(() => ""));
      }
    } catch (e) {
      erreurs++;
      console.error("Envoi impossible", e);
    }
  }

  return json(200, { total: cibles.size, envoyes, simules, erreurs, mode: resendKey ? "resend" : "simulation" });
});
