// copro.jsx — Espace copropriétaire (portail)

// ---------- Cascade financière réutilisable ----------
function Cascade({ total, rows, reste }) {
  const colorVar = { primary: "var(--color-primary-500)", blue: "var(--color-secondary-500)", dark: "var(--color-neutral-700)" };
  return (
    <div className="cascade">
      <div className="casc-row casc-total">
        <div className="cr-top">
          <span className="cr-lbl"><span className="sw" style={{ background: colorVar.dark }}></span>{total.l}</span>
          <span className="cr-val">{window.fmtEuro(total.v)}</span>
        </div>
        <div className="casc-track"><i style={{ width: "100%", background: colorVar.dark }}></i></div>
      </div>
      {rows.map((r, i) => (
        <div className="casc-row" key={i}>
          <div className="cr-top">
            <span className="cr-lbl"><span className="sw" style={{ background: colorVar[r.k] || colorVar.primary }}></span>− {r.l}</span>
            <span className="cr-val minus">− {window.fmtEuro(r.v)}</span>
          </div>
          <div className="casc-track"><i style={{ width: Math.max(3, (r.v / total.v) * 100) + "%", background: colorVar[r.k] || colorVar.primary }}></i></div>
        </div>
      ))}
      {reste && (
        <div className="casc-reste">
          <span className="l">{reste.l}</span>
          <span className="v">{window.fmtEuro(reste.v)}</span>
        </div>
      )}
    </div>
  );
}

// ---------- Écran de sélection de copropriété ----------
function CoproSelect({ copros, user, onPick }) {
  const mine = copros.filter((c) => user.coproIds.includes(c.id));
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-soft)", display: "flex", flexDirection: "column" }}>
      <div className="portal-header">
        <img className="ph-logo" src={(window.__resources && window.__resources.logoDark) || "assets/logo-strateco.svg"} alt="Strat Eco" />
        <span className="ph-spacer"></span>
        <div className="ph-user"><Avatar who={user.initials} /><span><span className="nm" style={{ display: "block" }}>{user.name}</span><span className="rl">Copropriétaire</span></span></div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
          <div className="se-eyebrow" style={{ justifyContent: "center" }}>Votre espace</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 34, margin: "10px 0 8px", letterSpacing: "-0.02em" }}>Bonjour {user.name.split(" ")[0]}</h1>
          <p className="se-body" style={{ marginTop: 0, marginBottom: 28 }}>Sélectionnez votre copropriété pour accéder au suivi de votre projet de rénovation.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mine.map((c) => (
              <button key={c.id} className="copro-card" onClick={() => onPick(c.id)}
                style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)" }}>
                <span style={{ width: 64, height: 64, borderRadius: "var(--radius-md)", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: window.THUMB_BG, color: "var(--color-primary-700)" }}>
                  <Icon name="building" size={28} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>{c.name}</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--fg3)" }}>{c.city} · {c.quartier} · Lot n°{user.lot.num}</span>
                </span>
                <PhaseBadge phase={c.phase} />
                <Icon name="arrowRight" size={20} style={{ color: "var(--accent)" }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- En-tête + navigation du portail ----------
function PortalHeader({ copro, user, onLogout, onSwitch }) {
  return (
    <header className="portal-header">
      <img className="ph-logo" src={(window.__resources && window.__resources.logoDark) || "assets/logo-strateco.svg"} alt="Strat Eco" />
      <div className="ph-copro">
        <Icon name="building" size={18} style={{ color: "var(--accent)" }} />
        <span className="nm">{copro.name}</span>
        <PhaseBadge phase={copro.phase} />
      </div>
      <span className="ph-spacer"></span>
      <button className="se-btn se-btn-ghost btn-sm" onClick={onSwitch}><Icon name="building" size={15} />Changer</button>
      <div className="ph-user">
        <Avatar who={user.initials} />
        <span><span className="nm" style={{ display: "block" }}>{user.name}</span><span className="rl">Lot n°{user.lot.num}</span></span>
        <button className="icon-btn" onClick={onLogout} title="Se déconnecter"><Icon name="logOut" size={18} /></button>
      </div>
    </header>
  );
}

function PortalNav({ section, setSection, flags }) {
  const items = [
    { id: "accueil", label: "Accueil", icon: "home" },
    { id: "plan-indiv", label: "Mes quotes-parts", icon: "euro" },
    { id: "enquete", label: "Enquête sociale", icon: "clipboard", badge: flags.enquete },
    { id: "pret", label: "Mon financement", icon: "trendingUp", badge: flags.pret },
    { id: "documents", label: "Mes documents", icon: "folder", badge: flags.documents },
    { id: "plan-copro", label: "Plan de la copropriété", icon: "barChart" },
  ];
  return (
    <nav className="portal-nav">
      {items.map((it) => (
        <button key={it.id} className={"pnav" + (section === it.id ? " on" : "")} onClick={() => setSection(it.id)}>
          <Icon name={it.icon} size={17} />{it.label}
          {it.badge ? <span className="pn-badge">!</span> : null}
        </button>
      ))}
    </nav>
  );
}

// ---------- Accueil ----------
function Accueil({ copro, user, indiv, profil, docsDone, docsReq, adhered, go }) {
  const aidesTotal = indiv.aidesIndiv + indiv.cee + indiv.aidesCollAffectees;
  const phaseIdx = window.PHASES.findIndex((p) => p.id === copro.phase);
  const todos = [
    { id: "enquete", done: !!profil, ico: "clipboard", title: "Compléter l'enquête sociale", sub: profil ? "Profil déterminé : " + profil : "Pour estimer vos aides individuelles", go: "enquete" },
    { id: "documents", done: docsDone >= docsReq, ico: "folder", title: "Téléverser vos pièces justificatives", sub: docsDone + "/" + docsReq + " pièces obligatoires fournies", go: "documents" },
    { id: "pret", done: adhered, ico: "trendingUp", title: "Choisir votre financement", sub: adhered ? "Choix transmis" : "Prêt collectif, individuel ou fonds propres", go: "pret" },
  ];
  return (
    <div className="fade">
      <div className="greet">
        <h1>Bonjour {user.name.split(" ")[0]}</h1>
        <p>Voici le suivi de la rénovation énergétique de la copropriété <b>{copro.name}</b>. Le projet est en phase <b>{window.PHASES[phaseIdx].label}</b> : retrouvez ici votre plan de financement, l'enquête sociale et vos documents.</p>
        <div className="timeline">
          {window.PHASES.map((p, i) => (
            <div key={p.id} className={"tl-step " + (i < phaseIdx ? "done" : i === phaseIdx ? "cur" : "")}>
              <div className="bar"></div>
              <div className="tl-node">{i < phaseIdx ? <Icon name="check" size={16} /> : i + 1}</div>
              <div className="tl-lbl">{p.label}</div>
              <div className="tl-sub">{i < phaseIdx ? "Terminé" : i === phaseIdx ? "En cours" : "À venir"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="tiles" style={{ marginBottom: 26 }}>
        <div className="tile">
          <div className="t-lbl"><Icon name="euro" size={16} />Votre quote-part de travaux</div>
          <div className="t-val">{window.fmtEuro(indiv.quotePart)}</div>
          <div className="t-foot">Tantièmes {user.lot.tantiemes}/1000</div>
        </div>
        <div className="tile">
          <div className="t-lbl"><Icon name="leaf" size={16} />Vos aides estimées</div>
          <div className="t-val accent">{window.fmtEuro(aidesTotal)}</div>
          <div className="t-foot">MaPrimeRénov' + CEE + collectif</div>
        </div>
        <div className="tile">
          <div className="t-lbl"><Icon name="trendingUp" size={16} />Votre reste à charge</div>
          <div className="t-val">{window.fmtEuro(indiv.resteACharge)}</div>
          <div className="t-foot">Avant financement par prêt</div>
        </div>
      </div>

      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 21, margin: "0 0 14px" }}>À faire</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {todos.map((t) => (
          <div key={t.id} className={"todo-card" + (t.done ? " done" : "")} onClick={() => go(t.go)}>
            <span className="tc-ico"><Icon name={t.done ? "checkCircle" : t.ico} size={22} /></span>
            <div style={{ flex: 1 }}>
              <div className="tc-title">{t.title}</div>
              <div className="tc-sub">{t.sub}</div>
            </div>
            {t.done ? <Badge kind="success">Fait</Badge> : <Badge kind="warn">À faire</Badge>}
            <Icon name="chevronRight" size={20} style={{ color: "var(--fg-muted)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Mes quotes-parts (par lot, par scénario) ----------
function PlanIndividuel({ user, indiv, profil, go }) {
  const lots = user.lots || [user.lot];
  const scenarios = window.COPRO_SCENARIOS;
  const [lotIdx, setLotIdx] = React.useState(0);
  const [scnId, setScnId] = React.useState(scenarios[0].id);
  const lot = lots[lotIdx];
  const scn = scenarios.find((s) => s.id === scnId) || scenarios[0];

  // base = INDIV_PLAN calé sur 47 tantièmes (lot principal, scénario performant)
  const per = (v) => (v / 47) * lot.tantiemes * scn.mult;
  const quotePart = per(indiv.quotePart);
  const aidesIndiv = per(indiv.aidesIndiv);
  const cee = per(indiv.cee);
  const aidesColl = per(indiv.aidesCollAffectees);
  const reste = Math.max(0, quotePart - aidesIndiv - cee - aidesColl);

  const totalReste = lots.reduce((s, l) => s + Math.max(0, ((indiv.quotePart - indiv.aidesIndiv - indiv.cee - indiv.aidesCollAffectees) / 47) * l.tantiemes * scn.mult), 0);

  return (
    <div className="fade">
      <h1 className="sec-title">Mes quotes-parts</h1>
      <p className="sec-sub">{lots.length > 1 ? lots.length + " lots dans la copropriété" : "Votre lot"} · estimation par lot et par scénario de travaux voté.</p>

      <div className="qp-controls">
        {lots.length > 1 && (
          <div className="qp-group">
            <span className="qp-lbl">Lot</span>
            <div className="seg">
              {lots.map((l, i) => (
                <button key={l.num} className={i === lotIdx ? "on" : ""} onClick={() => setLotIdx(i)}>
                  Lot n°{l.num} · {l.surface} m²
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="qp-group">
          <span className="qp-lbl">Scénario</span>
          <div className="seg">
            {scenarios.map((s) => (
              <button key={s.id} className={s.id === scnId ? "on" : ""} onClick={() => setScnId(s.id)}>{s.name}</button>
            ))}
          </div>
        </div>
        {lots.length > 1 && (
          <div className="qp-total">Reste à charge cumulé ({lots.length} lots) · <b>{window.fmtEuro(totalReste)}</b></div>
        )}
      </div>

      <div className="split">
        <div className="card-xl">
          <div className="cx-head"><Icon name="euro" size={20} style={{ color: "var(--accent)" }} /><h2>Lot n°{lot.num} — de votre quote-part à votre reste à charge</h2></div>
          <div className="cx-body">
            <Cascade
              total={{ l: "Quote-part de travaux du lot n°" + lot.num, v: quotePart }}
              rows={[
                { l: "MaPrimeRénov' individuelle" + (profil ? " (profil " + profil + ")" : ""), v: aidesIndiv, k: "primary" },
                { l: "CEE — part individuelle", v: cee, k: "blue" },
                { l: "Subvention collective affectée", v: aidesColl, k: "primary" },
              ]}
              reste={{ l: "Reste à charge du lot n°" + lot.num, v: reste }}
            />
            {!profil && (
              <div className="cc-next" style={{ marginTop: 18 }}>
                <Icon name="alert" size={15} className="ico" style={{ color: "var(--color-warning-500)" }} />
                <span>Estimation basée sur le profil <b>Jaune</b>. Complétez l'enquête sociale pour affiner vos aides.</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card-xl">
            <div className="cx-head"><Icon name="user" size={19} /><h2 style={{ fontSize: 18 }}>Lot sélectionné</h2></div>
            <div className="cx-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              <div className="kv"><span className="k">Lot</span><span className="v">n°{lot.num} · Bât. {lot.batiment}</span></div>
              <div className="kv"><span className="k">Type</span><span className="v">{lot.pieces} pièces · {lot.surface} m²</span></div>
              <div className="kv"><span className="k">Usage</span><span className="v">{lot.usage}</span></div>
              <div className="kv"><span className="k">Tantièmes</span><span className="v">{lot.tantiemes}/1000</span></div>
              <div className="kv"><span className="k">Scénario</span><span className="v"><Badge kind="primary" dot>{scn.name}</Badge></span></div>
              <div className="kv"><span className="k">Profil MaPrimeRénov'</span><span className="v">{profil ? <Badge kind="primary" dot>{profil}</Badge> : <span style={{ color: "var(--fg-muted)" }}>à déterminer</span>}</span></div>
            </div>
          </div>
          <button className="se-btn se-btn-secondary" onClick={() => go("pret")}><Icon name="trendingUp" size={17} />Financer mon reste à charge</button>
          <button className="se-btn se-btn-ghost"><Icon name="download" size={16} />Télécharger mes quotes-parts (PDF)</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Enquête sociale ----------
function EnqueteSociale({ profil, setProfil }) {
  const [persons, setPersons] = React.useState(3);
  const [rfr, setRfr] = React.useState(34000);
  const [statut, setStatut] = React.useState("occupant");
  const [result, setResult] = React.useState(profil);
  const compute = () => {
    const p = window.determineProfil(persons, rfr);
    setResult(p); setProfil(p);
  };
  const info = result ? window.PROFILS_MPR[result] : null;
  return (
    <div className="fade">
      <h1 className="sec-title">Enquête sociale</h1>
      <p className="sec-sub">Quelques informations confidentielles pour déterminer votre profil MaPrimeRénov' et vos aides individuelles.</p>

      <div className="split">
        <div className="card-xl">
          <div className="cx-head"><Icon name="clipboard" size={20} style={{ color: "var(--accent)" }} /><h2>Votre foyer</h2></div>
          <div className="cx-body">
            <div className="form-grid">
              <div className="fld">
                <label>Nombre de personnes au foyer</label>
                <select value={persons} onChange={(e) => setPersons(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} personne{n > 1 ? "s" : ""}</option>)}
                </select>
              </div>
              <div className="fld">
                <label>Statut d'occupation</label>
                <select value={statut} onChange={(e) => setStatut(e.target.value)}>
                  <option value="occupant">Propriétaire occupant</option>
                  <option value="bailleur">Propriétaire bailleur</option>
                </select>
              </div>
              <div className="fld" style={{ gridColumn: "1 / -1" }}>
                <label>Revenu fiscal de référence <span className="hint">(avis d'imposition, ligne 25 — Grand Est, hors Île-de-France)</span></label>
                <input type="number" value={rfr} onChange={(e) => setRfr(Number(e.target.value))} step="1000" />
              </div>
            </div>
            <button className="se-btn se-btn-primary" style={{ marginTop: 20 }} onClick={compute}>
              <Icon name="checkCircle" size={17} />Déterminer mon profil
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {info ? (
            <div className="card-xl fade">
              <div className="profil-result" style={{ background: info.color }}>
                <div className="pr-badge">{info.label}</div>
                <div className="pr-meta">
                  <div className="t">Profil {info.label}</div>
                  <div className="s">{info.desc}</div>
                </div>
              </div>
              <div className="cx-body" style={{ paddingTop: 18 }}>
                <div className="kv"><span className="k">Taux d'aide MaPrimeRénov'</span><span className="v">{info.taux}</span></div>
                <div className="kv"><span className="k">Foyer</span><span className="v">{persons} pers. · {window.fmtEuro(rfr)} / an</span></div>
                <p className="se-small" style={{ marginTop: 12 }}>Votre plan de financement individuel a été mis à jour avec ce profil.</p>
              </div>
            </div>
          ) : (
            <div className="card-xl">
              <div className="cx-body" style={{ textAlign: "center", color: "var(--fg3)" }}>
                <div style={{ width: 56, height: 56, borderRadius: "var(--radius-lg)", background: "var(--accent-soft)", color: "var(--color-primary-700)", display: "flex", alignItems: "center", justifyContent: "center", margin: "8px auto 14px" }}><Icon name="leaf" size={26} /></div>
                <p className="se-body" style={{ margin: 0 }}>Renseignez votre foyer pour découvrir votre profil et le niveau d'aides auquel vous êtes éligible.</p>
              </div>
            </div>
          )}
          <div className="cc-next"><Icon name="checkCircle" size={15} className="ico" /><span>Vos données sont confidentielles et ne servent qu'au calcul de vos aides.</span></div>
        </div>
      </div>
    </div>
  );
}

// ---------- Mon financement (prêt collectif / individuel / fonds propres) ----------
function MonFinancement({ user, indiv, choice, setChoice, adhered, setAdhered }) {
  const lots = user.lots || [user.lot];
  const [years, setYears] = React.useState(15);
  const [selLots, setSelLots] = React.useState(() => lots.map((_, i) => i));
  const montant = indiv.resteACharge;
  const mensualite = montant / (years * 12);
  const toggleLot = (i) => setSelLots((p) => p.includes(i) ? p.filter((x) => x !== i) : [...p, i]);

  const labelChoix = { collectif: "prêt collectif (éco-PTZ)", individuel: "prêt individuel (éco-PTZ)", fonds: "financement sur fonds propres" };

  if (adhered) {
    return (
      <div className="fade">
        <h1 className="sec-title">Mon financement</h1>
        <div className="card-xl fade" style={{ maxWidth: 660 }}>
          <div className="cx-body" style={{ textAlign: "center", padding: 40 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--color-success-500)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}><Icon name="check" size={32} /></div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, margin: "0 0 8px" }}>Votre choix est transmis</h2>
            <p className="se-body" style={{ maxWidth: 460, margin: "0 auto 20px" }}>
              {choice === "fonds"
                ? <>Vous financez votre reste à charge de <b>{window.fmtEuro(montant)}</b> sur <b>fonds propres</b>. Aucune démarche de prêt n'est nécessaire.</>
                : choice === "individuel"
                ? <>Votre demande de <b>prêt individuel</b> pour {selLots.length > 1 ? "les lots " : "le lot "}{selLots.map((i) => "n°" + lots[i].num).join(", ")} est transmise. <b>Vos documents sont en cours de traitement</b> par votre banque partenaire.</>
                : <>Vous avez choisi le <b>prêt collectif</b> pour <b>{window.fmtEuro(montant)}</b> sur <b>{years} ans</b> ({window.fmtEuro(mensualite)}/mois). Pensez à déposer votre bulletin d'adhésion et votre mandat SEPA dans « Mes documents ».</>}
            </p>
            <button className="se-btn se-btn-secondary" onClick={() => setAdhered(false)}>Modifier mon choix</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade">
      <h1 className="sec-title">Mon financement</h1>
      <p className="sec-sub">Choisissez comment financer votre reste à charge de <b>{window.fmtEuro(montant)}</b> : prêt collectif, prêt individuel ou fonds propres.</p>

      <div className="loan-opts loan-opts-3">
        <div className={"loan-opt" + (choice === "collectif" ? " sel" : "")} onClick={() => setChoice("collectif")}>
          <div className="lo-ico"><Icon name="users" size={22} /></div>
          <h3>Prêt collectif</h3>
          <p>Éco-PTZ souscrit par la copropriété. Vous adhérez pour votre seule quote-part — pas de banque à contacter.</p>
          <div className="loan-terms"><span className="term">Recommandé</span><span className="term">Sans démarche bancaire</span></div>
        </div>
        <div className={"loan-opt" + (choice === "individuel" ? " sel" : "")} onClick={() => setChoice("individuel")}>
          <div className="lo-ico"><Icon name="user" size={22} /></div>
          <h3>Prêt individuel</h3>
          <p>Vous contractez l'éco-PTZ directement auprès de votre banque partenaire, lot par lot.</p>
          <div className="loan-terms"><span className="term">Votre banque</span><span className="term">Lot par lot</span></div>
        </div>
        <div className={"loan-opt" + (choice === "fonds" ? " sel" : "")} onClick={() => setChoice("fonds")}>
          <div className="lo-ico"><Icon name="euro" size={22} /></div>
          <h3>Fonds propres</h3>
          <p>Vous réglez votre reste à charge sans recourir à un prêt, selon l'échéancier d'appels de fonds.</p>
          <div className="loan-terms"><span className="term">Sans crédit</span></div>
        </div>
      </div>

      {choice === "collectif" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card-xl">
              <div className="cx-head"><Icon name="calendar" size={19} /><h2 style={{ fontSize: 18 }}>Durée de remboursement</h2></div>
              <div className="cx-body">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span className="se-small">3 ans</span>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--color-primary-700)" }}>{years} ans</span>
                  <span className="se-small">20 ans</span>
                </div>
                <input className="range" type="range" min="3" max="20" value={years} onChange={(e) => setYears(Number(e.target.value))} />
                <div className="kv" style={{ marginTop: 14 }}><span className="k">Montant financé</span><span className="v">{window.fmtEuro(montant)}</span></div>
                <div className="kv"><span className="k">Taux d'intérêt</span><span className="v">0 % (éco-PTZ)</span></div>
                <div className="casc-reste" style={{ marginTop: 12 }}><span className="l">Mensualité estimée</span><span className="v">{window.fmtEuro(mensualite)}</span></div>
              </div>
            </div>
            <button className="se-btn se-btn-primary" onClick={() => setAdhered(true)}><Icon name="checkCircle" size={18} />Adhérer au prêt collectif</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card-xl">
              <div className="cx-head"><Icon name="download" size={19} style={{ color: "var(--accent)" }} /><h2 style={{ fontSize: 18 }}>Documents à récupérer</h2></div>
              <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {window.PRET_COLLECTIF_DOCS.map((d) => (
                  <div key={d.id} className="dl-doc">
                    <span className="d-ico"><Icon name="fileText" size={18} /></span>
                    <div style={{ minWidth: 0 }}><div className="d-name">{d.name}</div><div className="d-sub">{d.type} · {d.size} · {d.hint}</div></div>
                    <span className="spacer" style={{ flex: 1 }}></span>
                    <button className="se-btn se-btn-secondary btn-sm"><Icon name="download" size={15} />Récupérer</button>
                  </div>
                ))}
                <p className="se-small" style={{ color: "var(--fg-muted)" }}>Ces deux documents sont aussi disponibles dans <b>« Mes documents »</b>. Complétez-les puis redéposez-les signés.</p>
              </div>
            </div>
            <div className="card-xl">
              <div className="cx-head"><Icon name="clipboard" size={19} /><h2 style={{ fontSize: 18 }}>Documents à fournir</h2></div>
              <div className="cx-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
                {window.PRET_COLLECTIF_AFOURNIR.map((l) => (
                  <div key={l} className="afournir-row"><Icon name="check" size={15} style={{ color: "var(--color-primary-700)" }} />{l}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {choice === "individuel" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div className="card-xl">
            <div className="cx-head"><Icon name="building" size={19} style={{ color: "var(--accent)" }} /><h2 style={{ fontSize: 18 }}>Lots à financer</h2></div>
            <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lots.map((l, i) => (
                <label key={l.num} className={"lot-check" + (selLots.includes(i) ? " on" : "")}>
                  <input type="checkbox" checked={selLots.includes(i)} onChange={() => toggleLot(i)} />
                  <span className="lc-main"><b>Lot n°{l.num}</b> · Bât. {l.batiment} · {l.pieces} pièces · {l.surface} m²</span>
                  <span className="lc-tant">{l.tantiemes}/1000</span>
                </label>
              ))}
              <p className="se-small" style={{ color: "var(--fg-muted)" }}>Vous contractez un éco-PTZ par lot auprès de votre banque partenaire.</p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="proc-note">
              <Icon name="alert" size={18} />
              <div><b>Vos documents sont en cours de traitement.</b><span>Votre dossier de prêt individuel est en cours d'instruction par la banque partenaire. Vous serez notifié dès qu'une offre sera disponible.</span></div>
            </div>
            <button className="se-btn se-btn-primary" disabled={selLots.length === 0} style={{ opacity: selLots.length ? 1 : 0.5 }} onClick={() => selLots.length && setAdhered(true)}>
              <Icon name="send" size={17} />Transmettre ma demande
            </button>
          </div>
        </div>
      )}

      {choice === "fonds" && (
        <div className="split" style={{ marginTop: 22 }}>
          <div className="card-xl" style={{ maxWidth: 560 }}>
            <div className="cx-head"><Icon name="euro" size={19} style={{ color: "var(--accent)" }} /><h2 style={{ fontSize: 18 }}>Financement sur fonds propres</h2></div>
            <div className="cx-body">
              <div className="kv"><span className="k">Reste à charge à régler</span><span className="v">{window.fmtEuro(montant)}</span></div>
              <div className="kv"><span className="k">Modalité</span><span className="v">Appels de fonds du syndic</span></div>
              <p className="se-body" style={{ marginTop: 12 }}>Vous réglez votre quote-part de reste à charge selon l'échéancier d'appels de fonds voté en assemblée générale, sans souscrire de prêt.</p>
              <button className="se-btn se-btn-primary" style={{ marginTop: 8 }} onClick={() => setAdhered(true)}><Icon name="checkCircle" size={17} />Confirmer le financement sur fonds propres</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Mes documents ----------
function MesDocuments({ uploaded, toggle }) {
  const req = window.MY_DOCS.filter((d) => d.required);
  const done = req.filter((d) => uploaded[d.id]).length;
  return (
    <div className="fade">
      <h1 className="sec-title">Mes documents</h1>
      <p className="sec-sub">Consultez les documents du projet et téléversez vos pièces justificatives.</p>

      <div className="split">
        <div className="card-xl">
          <div className="cx-head"><Icon name="folder" size={20} style={{ color: "var(--accent)" }} /><h2>Vos pièces à fournir</h2>
            <span style={{ flex: 1 }}></span>
            <Badge kind={done >= req.length ? "success" : "warn"}>{done}/{req.length} obligatoires</Badge>
          </div>
          <div className="cx-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {window.MY_DOCS.map((d) => {
              const filled = !!uploaded[d.id];
              return (
                <div key={d.id} className={"dropzone" + (filled ? " filled" : "")} onClick={() => toggle(d.id)}>
                  <span className="dz-ico"><Icon name={filled ? "check" : "download"} size={18} /></span>
                  <div>
                    <div className="dz-name">{d.name} {d.required && <span style={{ color: "var(--color-error-500)" }}>*</span>}</div>
                    <div className="dz-hint">{filled ? "Pièce téléversée" : d.hint}</div>
                  </div>
                  <span className="spacer"></span>
                  <span className="dz-action">{filled ? "Remplacer" : "Téléverser"}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-xl">
          <div className="cx-head"><Icon name="fileText" size={20} style={{ color: "var(--color-secondary-500)" }} /><h2 style={{ fontSize: 19 }}>Documents du projet</h2></div>
          <div className="cx-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {window.PROJECT_DOCS.map((doc) => (
              <div key={doc.name} className="doc-row">
                <span className="d-ico"><Icon name="fileText" size={18} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="d-name">{doc.name}</div>
                  <div className="d-sub">{doc.type} · {doc.size} · {doc.date}</div>
                </div>
                <span className="spacer"></span>
                <button className="icon-btn" title="Télécharger"><Icon name="download" size={18} /></button>
              </div>
            ))}
            <div className="docs-subhead">Financement — prêt collectif</div>
            {window.PRET_COLLECTIF_DOCS.map((doc) => (
              <div key={doc.id} className="doc-row">
                <span className="d-ico" style={{ background: "var(--accent-soft)", color: "var(--color-primary-700)" }}><Icon name="fileText" size={18} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="d-name">{doc.name}</div>
                  <div className="d-sub">{doc.type} · {doc.size} · {doc.hint}</div>
                </div>
                <span className="spacer"></span>
                <button className="icon-btn" title="Télécharger"><Icon name="download" size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Plan de financement général de la copropriété ----------
function PlanCopro({ copro, plan }) {
  const resteNet = plan.resteCollectif - plan.aidesIndivCumulees;
  return (
    <div className="fade">
      <h1 className="sec-title">Plan de financement de la copropriété</h1>
      <p className="sec-sub">Scénario « {copro.scenario} » · {copro.name} · {copro.lots} lots</p>

      <div className="split">
        <div className="card-xl">
          <div className="cx-head"><Icon name="barChart" size={20} style={{ color: "var(--accent)" }} /><h2>Du coût total au reste à charge</h2>
            <span style={{ flex: 1 }}></span><Badge kind="primary"><Icon name="trendingUp" size={12} />+{plan.gainPct} %</Badge></div>
          <div className="cx-body">
            <Cascade
              total={{ l: "Coût total de l'opération (TTC)", v: plan.totalTTC }}
              rows={[
                ...plan.aides.map((a) => ({ l: a.l, v: a.v, k: a.k })),
              ]}
              reste={{ l: "Reste à charge collectif", v: plan.resteCollectif }}
            />
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 13 }}>
              <div className="casc-row">
                <div className="cr-top">
                  <span className="cr-lbl"><span className="sw" style={{ background: "var(--color-primary-500)" }}></span>− Aides individuelles cumulées (MaPrimeRénov')</span>
                  <span className="cr-val minus">− {window.fmtEuro(plan.aidesIndivCumulees)}</span>
                </div>
                <div className="casc-track"><i style={{ width: (plan.aidesIndivCumulees / plan.totalTTC) * 100 + "%", background: "var(--color-primary-500)" }}></i></div>
              </div>
              <div className="casc-reste">
                <span className="l">Reste à charge net réparti</span>
                <span className="v">{window.fmtEuro(resteNet)}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card-xl">
            <div className="cx-head"><Icon name="euro" size={19} /><h2 style={{ fontSize: 18 }}>Détail du coût</h2></div>
            <div className="cx-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              <div className="kv"><span className="k">Travaux</span><span className="v">{window.fmtEuro(plan.travaux)}</span></div>
              <div className="kv"><span className="k">Honoraires</span><span className="v">{window.fmtEuro(plan.honoraires)}</span></div>
              <div className="kv"><span className="k">Aléas</span><span className="v">{window.fmtEuro(plan.aleas)}</span></div>
              <div className="kv"><span className="k" style={{ fontWeight: 700, color: "var(--fg1)" }}>Total TTC</span><span className="v" style={{ fontFamily: "var(--font-display)" }}>{window.fmtEuroFull(plan.totalTTC)}</span></div>
            </div>
          </div>
          <div className="card-xl">
            <div className="cx-head"><Icon name="leaf" size={19} style={{ color: "var(--accent)" }} /><h2 style={{ fontSize: 18 }}>Aides mobilisées</h2></div>
            <div className="cx-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              {plan.aides.map((a) => (
                <div key={a.l} className="kv"><span className="k" style={{ maxWidth: 200 }}>{a.l}</span><span className="v">{window.fmtEuro(a.v)}</span></div>
              ))}
              <div className="kv"><span className="k" style={{ fontWeight: 700, color: "var(--fg1)" }}>Total déductions</span><span className="v" style={{ color: "var(--color-primary-700)" }}>{window.fmtEuro(plan.deductions)}</span></div>
            </div>
          </div>
          <div className="cc-next"><Icon name="checkCircle" size={15} className="ico" /><span>Gain énergétique supérieur au seuil de 35 % : taux d'aides majorés.</span></div>
        </div>
      </div>
    </div>
  );
}

// ---------- Portail (conteneur) ----------
function CoproPortal({ copros, onLogout, previewCoproId, onExitPreview }) {
  const user = window.COPRO_USER;
  const [coproId, setCoproId] = React.useState(previewCoproId || (user.coproIds.length === 1 ? user.coproIds[0] : null));
  const [section, setSection] = React.useState("accueil");
  const [profil, setProfil] = React.useState(user.profilMPR);
  const [choice, setChoice] = React.useState("collectif");
  const [adhered, setAdhered] = React.useState(false);
  const [uploaded, setUploaded] = React.useState({});

  const copro = copros.find((c) => c.id === coproId);
  const indiv = window.INDIV_PLAN;
  const plan = window.PLANS[coproId] || window.PLANS.renaissance;

  const reqDocs = window.MY_DOCS.filter((d) => d.required);
  const docsDone = reqDocs.filter((d) => uploaded[d.id]).length;
  const flags = { enquete: !profil, pret: !adhered, documents: docsDone < reqDocs.length };

  if (!coproId || !copro) {
    return <CoproSelect copros={copros} user={user} onPick={(id) => { setCoproId(id); setSection("accueil"); }} />;
  }

  const go = (s) => { setSection(s); document.querySelector(".portal-main")?.scrollTo?.(0, 0); };

  return (
    <div className="portal">
      {previewCoproId && (
        <div className="syndic-preview-bar">
          <Icon name="eye" size={15} />Aperçu de l'espace copropriétaire <span style={{ opacity: 0.8 }}>· lecture seule (syndic)</span>
          <span style={{ flex: 1 }}></span>
          <button onClick={onExitPreview}><Icon name="chevronLeft" size={15} />Quitter l'aperçu</button>
        </div>
      )}
      <PortalHeader copro={copro} user={user} onLogout={previewCoproId ? onExitPreview : onLogout}
        onSwitch={previewCoproId ? onExitPreview : (() => { if (user.coproIds.length > 1) setCoproId(null); else onLogout(); })} />
      <PortalNav section={section} setSection={setSection} flags={flags} />
      <main className="portal-main">
        {section === "accueil" && <Accueil copro={copro} user={user} indiv={indiv} profil={profil} docsDone={docsDone} docsReq={reqDocs.length} adhered={adhered} go={go} />}
        {section === "plan-indiv" && <PlanIndividuel user={user} indiv={indiv} profil={profil} go={go} />}
        {section === "enquete" && <EnqueteSociale profil={profil} setProfil={setProfil} />}
        {section === "pret" && <MonFinancement user={user} indiv={indiv} choice={choice} setChoice={setChoice} adhered={adhered} setAdhered={setAdhered} />}
        {section === "documents" && <MesDocuments uploaded={uploaded} toggle={(id) => setUploaded((u) => ({ ...u, [id]: !u[id] }))} />}
        {section === "plan-copro" && <PlanCopro copro={copro} plan={plan} />}
      </main>
    </div>
  );
}

window.CoproPortal = CoproPortal;
window.Cascade = Cascade;
