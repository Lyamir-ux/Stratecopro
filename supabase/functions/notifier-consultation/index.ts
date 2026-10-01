// Edge function « notifier-consultation » - appelée par l'AMO juste après la
// publication d'une consultation, ou par le syndic auteur d'une demande de
// consultation PPPT + DPE collectif publiée depuis son suivi des PPT (0109 :
// seulement pour la consultation de sa propre demande). Cherche dans la base les prestataires
// référencés ACTIFS dont les métiers (types) couvrent la prestation consultée,
// leur envoie un e-mail d'alerte (adresse principale + adresses en copie,
// 0106) et journalise chaque envoi dans consultation_notifications.
// Depuis 0122 (01/10/2026) : sont écartées les entreprises qui ont demandé à
// ne pas être consultées et celles dont les départements ne comprennent pas
// celui de la copropriété (liste vide = toute la France ; département
// introuvable = pas de filtre). Même règle que src/lib/departements.ts.
// Depuis 0125 (01/10/2026) : une consultation restreinte (prestataires_choisis)
// n'alerte que les entreprises choisies par l'équipe, relances comprises ; ce
// choix passe outre leurs départements, jamais leur « Ne pas consulter ».
//
// Envoi réel via Resend si le secret RESEND_API_KEY est configuré
// (supabase secrets set RESEND_API_KEY=re_xxx [RESEND_FROM="Strat Eco <consultations@strateco.fr>"] [APP_URL=https://...]).
// Sans clé : chaque notification est journalisée avec le statut 'simule'
// - le parcours reste testable de bout en bout sans provider.
import { createClient } from "npm:@supabase/supabase-js@2";

const TYPE_LABELS: Record<string, string> = {
  moe: "Maîtrise d'œuvre",
  be: "Bureau d'études",
  pppt_dpe: "PPPT + DPE collectif",
  diag: "Diagnostiqueur",
  ct: "Contrôleur technique",
  sps: "Coordonnateur SPS",
  autre: "Autre intervenant",
};

const OPTION_LABELS: Record<string, string> = {
  audit_reglementaire: "Audit réglementaire",
  pppt: "PPPT",
  dpe_collectif: "DPE collectif",
  memoire_climaxion: "Mémoire Climaxion",
};

const SOUS_TYPE_LABELS: Record<string, string> = {
  amiante_plomb: "Diagnostic amiante et plomb avant travaux",
  etancheite: "Test d'étanchéité à l'air",
};

/** Département d'un code postal (Corse 2A / 2B, outre-mer sur 3 chiffres) - comme src/lib/departements.ts. */
function departementDuCodePostal(cp: string | null | undefined): string | null {
  const v = (cp ?? "").replace(/\s+/g, "");
  if (!/^\d{5}$/.test(v)) return null;
  const code = v.startsWith("20") ? (v < "20200" ? "2A" : "2B") : v.startsWith("97") ? v.slice(0, 3) : v.slice(0, 2);
  // codes des 101 départements (975 Saint-Pierre-et-Miquelon, 98 Monaco / Pacifique : non)
  return /^(0[1-9]|1[0-9]|2[1-9]|2A|2B|[3-8][0-9]|9[0-5]|97[1-46])$/.test(code) ? code : null;
}

/** Premier code postal (5 chiffres isolés) d'un texte libre. */
function codePostalDans(texte: string | null | undefined): string | null {
  return /(?:^|\D)(\d{5})(?!\d)/.exec(texte ?? "")?.[1] ?? null;
}

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- L'appelant : AMO actif, ou syndic auteur de la demande PPT liée (le JWT est déjà vérifié par la gateway) ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || !profile.active) return json(403, { error: "Profil inactif" });

  const { consultation_id } = await req.json().catch(() => ({}));
  if (!consultation_id) return json(400, { error: "consultation_id manquant" });

  // Demande PPT à l'origine de la consultation (0109) : autorise son auteur et nomme le syndic dans l'e-mail
  const { data: demandePpt } = await admin
    .from("demandes_amo")
    .select("demandeur_user_id, syndic_name")
    .eq("consultation_id", consultation_id)
    .eq("objet", "consultation_pppt_dpe")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profile.role !== "amo" && demandePpt?.demandeur_user_id !== userData.user.id) {
    return json(403, { error: "Réservé à l'équipe AMO" });
  }

  const { data: cs, error: csErr } = await admin
    .from("consultations")
    .select("*, coproprietes(name, adresse, city, code_postal)")
    .eq("id", consultation_id)
    .maybeSingle();
  if (csErr || !cs) return json(404, { error: "Consultation introuvable" });

  // --- Prestataires référencés actifs couvrant ce métier, pas encore alertés ---
  // (fiches sans e-mail exclues : e-mail facultatif depuis 0105)
  const { data: prestas, error: pErr } = await admin
    .from("prestataires")
    .select("id, raison_sociale, contact_nom, email, emails_secondaires, departements, ne_pas_consulter")
    .eq("actif", true)
    .not("email", "is", null)
    .contains("types", [cs.type]);
  if (pErr) return json(500, { error: pErr.message });

  // Département de la copropriété : code postal de la fiche, sinon celui de la
  // ville puis de l'adresse saisies pour une copropriété hors plateforme
  const departement =
    departementDuCodePostal(cs.coproprietes?.code_postal) ??
    departementDuCodePostal(codePostalDans(cs.copro_externe_ville)) ??
    departementDuCodePostal(codePostalDans(cs.copro_externe_adresse));

  const { data: deja } = await admin
    .from("consultation_notifications")
    .select("prestataire_id")
    .eq("consultation_id", consultation_id);
  const dejaIds = new Set((deja ?? []).map((n) => n.prestataire_id));
  // consultation restreinte (0125) : les seules entreprises choisies, départements ignorés
  const choisis: string[] | null = cs.prestataires_choisis ?? null;
  const nouveaux = (prestas ?? []).filter((p) => !dejaIds.has(p.id) && (!choisis || choisis.includes(p.id)));
  const couvre = (p: { departements: string[] | null }) =>
    !!choisis || !departement || (p.departements ?? []).length === 0 || (p.departements ?? []).includes(departement);
  const horsConsultation = nouveaux.filter((p) => p.ne_pas_consulter).length;
  const horsDepartement = nouveaux.filter((p) => !p.ne_pas_consulter && !couvre(p)).length;
  const cibles = nouveaux.filter((p) => !p.ne_pas_consulter && couvre(p));

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

  const coproNom = cs.coproprietes?.name ?? cs.copro_externe_nom ?? "-";
  const coproLieu = cs.coproprietes
    ? [cs.coproprietes.adresse, cs.coproprietes.city].filter(Boolean).join(", ")
    : [cs.copro_externe_adresse, cs.copro_externe_ville].filter(Boolean).join(", ");
  const typeLabel = cs.sous_type
    ? `${TYPE_LABELS[cs.type] ?? cs.type} - ${SOUS_TYPE_LABELS[cs.sous_type] ?? cs.sous_type}`
    : (TYPE_LABELS[cs.type] ?? cs.type);
  const dateLimite = cs.date_limite
    ? new Date(cs.date_limite).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const logements: number | null = cs.nb_logements ?? cs.copro_externe_lots ?? null;
  const optionsLabels: string[] = ((cs.options ?? []) as string[]).map((o) => OPTION_LABELS[o] ?? o);
  const { count: nbDocs } = await admin
    .from("consultation_docs")
    .select("*", { count: "exact", head: true })
    .eq("consultation_id", consultation_id);

  let envoyes = 0, simules = 0, erreurs = 0;

  for (const p of cibles) {
    let statut: "simule" | "envoye" | "erreur" = "simule";
    let erreur: string | null = null;
    const destinataires: string[] = [p.email, ...(p.emails_secondaires ?? [])];

    if (resendKey) {
      // lien profond : ouvre l'espace prestataire directement sur la consultation
      const lienConsultations = `${appUrl}/prestataire/consultations?c=${consultation_id}`;
      const ligne = (label: string, valeur: string) =>
        `<tr><td style="padding:4px 14px 4px 0;color:#666;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0;color:#1a1a1a">${valeur}</td></tr>`;
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
          <p>Bonjour${p.contact_nom ? " " + p.contact_nom : ""},</p>
          <p><strong>Strat Eco</strong>, assistant à maîtrise d'ouvrage, lance une consultation${demandePpt?.syndic_name ? ` pour le compte du syndic <strong>${demandePpt.syndic_name}</strong>` : ""}
          ${choisis ? "à laquelle votre entreprise est invitée à répondre :" : "pour laquelle votre entreprise est référencée :"}</p>
          <table style="border-collapse:collapse;margin:14px 0;font-size:14.5px">
            ${ligne("Copropriété", `<strong>${coproNom}</strong>${coproLieu ? " - " + coproLieu : ""}`)}
            ${logements ? ligne("Taille", `${logements} logements`) : ""}
            ${cs.nb_batiments ? ligne("Bâtiments", `${cs.nb_batiments}`) : ""}
            ${ligne("Mission", `<strong>${typeLabel}</strong> - ${cs.mission}`)}
            ${optionsLabels.length ? ligne("Options à chiffrer", optionsLabels.join(", ")) : ""}
            ${dateLimite ? ligne("Date limite de réponse", `<strong>${dateLimite}</strong>`) : ""}
          </table>
          ${
            nbDocs
              ? `<p>Le dossier de consultation (${nbDocs} document${nbDocs > 1 ? "s" : ""} : cahier des charges, audit…) est à télécharger depuis votre espace prestataire.</p>`
              : ""
          }
          ${
            cs.type === "moe"
              ? `<p>Pour cette mission de maîtrise d'œuvre, votre offre détaillera chaque phase
                 - DIAG/AVP, PRO/DCE, suivi de chantier - ainsi que chaque option demandée.</p>`
              : ""
          }
          <p style="margin:22px 0">
            <a href="${lienConsultations}"
               style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
              Consulter le dossier et déposer mon offre
            </a>
          </p>
          <p>Pour y accéder, <a href="${lienConsultations}" style="color:#355717">connectez-vous à votre espace prestataire</a>
          avec votre adresse e-mail (${p.email}).
          Mot de passe oublié ? <a href="${appUrl}/mot-de-passe-oublie" style="color:#355717">Réinitialisez-le ici</a>.</p>
          <p>À réception, votre candidature est transmise à l'équipe Strat Eco,
          qui reviendra vers vous à l'issue de la consultation.</p>
          <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
          <p style="color:#888;font-size:13px;border-top:1px solid #e5e5e5;padding-top:12px;margin-top:24px">
            ${
              choisis
                ? `Vous recevez cet e-mail car l'équipe Strat Eco a choisi de consulter votre entreprise, référencée « ${TYPE_LABELS[cs.type] ?? cs.type} », pour cette mission.`
                : `Vous recevez cet e-mail car votre entreprise est référencée « ${TYPE_LABELS[cs.type] ?? cs.type} » auprès de Strat Eco${departement ? ` (copropriété du département ${departement})` : ""}.`
            }
            Vos prestations, vos départements ou le choix de ne plus être consulté se règlent dans
            <a href="${appUrl}/prestataire/entreprise" style="color:#888">Mon entreprise</a> de votre espace prestataire.
          </p>
        </div>`;
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: destinataires,
            subject: `Nouvelle consultation ${typeLabel} - ${coproNom}`,
            html,
          }),
        });
        if (r.ok) statut = "envoye";
        else {
          statut = "erreur";
          erreur = `Resend ${r.status}: ${(await r.text()).slice(0, 300)}`;
        }
      } catch (e) {
        statut = "erreur";
        erreur = String(e).slice(0, 300);
      }
    }

    await admin.from("consultation_notifications").insert({
      consultation_id,
      prestataire_id: p.id,
      email: destinataires.join(", "),
      statut,
      erreur,
    });
    if (statut === "envoye") envoyes++;
    else if (statut === "simule") simules++;
    else erreurs++;
  }

  return json(200, {
    total: cibles.length,
    envoyes,
    simules,
    erreurs,
    // entreprises du métier écartées (0122) : « Ne pas consulter », autre département
    hors_consultation: horsConsultation,
    hors_departement: horsDepartement,
    departement,
    // consultation restreinte (0125) : nombre d'entreprises choisies, null = ouverte au métier
    choisis: choisis?.length ?? null,
    mode: resendKey ? "resend" : "simulation",
  });
});
