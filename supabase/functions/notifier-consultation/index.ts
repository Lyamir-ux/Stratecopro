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
// Depuis 0139 (05/10/2026, idée de Louis) : pour une entreprise, l'équipe peut
// avoir choisi à quelles adresses envoyer (consultation_destinataires : adresse
// principale, copies ou adresses de ses contacts). Sans choix, comme avant :
// principale + copies. Le choix est recoupé avec la fiche au moment de l'envoi
// (une adresse retirée depuis ne reçoit rien) ; s'il ne reste rien, retour à
// l'envoi d'office.
//
// v17 (12/10/2026, 0162) : chaque adresse de la fiche est une personne qui peut
// avoir son propre accès à l'espace de l'entreprise. Toutes les adresses
// reçoivent toujours la consultation (demande d'Amir : « la consultation est
// envoyée à toute la liste des adresses mail référencées du prestataire ») ;
// l'e-mail ne donne plus l'adresse principale comme identifiant commun.
//
// v18 (12/10/2026, règle d'Amir : « si j'envoie une consultation à quelqu'un
// qui n'a pas de compte, ça lui crée le compte et lui envoie une invite en même
// temps que ça lui dit qu'il y a une consultation en cours. Ça peut le faire
// aussi si je relance la consultation ») :
//   • un e-mail par adresse (le lien d'activation est personnel) ;
//   • une adresse de la fiche sans accès voit son compte créé et relié à
//     l'entreprise (mêmes règles que creer-espace-prestataire v2 : adresse
//     prise par un compte d'un autre rôle ou d'une autre entreprise = pas
//     d'accès) ; son e-mail annonce la consultation et porte le lien pour
//     choisir son mot de passe, qui mène ensuite à la consultation ;
//   • une personne invitée qui n'a pas encore choisi son mot de passe reçoit
//     un lien neuf avec la consultation ;
//   • « Relancer les alertes » repasse aussi par les entreprises déjà
//     prévenues : une adresse jamais servie (ajoutée à la fiche depuis, ou
//     envoi en erreur) reçoit la consultation, une adresse servie mais sans
//     accès reçoit son invitation avec la consultation ; une adresse déjà
//     servie et déjà pourvue d'un accès ne reçoit rien de plus ;
//   • le journal compte une ligne par adresse (les anciennes lignes regroupent
//     les adresses d'une entreprise, séparées par « , »).
// Les adresses de contacts choisies (0139) hors de la fiche reçoivent la
// consultation sans accès : un accès suit une adresse de la fiche (0162).
//
// Envoi réel via Resend si le secret RESEND_API_KEY est configuré
// (supabase secrets set RESEND_API_KEY=re_xxx [RESEND_FROM="Strat Eco <consultations@strateco.fr>"] [APP_URL=https://...]).
// Sans clé : chaque notification est journalisée avec le statut 'simule'
// et aucun compte n'est créé - le parcours reste testable sans provider.
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

const ADRESSE_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const ENTITES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ENTITES[ch] ?? ch);

/** Initiales : première lettre du premier et du dernier mot du nom (comme creer-espace-prestataire). */
function initialesDe(nom: string): string {
  const mots = nom.trim().split(/\s+/);
  const premiere = mots[0]?.[0] ?? "";
  const derniere = mots.length > 1 ? mots[mots.length - 1][0] : (mots[0]?.[1] ?? "");
  return (premiere + derniere).toUpperCase();
}

const ROLE_LIBELLE: Record<string, string> = {
  amo: "un compte Strat Eco",
  syndic: "un compte syndic",
  copro: "un compte copropriétaire",
  moe: "un compte maître d'œuvre",
};

interface Fiche {
  id: string;
  raison_sociale: string;
  contact_nom: string | null;
  email: string;
  emails_secondaires: string[] | null;
  departements: string[] | null;
  ne_pas_consulter: boolean;
}
type Contact = { prestataire_id: string; nom: string | null; email: string | null };

/** Adresses de la fiche (principale + autres), en minuscules et sans doublon. */
function adressesFiche(p: Fiche): string[] {
  return [...new Set([p.email, ...(p.emails_secondaires ?? [])].map(norm).filter(Boolean))];
}

/**
 * Adresses qui reçoivent la consultation pour une entreprise. Sans choix :
 * principale + copies (0106). Avec choix : les adresses choisies encore connues
 * de l'entreprise (fiche ou contacts) ; s'il n'en reste aucune, retour à
 * l'envoi d'office.
 */
function destinatairesDe(p: Fiche, choisies: string[] | undefined, contacts: Contact[]): string[] {
  const fiche = adressesFiche(p);
  if (!choisies || choisies.length === 0) return fiche;
  const connues = new Set(fiche);
  for (const c of contacts) {
    const e = norm(c.email);
    if (e && ADRESSE_VALIDE.test(e)) connues.add(e);
  }
  const retenues = [...new Set(choisies.map(norm))].filter((e) => connues.has(e));
  return retenues.length > 0 ? retenues : fiche;
}

/** Nom de la personne d'une adresse : son contact, sinon le contact de la fiche pour l'adresse principale. */
function nomDe(p: Fiche, contacts: Contact[], email: string): string | null {
  const c = contacts.find((x) => norm(x.email) === email && (x.nom ?? "").trim() && !(x.nom ?? "").includes("@"));
  if (c) return c.nom!.trim();
  if (email === norm(p.email) && (p.contact_nom ?? "").trim()) return p.contact_nom!.trim();
  return null;
}

/** Accès d'une adresse à l'espace de l'entreprise, au moment de l'envoi. */
type Acces =
  | { etat: "actif"; userId: string } // compte relié, déjà utilisé
  | { etat: "a_activer"; userId: string } // compte relié, mot de passe à choisir
  | { etat: "relie_connecte"; userId: string } // compte déjà utilisé ailleurs, relié par cet envoi
  | { etat: "sans_acces"; motif: string; refuse: boolean }; // refuse : adresse de la fiche qui ne peut pas avoir d'accès

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

// au-delà, les entreprises restantes attendent la prochaine relance (la
// fonction est coupée vers 150 s ; le journal par adresse permet de reprendre)
const BUDGET_MS = 110_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });
  const debut = Date.now();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- L'appelant : AMO actif, ou syndic auteur de la demande PPT liée (le JWT est déjà vérifié par la gateway) ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });
  const appelantId = userData.user.id;

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("user_id", appelantId)
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
  if (profile.role !== "amo" && demandePpt?.demandeur_user_id !== appelantId) {
    return json(403, { error: "Réservé à l'équipe AMO" });
  }

  const { data: cs, error: csErr } = await admin
    .from("consultations")
    .select("*, coproprietes(name, adresse, city, code_postal)")
    .eq("id", consultation_id)
    .maybeSingle();
  if (csErr || !cs) return json(404, { error: "Consultation introuvable" });

  // --- Prestataires référencés actifs couvrant ce métier ---
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

  // Adresses déjà servies pour cette consultation, par entreprise (un envoi en
  // erreur sera retenté)
  const { data: deja, error: dejaErr } = await admin
    .from("consultation_notifications")
    .select("prestataire_id, email, statut")
    .eq("consultation_id", consultation_id);
  if (dejaErr) return json(500, { error: dejaErr.message });
  const servies = new Map<string, Set<string>>();
  for (const n of deja ?? []) {
    if (n.statut === "erreur" || !n.prestataire_id) continue;
    const s = servies.get(n.prestataire_id) ?? new Set<string>();
    for (const e of (n.email ?? "").split(",")) if (norm(e)) s.add(norm(e));
    servies.set(n.prestataire_id, s);
  }

  // consultation restreinte (0125) : les seules entreprises choisies, départements ignorés
  const choisis: string[] | null = cs.prestataires_choisis ?? null;
  const fiches = ((prestas ?? []) as Fiche[]).filter((p) => !choisis || choisis.includes(p.id));
  const couvre = (p: Fiche) =>
    !!choisis || !departement || (p.departements ?? []).length === 0 || (p.departements ?? []).includes(departement);
  // écartées (0122) : comptées parmi les entreprises pas encore prévenues, comme avant
  const nouvelles = fiches.filter((p) => !servies.has(p.id));
  const horsConsultation = nouvelles.filter((p) => p.ne_pas_consulter).length;
  const horsDepartement = nouvelles.filter((p) => !p.ne_pas_consulter && !couvre(p)).length;
  const cibles = fiches.filter((p) => !p.ne_pas_consulter && couvre(p));
  const ids = cibles.map((p) => p.id);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

  // adresses choisies par l'équipe pour certaines entreprises (0139), contacts
  // (noms des personnes) et accès déjà ouverts (0162)
  const [{ data: choixAdresses }, { data: contactsData }, { data: comptesData, error: comptesErr }] = await Promise.all([
    admin.from("consultation_destinataires").select("prestataire_id, emails").eq("consultation_id", consultation_id),
    ids.length
      ? admin.from("prestataire_contacts").select("prestataire_id, nom, email").in("prestataire_id", ids)
      : Promise.resolve({ data: [] as Contact[] }),
    ids.length
      ? admin.from("prestataire_comptes").select("user_id, prestataire_id, email").in("prestataire_id", ids)
      : Promise.resolve({ data: [] as { user_id: string; prestataire_id: string; email: string }[], error: null }),
  ]);
  if (comptesErr) return json(500, { error: comptesErr.message });
  const adressesChoisies = new Map<string, string[]>(
    (choixAdresses ?? []).map((r: { prestataire_id: string; emails: string[] }) => [r.prestataire_id, r.emails]),
  );
  const contacts = (contactsData ?? []) as Contact[];
  const membres = new Map<string, string>(
    (comptesData ?? []).map((m: { user_id: string; prestataire_id: string; email: string }) => [
      `${m.prestataire_id}|${m.email}`,
      m.user_id,
    ]),
  );

  // --- Contenu commun de l'e-mail ---
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

  // lien profond : ouvre l'espace prestataire directement sur la consultation
  const cheminConsultation = `/prestataire/consultations?c=${consultation_id}`;
  const lienConsultation = `${appUrl}${cheminConsultation}`;
  const ligne = (label: string, valeur: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#666;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0;color:#1a1a1a">${valeur}</td></tr>`;
  const bouton = (href: string, libelle: string) => `
    <p style="margin:22px 0">
      <a href="${href}" style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
        ${libelle}
      </a>
    </p>`;
  const tableau = `
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
    }`;
  const pourLeSyndic = demandePpt?.syndic_name ? ` pour le compte du syndic <strong>${esc(demandePpt.syndic_name)}</strong>` : "";
  const motifEnvoi = choisis
    ? "à laquelle votre entreprise est invitée à répondre"
    : "pour laquelle votre entreprise est référencée";
  const pied = `
    <p style="color:#888;font-size:13px;border-top:1px solid #e5e5e5;padding-top:12px;margin-top:24px">
      ${
        choisis
          ? `Vous recevez cet e-mail car l'équipe Strat Eco a choisi de consulter votre entreprise, référencée « ${TYPE_LABELS[cs.type] ?? cs.type} », pour cette mission.`
          : `Vous recevez cet e-mail car votre entreprise est référencée « ${TYPE_LABELS[cs.type] ?? cs.type} » auprès de Strat Eco${departement ? ` (copropriété du département ${departement})` : ""}.`
      }
      Vos prestations, vos départements ou le choix de ne plus être consulté se règlent dans
      <a href="${appUrl}/prestataire/entreprise" style="color:#888">Mon entreprise</a> de votre espace prestataire.
    </p>`;

  /** E-mail d'une personne : la consultation, et son accès selon où il en est. */
  const htmlPour = (
    p: Fiche,
    email: string,
    nom: string | null,
    acces: Acces,
    lienActivation: string | null,
    rappel: boolean,
  ) => {
    const entreprise = esc(p.raison_sociale);
    // « de Socotec », « d'Acceo »
    const deEntreprise = /^[aeiouyàâéèêëîïôûü]/i.test(p.raison_sociale) ? `d'${entreprise}` : `de ${entreprise}`;
    const deEntrepriseFort = deEntreprise.replace(entreprise, `<strong>${entreprise}</strong>`);
    const intro = rappel
      ? `<p><strong>Strat Eco</strong>, assistant à maîtrise d'ouvrage, a lancé une consultation${pourLeSyndic}
         ${motifEnvoi}. Elle est toujours en cours et votre accès personnel à l'espace prestataire
         ${deEntrepriseFort} est désormais ouvert pour y répondre :</p>`
      : `<p><strong>Strat Eco</strong>, assistant à maîtrise d'ouvrage, lance une consultation${pourLeSyndic}
         ${motifEnvoi} :</p>`;
    let accesHtml: string;
    if (acces.etat === "a_activer") {
      accesHtml = lienActivation
        ? `${rappel ? "" : `<p>Votre accès personnel à l'espace prestataire ${deEntrepriseFort} est ouvert :
             choisissez votre mot de passe pour consulter le dossier et déposer votre offre.</p>`}
           ${bouton(lienActivation, "Choisir mon mot de passe et voir la consultation")}
           <p>Votre identifiant de connexion est votre adresse e-mail : <strong>${esc(email)}</strong>.
           Chaque personne ${deEntreprise} enregistrée auprès de Strat Eco a son propre accès au même espace.</p>
           <p style="color:#5c6470;font-size:13px">Ce lien est personnel et valable pour une durée limitée. S'il a expiré,
           rendez-vous sur <a href="${appUrl}/mot-de-passe-oublie" style="color:#355717">${appUrl}/mot-de-passe-oublie</a>
           et saisissez cette adresse : vous recevrez un nouveau lien.</p>`
        : `${bouton(lienConsultation, "Consulter le dossier et déposer mon offre")}
           <p>Votre accès personnel à l'espace prestataire ${deEntrepriseFort} est ouvert. Pour choisir votre
           mot de passe, rendez-vous sur <a href="${appUrl}/mot-de-passe-oublie" style="color:#355717">${appUrl}/mot-de-passe-oublie</a>
           et saisissez votre adresse e-mail (<strong>${esc(email)}</strong>) : vous recevrez un lien.</p>`;
    } else if (acces.etat === "actif" || acces.etat === "relie_connecte") {
      accesHtml = `${bouton(lienConsultation, "Consulter le dossier et déposer mon offre")}
        <p>${acces.etat === "relie_connecte" ? `Votre compte Strat Eco donne désormais accès à l'espace prestataire ${deEntrepriseFort}. ` : ""}Pour y accéder,
        <a href="${lienConsultation}" style="color:#355717">connectez-vous à votre espace prestataire</a> avec votre adresse e-mail
        (${esc(email)}) et votre mot de passe.
        Mot de passe oublié ? <a href="${appUrl}/mot-de-passe-oublie" style="color:#355717">Réinitialisez-le ici</a>.</p>`;
    } else {
      accesHtml = `${bouton(lienConsultation, "Consulter le dossier et déposer mon offre")}
        <p>Pour y accéder, <a href="${lienConsultation}" style="color:#355717">connectez-vous à votre espace prestataire</a>
        avec votre adresse e-mail : chaque personne de l'entreprise a son propre accès. Pas encore d'accès ?
        Écrivez-nous à <a href="mailto:admin@strateco.fr" style="color:#355717">admin@strateco.fr</a>.
        Mot de passe oublié ? <a href="${appUrl}/mot-de-passe-oublie" style="color:#355717">Réinitialisez-le ici</a>.</p>`;
    }
    return `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
        <p>Bonjour${nom ? " " + esc(nom) : ""},</p>
        ${intro}
        ${tableau}
        ${accesHtml}
        <p>À réception, votre candidature est transmise à l'équipe Strat Eco,
        qui reviendra vers vous à l'issue de la consultation.</p>
        <p>Bien cordialement,<br/><strong>L'équipe Strat Eco</strong></p>
        ${pied}
      </div>`;
  };

  /**
   * Accès d'une adresse de la fiche, ouvert s'il n'existe pas encore (mêmes
   * règles que creer-espace-prestataire v2 : une adresse prise par un compte
   * d'un autre rôle, sans rôle, ou relié à une autre entreprise n'a pas d'accès).
   */
  let accesCrees = 0;
  const accesDe = async (p: Fiche, email: string, nom: string | null): Promise<Acces> => {
    const membre = membres.get(`${p.id}|${email}`);
    if (membre) {
      const { data: u } = await admin.auth.admin.getUserById(membre);
      if (!u?.user) return { etat: "sans_acces", motif: "compte relié introuvable", refuse: true };
      return u.user.last_sign_in_at ? { etat: "actif", userId: membre } : { etat: "a_activer", userId: membre };
    }
    if (!adressesFiche(p).includes(email)) return { etat: "sans_acces", motif: "adresse d'un contact, hors fiche", refuse: false };
    if (!resendKey) return { etat: "sans_acces", motif: "simulation : aucun compte créé", refuse: false };
    if (!ADRESSE_VALIDE.test(email)) return { etat: "sans_acces", motif: "adresse invalide", refuse: true };

    const { data: comptes, error: compteErr } = await admin.rpc("compte_par_email", { p_email: email });
    if (compteErr) return { etat: "sans_acces", motif: "lecture des comptes impossible", refuse: true };
    const compte = (comptes ?? [])[0] as
      | { user_id: string; role: string | null; derniere_connexion: string | null }
      | undefined;
    let userId: string;
    let nouveau = false;
    let dejaConnecte = false;
    if (compte) {
      if (compte.role !== "presta") {
        return {
          etat: "sans_acces",
          motif: compte.role
            ? `adresse déjà utilisée par ${ROLE_LIBELLE[compte.role] ?? "un autre compte"}`
            : "adresse déjà utilisée par un compte incomplet",
          refuse: true,
        };
      }
      const { data: autre } = await admin
        .from("prestataire_comptes")
        .select("prestataires(raison_sociale)")
        .eq("user_id", compte.user_id)
        .maybeSingle();
      if (autre) {
        const f = (autre as unknown as { prestataires: { raison_sociale: string } | null }).prestataires;
        return {
          etat: "sans_acces",
          motif: `adresse déjà utilisée par le compte de ${f?.raison_sociale ?? "une autre entreprise"}`,
          refuse: true,
        };
      }
      userId = compte.user_id;
      dejaConnecte = !!compte.derniere_connexion;
    } else {
      const nomCompte = nom || p.raison_sociale;
      const { data: cree, error: creeErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: nomCompte },
      });
      if (creeErr || !cree.user) {
        console.error("createUser", email, creeErr);
        return { etat: "sans_acces", motif: "la création du compte a échoué", refuse: true };
      }
      const { error: profilErr } = await admin.from("profiles").insert({
        user_id: cree.user.id,
        full_name: nomCompte,
        initials: initialesDe(nomCompte),
        role: "presta",
      });
      if (profilErr) {
        // pas de compte orphelin sans profil
        await admin.auth.admin.deleteUser(cree.user.id);
        console.error("profil", email, profilErr);
        return { etat: "sans_acces", motif: "la création du profil a échoué", refuse: true };
      }
      userId = cree.user.id;
      nouveau = true;
    }

    const { error: relierErr } = await admin
      .from("prestataire_comptes")
      .insert({ user_id: userId, prestataire_id: p.id, email, invite_par: appelantId });
    if (relierErr) {
      console.error("Rattachement", p.id, email, relierErr);
      // compte créé par cet appel : pas de compte orphelin sans fiche (le profil suit)
      if (nouveau) await admin.auth.admin.deleteUser(userId);
      return { etat: "sans_acces", motif: "rattachement à la fiche impossible", refuse: true };
    }
    membres.set(`${p.id}|${email}`, userId);
    accesCrees++;
    return dejaConnecte ? { etat: "relie_connecte", userId } : { etat: "a_activer", userId };
  };

  /** Lien d'activation (/activer-espace, jeton vérifié au clic seulement) qui mène ensuite à la consultation. */
  const lienActivationDe = async (email: string): Promise<string | null> => {
    const { data: lien, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    const jeton = lien?.properties?.hashed_token;
    if (error || !jeton) {
      console.error("Lien d'activation impossible", email, error);
      return null;
    }
    return `${appUrl}/activer-espace?token_hash=${encodeURIComponent(jeton)}&espace=prestataire&suite=${encodeURIComponent(cheminConsultation)}`;
  };

  let envoyes = 0, simules = 0, erreurs = 0, invitations = 0, restants = 0;
  const entreprisesServies = new Set<string>();
  const accesImpossibles: { entreprise: string; email: string; motif: string }[] = [];
  let appelsResend = 0;

  for (const [i, p] of cibles.entries()) {
    if (Date.now() - debut > BUDGET_MS) {
      restants = cibles.length - i;
      break;
    }
    const contactsP = contacts.filter((c) => c.prestataire_id === p.id);
    const dejaServies = servies.get(p.id) ?? new Set<string>();

    // --- Ce que chaque adresse doit recevoir ---
    const messages: { email: string; html: string; sujet: string; invitation: { userId: string } | null }[] = [];
    for (const email of destinatairesDe(p, adressesChoisies.get(p.id), contactsP)) {
      const servie = dejaServies.has(email);
      // déjà prévenue et accès déjà ouvert : rien de plus à lui dire
      if (servie && membres.has(`${p.id}|${email}`)) continue;
      const nom = nomDe(p, contactsP, email);
      let acces: Acces;
      try {
        acces = await accesDe(p, email, nom);
      } catch (e) {
        console.error("Accès", p.id, email, e);
        acces = { etat: "sans_acces", motif: "erreur inattendue", refuse: true };
      }
      if (acces.etat === "sans_acces" && acces.refuse) {
        accesImpossibles.push({ entreprise: p.raison_sociale, email, motif: acces.motif });
      }
      // déjà prévenue : seul un accès tout juste ouvert justifie un nouvel e-mail
      if (servie && acces.etat !== "a_activer" && acces.etat !== "relie_connecte") continue;
      const lienActivation = acces.etat === "a_activer" ? await lienActivationDe(email) : null;
      messages.push({
        email,
        sujet: servie
          ? `Consultation en cours ${typeLabel} - ${coproNom} : votre accès à l'espace prestataire`
          : `Nouvelle consultation ${typeLabel} - ${coproNom}`,
        html: htmlPour(p, email, nom, acces, lienActivation, servie),
        invitation: acces.etat === "a_activer" || acces.etat === "relie_connecte" ? { userId: acces.userId } : null,
      });
    }
    if (messages.length === 0) continue;
    entreprisesServies.add(p.id);

    // --- Envoi : un e-mail par personne, en un seul appel par entreprise ---
    let statut: "simule" | "envoye" | "erreur" = "simule";
    let erreur: string | null = null;
    if (resendKey) {
      // Resend limite le débit : un appel par demi-seconde au plus
      if (appelsResend++ > 0) await pause(600);
      try {
        const r = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(messages.map((m) => ({ from, to: [m.email], subject: m.sujet, html: m.html }))),
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

    await admin.from("consultation_notifications").insert(
      messages.map((m) => ({ consultation_id, prestataire_id: p.id, email: m.email, statut, erreur })),
    );
    if (statut === "envoye") {
      envoyes += messages.length;
      const invites = messages.filter((m) => m.invitation).map((m) => m.invitation!.userId);
      invitations += invites.length;
      if (invites.length) {
        // « Invitée le … » du bloc Accès de la Base prestataires
        await admin
          .from("prestataire_comptes")
          .update({ invite_le: new Date().toISOString(), invite_par: appelantId })
          .in("user_id", invites);
      }
    } else if (statut === "simule") simules += messages.length;
    else erreurs += messages.length;
  }

  return json(200, {
    // e-mails (un par personne)
    total: envoyes + simules + erreurs,
    envoyes,
    simules,
    erreurs,
    // entreprises qui ont reçu au moins un e-mail
    entreprises: entreprisesServies.size,
    // accès ouverts par cet envoi, e-mails portant un lien d'accès, adresses de la fiche sans accès possible
    acces_crees: accesCrees,
    invitations,
    acces_impossibles: accesImpossibles,
    // entreprises non traitées faute de temps : à reprendre par « Relancer les alertes »
    restants,
    // entreprises du métier écartées (0122) : « Ne pas consulter », autre département
    hors_consultation: horsConsultation,
    hors_departement: horsDepartement,
    departement,
    // consultation restreinte (0125) : nombre d'entreprises choisies, null = ouverte au métier
    choisis: choisis?.length ?? null,
    mode: resendKey ? "resend" : "simulation",
  });
});
