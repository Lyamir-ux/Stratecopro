// Edge function « notifier-piece-refusee » - appelée par l'app après qu'un
// membre de l'équipe Strat Eco a qualifié « refusée » une pièce justificative
// déposée par un copropriétaire sur son portail (feedback Amir 10/09/2026).
// Envoie au copropriétaire un e-mail qui nomme la pièce, le problème constaté
// et l'invite à déposer une nouvelle version ; trace le statut d'envoi sur la
// ligne (refus_email_statut : envoye | simule | erreur | sans_email).
//
// Envoi réel via Resend si le secret RESEND_API_KEY est configuré ; sans clé,
// l'envoi est simulé et la réponse l'indique (même convention que les autres
// notifications).
//
// v2 (30/09/2026) : libellés des pièces demandées selon la situation (0118), et
// lien vers l'enquête sociale du portail, où se déposent désormais les pièces
// (l'onglet « Mes documents » n'existe plus depuis le 22/09).
//
// v3 (09/10/2026, retour de A CHELGHAM) : les pièces que la banque demande pour le
// prêt collectif se déposent dans « Mon financement », après la signature des
// bulletins : le lien y renvoie pour ces pièces. Kbis, statuts et avis des
// associés restent dans l'enquête pour une SCI à l'IR occupée par un associé
// (même règle que src/lib/piecesSituation.ts, piecesEnquete / piecesDossierPret).
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

const LIBELLE_PIECE: Record<string, string> = {
  avis_imposition: "Avis d'imposition (N-1)",
  piece_identite: "Pièce d'identité",
  rib: "RIB",
  justificatif_domicile: "Justificatif de domicile",
  taxe_fonciere: "Taxe foncière",
  avis_imposition_2: "Second avis d'imposition définitif (N-1)",
  justificatif_usufruit: "Justificatif d'usufruit",
  pret_usage_notarie: "Contrat de prêt à usage notarié",
  kbis_sci: "Extrait Kbis de la SCI",
  statuts_sci: "Statuts de la SCI",
  avis_associes_sci: "Avis d'imposition de tous les associés",
  jugement_protection: "Jugement de tutelle ou de curatelle",
};

/** Pièces que seule la banque demande : toujours dans « Mon financement ». */
const PIECES_PRET = ["justificatif_domicile", "taxe_fonciere"];
/** Pièces de SCI : enquête si la SCI à l'IR est occupée par un associé, sinon dossier de prêt. */
const PIECES_SCI = ["kbis_sci", "statuts_sci", "avis_associes_sci"];
const SCI_IR = "SCI soumise à l'impôt sur le revenu";

type ReponsesEnquete = { copro?: Record<string, unknown>; lots?: Record<string, Record<string, unknown>> } | null;

/** La SCI déclarée à l'enquête est-elle à l'IR et occupée par un associé ? */
function sciIrOccupee(reponses: ReponsesEnquete): boolean {
  if (reponses?.copro?.["type-coproprietaire"] !== SCI_IR) return false;
  return Object.values(reponses?.lots ?? {}).some((l) => typeof l["associes-occupants"] === "number" && (l["associes-occupants"] as number) > 0);
}

const MOTIF_QUALIFICATION: Record<string, string> = {
  illisible: "le document est illisible (photo floue, page coupée ou trop sombre)",
  incomplet: "le document est incomplet (il manque une ou plusieurs pages)",
  mauvaise_annee: "le document ne porte pas sur la bonne année",
  mauvais_document: "le fichier déposé ne correspond pas à la pièce demandée",
  perime: "le document est trop ancien",
  autre: "le document ne peut pas être retenu en l'état",
};

const echap = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- Vérificateur authentifié : équipe AMO active uniquement ---
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json(401, { error: "Session invalide" });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, full_name")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile || !profile.active || profile.role !== "amo") return json(403, { error: "Réservé à l'équipe Strat Eco" });

  const { piece_id } = await req.json().catch(() => ({}));
  if (!piece_id) return json(400, { error: "piece_id attendu" });

  const { data: piece } = await admin
    .from("pieces_justificatives")
    .select("id, type, name, copro_id, coproprietaire_id, statut, qualification, motif_refus, uploaded_at, verifiee_par_nom")
    .eq("id", piece_id)
    .maybeSingle();
  if (!piece) return json(404, { error: "Pièce introuvable" });
  if (piece.statut !== "refuse") return json(200, { skipped: "pièce non refusée" });

  const [{ data: cp }, { data: copro }] = await Promise.all([
    admin.from("coproprietaires").select("id, nom, email, user_id").eq("id", piece.coproprietaire_id).maybeSingle(),
    admin.from("coproprietes").select("id, name").eq("id", piece.copro_id).maybeSingle(),
  ]);
  if (!cp || !copro) return json(404, { error: "Copropriétaire ou copropriété introuvable" });

  // Adresse : compte de connexion du copropriétaire, à défaut l'e-mail de la fiche
  let email: string | null = null;
  if (cp.user_id) {
    const { data: u } = await admin.auth.admin.getUserById(cp.user_id);
    email = u?.user?.email ?? null;
  }
  if (!email) email = cp.email ?? null;

  const tracer = async (statut: string) => {
    await admin
      .from("pieces_justificatives")
      .update({ refus_email_statut: statut, refus_email_le: new Date().toISOString() })
      .eq("id", piece.id);
  };

  if (!email) {
    await tracer("sans_email");
    return json(200, { mode: "sans_email" });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Strat Eco <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://stratecopro.vercel.app";

  const libelle = LIBELLE_PIECE[piece.type] ?? piece.type;
  let dossierPret = PIECES_PRET.includes(piece.type);
  if (PIECES_SCI.includes(piece.type)) {
    const { data: reps } = await admin.from("enquete_reponses").select("reponses").eq("coproprietaire_id", cp.id);
    dossierPret = !(reps ?? []).some((r) => sciIrOccupee(r.reponses as ReponsesEnquete));
  }
  const rubrique = dossierPret ? "Mon financement" : "Enquête sociale";
  const lien = `${appUrl}/portail/${dossierPret ? "pret" : "enquete"}`;
  const motif = (piece.motif_refus && piece.motif_refus.trim()) ||
    MOTIF_QUALIFICATION[piece.qualification ?? ""] ||
    MOTIF_QUALIFICATION.autre;
  const deposeeLe = new Date(piece.uploaded_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  if (!resendKey) {
    await tracer("simule");
    return json(200, { mode: "simulation", to: email });
  }

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14.5px;line-height:1.55;color:#1a1a1a;max-width:620px">
      <p>Bonjour ${echap(cp.nom)},</p>
      <p>Vous avez déposé le ${deposeeLe}, sur votre portail Strat Eco pro, la pièce
      <strong>${echap(libelle)}</strong> (fichier « ${echap(piece.name)} ») pour la copropriété
      <strong>${echap(copro.name)}</strong>.</p>
      <p>Après vérification par l'équipe Strat Eco, cette pièce ne peut pas être retenue :</p>
      <p style="padding:10px 14px;background:#fdecec;border-left:3px solid #DC2626;border-radius:4px">
        <strong>${echap(motif.charAt(0).toUpperCase() + motif.slice(1))}.</strong>
      </p>
      <p>Merci de déposer une nouvelle version depuis votre portail, rubrique « ${rubrique} » :
      elle remplacera la précédente et sera vérifiée à son tour.</p>
      <p style="margin:22px 0">
        <a href="${lien}"
           style="background:#355717;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
          Déposer une nouvelle version
        </a>
      </p>
      <p style="color:#666;font-size:13px">Vos pièces sont stockées de manière sécurisée et ne sont visibles que
      par vous et l'équipe Strat Eco. Pour toute question, répondez à ce message.</p>
      <p>Bien cordialement,<br/><strong>${echap(piece.verifiee_par_nom ?? profile.full_name ?? "L'équipe Strat Eco")}</strong><br/>Strat Eco pro</p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Pièce à redéposer - ${libelle} · ${copro.name}`,
        html,
      }),
    });
    await tracer(r.ok ? "envoye" : "erreur");
    return json(200, { mode: "resend", statut: r.ok ? "envoye" : "erreur" });
  } catch {
    await tracer("erreur");
    return json(200, { mode: "resend", statut: "erreur" });
  }
});
