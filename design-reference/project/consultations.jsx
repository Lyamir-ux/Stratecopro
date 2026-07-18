// consultations.jsx — Marketplace de consultations d'intervenants
//  · AMO : publier & suivre des consultations (MOE, diagnostiqueur, CT, SPS…)
//  · MOE : appels à candidature ouverts, postuler

function typeOf(id) { return window.CONSULT_TYPES.find((t) => t.id === id) || window.CONSULT_TYPES[4]; }
function coproOf(copros, id) { return copros.find((c) => c.id === id); }
function fmtDate(iso) { try { return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }); } catch (e) { return iso; } }
function joursRestants(iso) {
  const ms = new Date(iso) - new Date("2026-06-14");
  return Math.round(ms / 86400000);
}

function TypeTag({ type }) {
  const t = typeOf(type);
  return <span className="cs-type"><Icon name={t.icon} size={13} />{t.label}</span>;
}

/* ====================== Espace AMO — Consulter un intervenant ====================== */
function ConsultationsAMO({ consultations, copros, onPublish, onClose }) {
  const [form, setForm] = React.useState(false);
  const [draft, setDraft] = React.useState({ type: "moe", coproId: copros[0].id, mission: "", dateLimite: "2026-07-15", budget: "" });
  const [openCand, setOpenCand] = React.useState(null);

  const set = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const publish = () => {
    if (!draft.mission.trim()) return;
    onPublish({ ...draft, budget: Number(draft.budget) || 0 });
    setDraft({ type: "moe", coproId: copros[0].id, mission: "", dateLimite: "2026-07-15", budget: "" });
    setForm(false);
  };

  const enLigne = consultations.filter((c) => c.statut === "en ligne");
  const closed = consultations.filter((c) => c.statut !== "en ligne");

  const Card = (cs) => {
    const c = coproOf(copros, cs.coproId);
    const jr = joursRestants(cs.dateLimite);
    const open = openCand === cs.id;
    return (
      <div className={"cs-card" + (cs.statut !== "en ligne" ? " closed" : "")} key={cs.id}>
        <div className="cs-card-head">
          <TypeTag type={cs.type} />
          <span className="spacer" style={{ flex: 1 }}></span>
          {cs.statut === "en ligne"
            ? <Badge kind={jr <= 5 ? "warn" : "success"} dot>{jr > 0 ? "En ligne · J−" + jr : "Échéance dépassée"}</Badge>
            : <Badge kind="neutral">Clôturée</Badge>}
        </div>
        <div className="cs-copro">{c ? c.name : cs.coproId} <span className="cs-loc">· {c ? (c.adresse || c.city) : ""}</span></div>
        <p className="cs-mission">{cs.mission}</p>
        <div className="cs-meta">
          <span><Icon name="calendar" size={14} />Réponses avant le {fmtDate(cs.dateLimite)}</span>
          {cs.budget > 0 && <span><Icon name="euro" size={14} />{window.fmtEuro(cs.budget)} estimé</span>}
        </div>
        <div className="cs-foot">
          <button className="cs-cand-toggle" onClick={() => setOpenCand(open ? null : cs.id)}>
            <Icon name="users" size={15} />{cs.candidatures.length} candidature{cs.candidatures.length > 1 ? "s" : ""}
            <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
          </button>
          <span className="spacer" style={{ flex: 1 }}></span>
          {cs.statut === "en ligne" && <button className="se-btn se-btn-ghost btn-sm" onClick={() => onClose(cs.id)}>Clôturer</button>}
        </div>
        {open && (
          <div className="cs-cand-list">
            {cs.candidatures.length === 0 && <div className="cs-cand-empty">Aucune candidature reçue pour le moment.</div>}
            {cs.candidatures.map((cand, i) => (
              <div className="cs-cand" key={i}>
                <Avatar who={cand.org.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()} sm />
                <span className="cs-cand-org">{cand.org}</span>
                <span className="cs-cand-date">{cand.date}</span>
                <span className="spacer" style={{ flex: 1 }}></span>
                <Badge kind={cand.statut === "retenue" ? "success" : cand.statut === "non retenue" ? "neutral" : "primary"}>{cand.statut}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Consulter un intervenant</h1>
          <p className="page-sub">Publiez une consultation et suivez les candidatures des intervenants (MOE, diagnostiqueur, contrôleur technique, SPS…)</p>
        </div>
        <span className="spacer"></span>
        {!form && <button className="se-btn se-btn-primary" onClick={() => setForm(true)}><Icon name="megaphone" size={17} />Publier une consultation</button>}
      </div>

      {form && (
        <div className="panel cs-form">
          <div className="p-head"><Icon name="megaphone" size={18} /><h3>Nouvelle consultation</h3>
            <span style={{ flex: 1 }}></span>
            <button className="se-btn se-btn-ghost btn-sm" onClick={() => setForm(false)}>Annuler</button></div>
          <div className="p-body">
            <div className="cs-form-grid">
              <div className="cs-field">
                <label>Type d'intervenant</label>
                <div className="cs-type-pick">
                  {window.CONSULT_TYPES.map((t) => (
                    <button key={t.id} className={"cs-type-opt" + (draft.type === t.id ? " on" : "")} onClick={() => set("type", t.id)}>
                      <Icon name={t.icon} size={15} />{t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cs-field">
                <label>Copropriété concernée</label>
                <select className="edit-sel" style={{ maxWidth: "none", width: "100%" }} value={draft.coproId} onChange={(e) => set("coproId", e.target.value)}>
                  {copros.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
                </select>
              </div>
              <div className="cs-field cs-field-full">
                <label>Description de la mission</label>
                <textarea className="cs-textarea" rows={3} value={draft.mission} placeholder="Périmètre, attendus, contraintes particulières…" onChange={(e) => set("mission", e.target.value)}></textarea>
              </div>
              <div className="cs-field">
                <label>Date limite de réponse</label>
                <input className="edit-inp" style={{ maxWidth: "none" }} type="date" value={draft.dateLimite} onChange={(e) => set("dateLimite", e.target.value)} />
              </div>
              <div className="cs-field">
                <label>Budget estimatif <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· optionnel</span></label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input className="edit-inp" style={{ maxWidth: "none" }} type="number" value={draft.budget} placeholder="0" onChange={(e) => set("budget", e.target.value)} />
                  <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>€ HT</span>
                </div>
              </div>
            </div>
            <button className="se-btn se-btn-primary" style={{ marginTop: 18 }} onClick={publish}><Icon name="megaphone" size={16} />Mettre en ligne la consultation</button>
          </div>
        </div>
      )}

      <div className="cs-section-label">En ligne · {enLigne.length}</div>
      <div className="cs-grid">{enLigne.map(Card)}</div>
      {closed.length > 0 && <>
        <div className="cs-section-label" style={{ marginTop: 28 }}>Clôturées · {closed.length}</div>
        <div className="cs-grid">{closed.map(Card)}</div>
      </>}
    </div>
  );
}

/* ====================== Espace MOE — Consultation en cours ====================== */
function ConsultationsMOE({ consultations, copros, onApply }) {
  const org = window.MOE_ORG;
  // appels à candidature ouverts pour la maîtrise d'œuvre
  const open = consultations.filter((c) => c.type === "moe" && c.statut === "en ligne");
  const applied = (cs) => cs.candidatures.some((x) => x.org === org);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Consultations en cours</h1>
          <p className="page-sub">Appels à candidature de maîtrise d'œuvre publiés par les AMO — postulez aux opérations qui vous intéressent</p>
        </div>
        <span className="spacer"></span>
        <div className="mt-tally"><span><b>{open.length}</b> ouvertes</span><span className="dot"></span><span><b>{open.filter(applied).length}</b> candidatures</span></div>
      </div>

      {open.length === 0 && (
        <div className="placeholder-screen" style={{ minHeight: 320 }}>
          <div className="ps-ico"><Icon name="megaphone" size={30} /></div>
          <h2>Aucune consultation ouverte</h2>
          <p>Les appels à candidature de maîtrise d'œuvre publiés par les AMO apparaîtront ici.</p>
        </div>
      )}

      <div className="cs-grid">
        {open.map((cs) => {
          const c = coproOf(copros, cs.coproId);
          const jr = joursRestants(cs.dateLimite);
          const has = applied(cs);
          return (
            <div className="cs-card mp" key={cs.id}>
              <div className="cs-card-head">
                <TypeTag type={cs.type} />
                <span className="spacer" style={{ flex: 1 }}></span>
                <Badge kind={jr <= 5 ? "warn" : "success"} dot>{jr > 0 ? "J−" + jr : "Dernier jour"}</Badge>
              </div>
              <div className="cs-copro">{c ? c.name : cs.coproId}</div>
              <div className="cs-loc-line"><Icon name="mapPin" size={14} />{c ? (c.adresse || (c.city + " · " + c.quartier)) : ""}</div>
              <div className="cs-mp-badges">
                {c && <PhaseBadge phase={c.phase} />}
                {c && c.fragile && <Badge kind="warn">Fragile</Badge>}
                {c && <span className="cs-mp-lots">{c.lots} lots · {c.batiments} bât.</span>}
              </div>
              <p className="cs-mission">{cs.mission}</p>
              <div className="cs-meta">
                <span><Icon name="calendar" size={14} />Avant le {fmtDate(cs.dateLimite)}</span>
                {cs.budget > 0 && <span><Icon name="euro" size={14} />{window.fmtEuro(cs.budget)} estimé</span>}
              </div>
              <div className="cs-foot">
                <span className="cs-cand-count"><Icon name="users" size={14} />{cs.candidatures.length} candidat{cs.candidatures.length > 1 ? "s" : ""}</span>
                <span className="spacer" style={{ flex: 1 }}></span>
                {has
                  ? <span className="cs-applied"><Icon name="check" size={15} />Candidature envoyée</span>
                  : <button className="se-btn se-btn-primary btn-sm" onClick={() => onApply(cs.id, org)}><Icon name="send" size={15} />Postuler</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { ConsultationsAMO, ConsultationsMOE });
