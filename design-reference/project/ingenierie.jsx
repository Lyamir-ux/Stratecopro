// ingenierie.jsx — Assistant d'ingénierie financière en 7 étapes (espace AMO)

// ---------- Modèle financier ----------
function makeFinance(copro) {
  let travaux, honoraires, aleas, fonds, cee;
  if (copro.id === "renaissance") {
    travaux = 327944.81; honoraires = 92156.67; aleas = 34000; fonds = 41283; cee = 21366;
  } else {
    const seed = copro.montantTTC || copro.lots * 18000;
    travaux = Math.round(seed * 0.72); honoraires = Math.round(seed * 0.20); aleas = Math.round(seed * 0.08);
    fonds = Math.round(seed * 0.04); cee = Math.round(seed * 0.05);
  }
  const n = copro.coproprietaires;
  const bleu = Math.round(n * 0.34), jaune = Math.round(n * 0.28), violet = Math.round(n * 0.23);
  const rose = Math.max(0, n - bleu - jaune - violet);
  return {
    travaux, honoraires, aleas,
    cle: "tantiemes",
    mprCoproPct: (copro.gainPct || 40) >= 50 ? 45 : 30,
    bonusPassoire: ["F", "G"].includes(copro.energyBefore),
    cee, fonds,
    profils: { Bleu: bleu, Jaune: jaune, Violet: violet, Rose: rose },
    primeIndiv: { Bleu: 3000, Jaune: 2250, Violet: 1500, Rose: 0 },
    ecoPtz: true, ecoPtzDuree: 15, ecoPtzPct: 100,
    avancePct: 70,
    pretComplActif: false, pretComplDuree: 12,
  };
}

function computeFinance(s, copro) {
  const coutTotal = s.travaux + s.honoraires + s.aleas;
  const tauxMpr = (s.mprCoproPct + (s.bonusPassoire ? 10 : 0)) / 100;
  const mprCopro = s.travaux * tauxMpr;
  const aidesColl = mprCopro + s.cee + s.fonds;
  const aidesIndiv = Object.keys(s.profils).reduce((sum, p) => sum + s.profils[p] * s.primeIndiv[p], 0);
  const resteAvantPret = Math.max(0, coutTotal - aidesColl - aidesIndiv);
  const plafondEcoPtz = 50000 * (copro.lotsHab || copro.lots);
  const ecoPtzMontant = s.ecoPtz ? Math.min(resteAvantPret * (s.ecoPtzPct / 100), plafondEcoPtz) : 0;
  const pretsMobilises = ecoPtzMontant;
  const resteACharge = Math.max(0, resteAvantPret - pretsMobilises);
  const parLot = resteAvantPret / copro.lots;
  const mensualiteEcoPtz = ecoPtzMontant / (s.ecoPtzDuree * 12);
  const tauxAides = coutTotal ? (aidesColl + aidesIndiv) / coutTotal : 0;
  return { coutTotal, mprCopro, aidesColl, aidesIndiv, resteAvantPret, ecoPtzMontant, pretsMobilises, resteACharge, parLot, mensualiteEcoPtz, tauxAides };
}

window.makeFinance = makeFinance;
window.computeFinance = computeFinance;

// ---------- Petits champs ----------
function NumField({ label, sub, value, onChange, step, suffix, full }) {
  return (
    <div className={"param" + (full ? " full" : "")}>
      <label>{label} {sub && <span className="sub">· {sub}</span>}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="number" value={value} step={step || 100} onChange={(e) => onChange(Number(e.target.value) || 0)} />
        {suffix && <span style={{ color: "var(--fg-muted)", fontWeight: 600, fontSize: 14 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// ---------- Étapes ----------
function Step1({ s, set, d }) {
  return (
    <div className="fade">
      <h2 className="step-h">Chiffrage des travaux</h2>
      <p className="step-d">Renseignez le coût de l'opération : travaux, honoraires (AMO, MOE, contrôles) et provision pour aléas.</p>
      <div className="param-grid">
        <NumField label="Travaux HT" value={s.travaux} onChange={(v) => set({ travaux: v })} suffix="€" />
        <NumField label="Honoraires" sub="AMO + MOE" value={s.honoraires} onChange={(v) => set({ honoraires: v })} suffix="€" />
        <NumField label="Aléas" sub="provision" value={s.aleas} onChange={(v) => set({ aleas: v })} suffix="€" />
        <div className="param">
          <label>Coût total de l'opération</label>
          <div className="big-num" style={{ color: "var(--color-primary-700)" }}>{window.fmtEuro(d.coutTotal)}</div>
        </div>
      </div>
    </div>
  );
}

function Step2({ s, set, copro }) {
  const cles = [
    { id: "tantiemes", t: "Tantièmes généraux", d: "Répartition au prorata des tantièmes de chaque lot (clé générale MUN)." },
    { id: "batiment", t: "Par bâtiment", d: "Travaux affectés à un bâtiment, répartis entre ses seuls lots." },
    { id: "escalier", t: "Par escalier / cage", d: "Pour les travaux spécifiques à une cage d'escalier (ascenseur, hall)." },
  ];
  return (
    <div className="fade">
      <h2 className="step-h">Clé de répartition</h2>
      <p className="step-d">Choisissez comment répartir le coût entre les copropriétaires. Cette clé sert au calcul des quote-parts individuelles.</p>
      <div className="opt-cards">
        {cles.map((c) => (
          <div key={c.id} className={"opt-card" + (s.cle === c.id ? " sel" : "")} onClick={() => set({ cle: c.id })}>
            <div className="oc-t">{c.t}</div>
            <div className="oc-d">{c.d}</div>
          </div>
        ))}
      </div>
      <div className="cc-next" style={{ marginTop: 22, maxWidth: 680 }}>
        <Icon name="layers" size={15} className="ico" />
        <span>{copro.batiments} bâtiment{copro.batiments > 1 ? "s" : ""} · {copro.lots} lots · clé appliquée : <b>{cles.find((c) => c.id === s.cle).t}</b></span>
      </div>
    </div>
  );
}

function Step3({ s, set, d, copro }) {
  return (
    <div className="fade">
      <h2 className="step-h">Aides collectives</h2>
      <p className="step-d">Subventions mobilisées à l'échelle de la copropriété : MaPrimeRénov' Copropriétés, CEE et fonds disponibles.</p>
      <div className="param-grid">
        <div className="param">
          <label>Taux MaPrimeRénov' Copro <span className="sub">· gain {copro.gainPct || "?"} %</span></label>
          <select value={s.mprCoproPct} onChange={(e) => set({ mprCoproPct: Number(e.target.value) })}>
            <option value={30}>30 % — gain de 35 à 50 %</option>
            <option value={45}>45 % — gain ≥ 50 %</option>
          </select>
        </div>
        <div className="param">
          <label>Bonus sortie de passoire (F/G)</label>
          <select value={s.bonusPassoire ? "1" : "0"} onChange={(e) => set({ bonusPassoire: e.target.value === "1" })}>
            <option value="1">Oui · +10 %</option>
            <option value="0">Non</option>
          </select>
        </div>
        <NumField label="CEE" sub="Certificats d'Économie d'Énergie" value={s.cee} onChange={(v) => set({ cee: v })} suffix="€" />
        <NumField label="Fonds (Alur, provisions)" value={s.fonds} onChange={(v) => set({ fonds: v })} suffix="€" />
        <div className="param full">
          <div className="casc-reste" style={{ background: "var(--accent-soft)" }}>
            <span className="l">Total des aides collectives</span>
            <span className="v">{window.fmtEuro(d.aidesColl)}</span>
          </div>
          <span className="sub" style={{ marginTop: 6 }}>Dont MaPrimeRénov' Copro : {window.fmtEuro(d.mprCopro)} (taux appliqué {s.mprCoproPct + (s.bonusPassoire ? 10 : 0)} %)</span>
        </div>
      </div>
    </div>
  );
}

function Step4({ s, set, d }) {
  const setProf = (p, v) => set({ profils: { ...s.profils, [p]: v } });
  const setPrime = (p, v) => set({ primeIndiv: { ...s.primeIndiv, [p]: v } });
  return (
    <div className="fade">
      <h2 className="step-h">Aides individuelles</h2>
      <p className="step-d">Primes MaPrimeRénov' individuelles selon le profil de revenus des copropriétaires (issu de l'enquête sociale).</p>
      <div style={{ maxWidth: 640 }}>
        <div className="prof-row" style={{ borderBottom: "2px solid var(--border-strong)", fontSize: 12, color: "var(--fg-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <span>Profil</span><span>Prime par logement</span><span style={{ textAlign: "right" }}>Nb. lots</span>
        </div>
        {Object.keys(window.PROFILS_MPR).map((p) => (
          <div className="prof-row" key={p}>
            <span className="prof-name"><span className="sw" style={{ background: window.PROFILS_MPR[p].color }}></span>{p}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" value={s.primeIndiv[p]} step={250} onChange={(e) => setPrime(p, Number(e.target.value) || 0)} />
              <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>€</span>
            </div>
            <input type="number" value={s.profils[p]} onChange={(e) => setProf(p, Number(e.target.value) || 0)} />
          </div>
        ))}
        <div className="casc-reste" style={{ background: "var(--accent-soft)", marginTop: 18 }}>
          <span className="l">Total des aides individuelles</span>
          <span className="v">{window.fmtEuro(d.aidesIndiv)}</span>
        </div>
      </div>
    </div>
  );
}

function Step5({ s, set, d, copro }) {
  return (
    <div className="fade">
      <h2 className="step-h">Configuration des prêts</h2>
      <p className="step-d">Mobilisez l'éco-PTZ collectif pour financer le reste à charge. Plafond 50 000 € / logement, durée jusqu'à 20 ans, taux 0 %.</p>
      <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 22 }}>
        <div className="param">
          <label>Éco-PTZ collectif</label>
          <div className="opt-cards" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 420 }}>
            <div className={"opt-card" + (s.ecoPtz ? " sel" : "")} onClick={() => set({ ecoPtz: true })}><div className="oc-t">Activé</div><div className="oc-d">Souscrit par la copropriété</div></div>
            <div className={"opt-card" + (!s.ecoPtz ? " sel" : "")} onClick={() => set({ ecoPtz: false })}><div className="oc-t">Désactivé</div><div className="oc-d">Sans prêt collectif</div></div>
          </div>
        </div>
        {s.ecoPtz && (
          <>
            <div className="slider-row">
              <div className="sr-top"><label style={{ fontWeight: 600, fontSize: 13.5 }}>Part du reste à charge financée</label><span className="sr-val">{s.ecoPtzPct} %</span></div>
              <input className="range" type="range" min="0" max="100" step="5" value={s.ecoPtzPct} onChange={(e) => set({ ecoPtzPct: Number(e.target.value) })} />
            </div>
            <div className="slider-row">
              <div className="sr-top"><label style={{ fontWeight: 600, fontSize: 13.5 }}>Durée de remboursement</label><span className="sr-val">{s.ecoPtzDuree} ans</span></div>
              <input className="range" type="range" min="3" max="20" value={s.ecoPtzDuree} onChange={(e) => set({ ecoPtzDuree: Number(e.target.value) })} />
            </div>
            <div className="param">
              <label>Avance de subvention <span className="sub">prise en charge de la subvention individuelle</span></label>
              <select value={s.avancePct} onChange={(e) => set({ avancePct: Number(e.target.value) })}>
                <option value={0}>0 %</option><option value={70}>70 %</option><option value={100}>100 %</option>
              </select>
            </div>
            <div className="sy-tiles" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 420 }}>
              <div className="sy-tile"><div className="l">Montant éco-PTZ</div><div className="v">{window.fmtEuro(d.ecoPtzMontant)}</div></div>
              <div className="sy-tile"><div className="l">Mensualité moyenne / lot</div><div className="v accent">{window.fmtEuro(d.mensualiteEcoPtz / copro.lots)}</div></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Step6({ d }) {
  const rows = [
    { l: "Aides collectives (MPR Copro, CEE, Fonds)", v: d.aidesColl, k: "primary" },
    { l: "Aides individuelles (MPR profils)", v: d.aidesIndiv, k: "primary" },
    { l: "Éco-PTZ collectif mobilisé", v: d.ecoPtzMontant, k: "blue" },
  ];
  return (
    <div className="fade">
      <h2 className="step-h">Reste à charge</h2>
      <p className="step-d">Synthèse en cascade : du coût total de l'opération au reste à charge après mobilisation des aides et des prêts.</p>
      <div style={{ maxWidth: 720 }}>
        <Cascade
          total={{ l: "Coût total de l'opération (TTC)", v: d.coutTotal }}
          rows={rows}
          reste={{ l: "Reste à charge final", v: d.resteACharge }}
        />
      </div>
    </div>
  );
}

const SAMPLE_OWNERS = [
  { n: "Copropriétaire 1", lot: "3", tan: 52, prof: "Jaune" },
  { n: "Copropriétaire 2", lot: "7", tan: 38, prof: "Bleu" },
  { n: "Copropriétaire 3", lot: "11", tan: 47, prof: "Violet" },
  { n: "Copropriétaire 4", lot: "14", tan: 61, prof: "Jaune" },
  { n: "Copropriétaire 5", lot: "18", tan: 29, prof: "Bleu" },
  { n: "Copropriétaire 6", lot: "22", tan: 44, prof: "Rose" },
  { n: "Copropriétaire 7", lot: "26", tan: 55, prof: "Violet" },
  { n: "Copropriétaire 8", lot: "31", tan: 33, prof: "Jaune" },
];

function Step7({ s, d, copro, validated, onValidate }) {
  const ceeTotalIndivBase = d.mprCopro + s.fonds; // subvention collective répartie
  const rows = SAMPLE_OWNERS.map((o) => {
    const frac = o.tan / 1000;
    const quotePart = d.coutTotal * frac;
    const mprIndiv = s.primeIndiv[o.prof];
    const cee = s.cee * frac;
    const subvColl = ceeTotalIndivBase * frac;
    const resteAvant = Math.max(0, quotePart - mprIndiv - cee - subvColl);
    const ecoPtz = s.ecoPtz ? resteAvant * (s.ecoPtzPct / 100) : 0;
    const reste = Math.max(0, resteAvant - ecoPtz);
    const mens = ecoPtz / (s.ecoPtzDuree * 12);
    return { ...o, quotePart, mprIndiv, cee, subvColl, ecoPtz, reste, mens };
  });
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return (
    <div className="fade">
      <h2 className="step-h">Validation & plans de financement</h2>
      <p className="step-d">Vérifiez la répartition des quote-parts par copropriétaire. La validation recalcule l'ensemble des plans individuels.</p>

      {validated && (
        <div className="casc-reste" style={{ background: "var(--color-success-50)", border: "1px solid var(--color-success-500)", marginBottom: 20, maxWidth: 720 }}>
          <span className="l" style={{ color: "var(--color-success-700)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="checkCircle" size={18} />Quote-parts recalculées · {copro.coproprietaires} plans générés</span>
          <button className="se-btn se-btn-ghost btn-sm"><Icon name="share" size={15} />Envoyer le recensement</button>
        </div>
      )}

      <div className="plans-wrap" style={{ maxHeight: 420 }}>
        <table className="plans">
          <thead>
            <tr>
              <th>Copropriétaire</th><th>Lot</th><th>Tantièmes</th><th>Quote-part</th>
              <th>MPR indiv.</th><th>CEE</th><th>Subv. coll.</th><th>Éco-PTZ</th><th>Reste à charge</th><th>Mensualité</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lot}>
                <td>{r.n}</td>
                <td className="mono">n°{r.lot}</td>
                <td className="mono">{r.tan}/1000</td>
                <td>{window.fmtEuro(r.quotePart)}</td>
                <td>{window.fmtEuro(r.mprIndiv)}</td>
                <td>{window.fmtEuro(r.cee)}</td>
                <td>{window.fmtEuro(r.subvColl)}</td>
                <td>{window.fmtEuro(r.ecoPtz)}</td>
                <td style={{ fontWeight: 700, color: "var(--color-primary-700)" }}>{window.fmtEuro(r.reste)}</td>
                <td>{window.fmtEuro(r.mens)}</td>
              </tr>
            ))}
            <tr className="tot">
              <td>Échantillon ({rows.length} lots)</td><td></td>
              <td className="mono">{sum("tan")}/1000</td>
              <td>{window.fmtEuro(sum("quotePart"))}</td>
              <td>{window.fmtEuro(sum("mprIndiv"))}</td>
              <td>{window.fmtEuro(sum("cee"))}</td>
              <td>{window.fmtEuro(sum("subvColl"))}</td>
              <td>{window.fmtEuro(sum("ecoPtz"))}</td>
              <td>{window.fmtEuro(sum("reste"))}</td>
              <td>{window.fmtEuro(sum("mens"))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="se-small" style={{ marginTop: 12 }}>Extrait de 8 lots sur {copro.lots} · le tableau complet comporte l'ensemble des dispositifs (≈ 27 colonnes).</p>
    </div>
  );
}

// ---------- Scénarios ----------
function cloneFinance(s) {
  return { ...s, profils: { ...s.profils }, primeIndiv: { ...s.primeIndiv } };
}

function makeScenarios(copro) {
  const base = makeFinance(copro);
  const list = [{
    id: "sc-1",
    name: copro.scenario || "Scénario de base",
    statut: copro.scenario ? "partage" : "brouillon",
    source: "saisie",
    meta: null,
    s: base,
  }];
  const v = cloneFinance(base);
  v.travaux = Math.round(base.travaux * 0.82);
  v.honoraires = Math.round(base.honoraires * 0.9);
  list.push({
    id: "sc-2",
    name: "Variante allégée",
    statut: "brouillon",
    source: "saisie",
    meta: null,
    s: v,
  });
  return list;
}

function StatutPill({ sc }) {
  if (sc.source === "import") return <Badge kind="primary"><Icon name="lock" size={11} />Importé</Badge>;
  if (sc.statut === "partage") return <Badge kind="success" dot>Partagé</Badge>;
  return <Badge kind="neutral">Brouillon</Badge>;
}

function ScenarioMenu({ scenarios, activeId, copro, onSwitch, onAdd, onDuplicate, onImport, onTogglePartage, onClose }) {
  return (
    <>
      <div className="sc-backdrop" onClick={onClose}></div>
      <div className="sc-menu" onClick={(e) => e.stopPropagation()}>
        <div className="sc-menu-head">
          <span>Scénarios de financement</span>
          <span className="sc-count">{scenarios.length}</span>
        </div>
        <div className="sc-menu-list">
          {scenarios.map((sc) => (
            <div key={sc.id} className={"sc-item" + (sc.id === activeId ? " on" : "")}>
              <button className="sc-item-main" onClick={() => onSwitch(sc.id)}>
                <span className="sc-radio">{sc.id === activeId && <Icon name="check" size={13} />}</span>
                <span className="sc-item-txt">
                  <span className="sc-item-name">{sc.name}</span>
                  <span className="sc-item-sub">
                    {sc.source === "import"
                      ? <>Importé · {sc.meta.file}</>
                      : <>{window.fmtEuro(computeFinance(sc.s, copro).coutTotal)} · reste {window.fmtEuro(computeFinance(sc.s, copro).resteACharge)}</>}
                  </span>
                </span>
                <StatutPill sc={sc} />
              </button>
              <div className="sc-item-actions">
                {sc.source !== "import" && (
                  <button title={sc.statut === "partage" ? "Ne plus partager" : "Partager"} onClick={() => onTogglePartage(sc.id)}>
                    <Icon name="share" size={14} />
                  </button>
                )}
                <button title="Dupliquer" onClick={() => onDuplicate(sc)}><Icon name="copy" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="sc-prov">
          <Icon name="alert" size={13} />
          Choix non définitif — l'arbitrage est validé en assemblée générale de travaux.
        </div>
        <div className="sc-menu-foot">
          <button className="se-btn se-btn-secondary btn-sm" onClick={onAdd}><Icon name="plus" size={15} />Nouveau scénario</button>
          <button className="se-btn se-btn-secondary btn-sm" onClick={onImport}><Icon name="upload" size={15} />Importer un fichier Excel</button>
        </div>
      </div>
    </>
  );
}

// ---------- Conteneur ----------
const IEF_STEPS = [
  { id: 0, label: "Chiffrage des travaux", sub: "Coût de l'opération" },
  { id: 1, label: "Clé de répartition", sub: "Tantièmes / bâtiment" },
  { id: 2, label: "Aides collectives", sub: "MPR Copro, CEE, Fonds" },
  { id: 3, label: "Aides individuelles", sub: "Profils MaPrimeRénov'" },
  { id: 4, label: "Configuration des prêts", sub: "Éco-PTZ collectif" },
  { id: 5, label: "Reste à charge", sub: "Cascade de synthèse" },
  { id: 6, label: "Validation", sub: "Plans de financement" },
];

function IngenierieFinanciere({ copro, onBack }) {
  const [scenarios, setScenarios] = React.useState(() => makeScenarios(copro));
  const [activeId, setActiveId] = React.useState("sc-1");
  const [step, setStep] = React.useState(0);
  const [validated, setValidated] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const fileRef = React.useRef(null);
  const seq = React.useRef(0);

  const active = scenarios.find((x) => x.id === activeId) || scenarios[0];
  const s = active.s;
  const locked = active.source === "import";
  const d = computeFinance(s, copro);

  const set = (patch) => {
    if (locked) return;
    setScenarios((prev) => prev.map((x) => (x.id === active.id ? { ...x, s: { ...x.s, ...patch } } : x)));
  };

  const switchTo = (id) => { setActiveId(id); setMenuOpen(false); setValidated(false); };
  const togglePartage = (id) =>
    setScenarios((prev) => prev.map((x) => (x.id === id ? { ...x, statut: x.statut === "partage" ? "brouillon" : "partage" } : x)));

  const addScenario = () => {
    seq.current += 1;
    const id = "sc-new-" + seq.current;
    const blank = cloneFinance(makeFinance(copro));
    setScenarios((prev) => [...prev, { id, name: "Nouveau scénario " + (prev.length + 1), statut: "brouillon", source: "saisie", meta: null, s: blank }]);
    switchTo(id);
  };

  const duplicateScenario = (sc) => {
    seq.current += 1;
    const id = "sc-dup-" + seq.current;
    setScenarios((prev) => [...prev, { id, name: sc.name + " (copie)", statut: "brouillon", source: "saisie", meta: null, s: cloneFinance(sc.s) }]);
    switchTo(id);
  };

  const onImportClick = () => { setMenuOpen(false); if (fileRef.current) fileRef.current.click(); };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const baseName = f.name.replace(/\.(xlsx|xls|csv)$/i, "");
    seq.current += 1;
    const id = "sc-imp-" + seq.current;
    const imp = cloneFinance(s); // chiffres réputés déjà calculés / validés
    setScenarios((prev) => [...prev, {
      id, name: baseName || "Plan importé", statut: "partage", source: "import",
      meta: { file: f.name, date: "14 juin 2026", valideur: "Instances tierces financeurs" }, s: imp,
    }]);
    setActiveId(id); setMenuOpen(false); setValidated(true);
    e.target.value = "";
  };

  const synthRows = [
    { l: "Aides collectives", v: d.aidesColl, k: "primary" },
    { l: "Aides individuelles", v: d.aidesIndiv, k: "primary" },
    { l: "Éco-PTZ mobilisé", v: d.ecoPtzMontant, k: "blue" },
  ];

  return (
    <div className="ief">
      <div className="ief-bar">
        <button className="back" onClick={onBack}><Icon name="chevronLeft" size={16} />Retour au dossier</button>
        <div className="sc-switch">
          <button className={"sc-trigger" + (menuOpen ? " open" : "")} onClick={() => setMenuOpen((o) => !o)}>
            <span className="sc-meta">
              <span className="ttl">Ingénierie financière</span>
              <span className="sub">
                <span className="sc-name">{active.name}</span>
                <StatutPill sc={active} />
              </span>
            </span>
            <Icon name="chevronDown" size={16} className="sc-caret" />
          </button>
          {menuOpen && (
            <ScenarioMenu
              scenarios={scenarios} activeId={activeId} copro={copro}
              onSwitch={switchTo} onAdd={addScenario} onDuplicate={duplicateScenario}
              onImport={onImportClick} onTogglePartage={togglePartage} onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
        <span className="spacer"></span>
        <span className="prov-note"><Icon name="alert" size={13} />Non définitif · avant AG</span>
        <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={onFile} />
        <button className="se-btn se-btn-secondary btn-sm" onClick={onImportClick}><Icon name="upload" size={15} />Importer</button>
        <button className="se-btn se-btn-secondary btn-sm"><Icon name="download" size={15} />Exporter</button>
        <button className="se-btn se-btn-secondary btn-sm">Enregistrer</button>
      </div>

      <div className="ief-body">
        {/* rail des étapes */}
        <div className="ief-rail">
          {IEF_STEPS.map((st, i) => (
            <React.Fragment key={st.id}>
              {i > 0 && <div className={"connector" + (step >= i ? " done" : "")}></div>}
              <button className={"ief-step" + (step === i ? " on" : "") + (step > i ? " done" : "")} onClick={() => setStep(i)}>
                <span className="num">{step > i ? <Icon name="check" size={14} /> : i + 1}</span>
                <span><span className="stp-lbl">{st.label}</span><span className="stp-sub" style={{ display: "block" }}>{st.sub}</span></span>
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* contenu de l'étape */}
        <div className={"ief-main" + (locked ? " locked" : "")}>
          {locked && (
            <div className="import-banner">
              <span className="ib-ico"><Icon name="lock" size={18} /></span>
              <div className="ib-txt">
                <div className="ib-t">Chiffres importés — lecture seule</div>
                <div className="ib-d">Plan validé par les {active.meta.valideur.toLowerCase()} · fichier <b>{active.meta.file}</b> · importé le {active.meta.date}. Dupliquez ce scénario pour ajuster les paramètres.</div>
              </div>
              <span style={{ flex: 1 }}></span>
              <button className="se-btn se-btn-secondary btn-sm" onClick={() => duplicateScenario(active)}><Icon name="copy" size={14} />Dupliquer pour éditer</button>
            </div>
          )}
          <fieldset className="ief-fields" disabled={locked}>
            {step === 0 && <Step1 s={s} set={set} d={d} />}
            {step === 1 && <Step2 s={s} set={set} copro={copro} />}
            {step === 2 && <Step3 s={s} set={set} d={d} copro={copro} />}
            {step === 3 && <Step4 s={s} set={set} d={d} />}
            {step === 4 && <Step5 s={s} set={set} d={d} copro={copro} />}
            {step === 5 && <Step6 d={d} />}
            {step === 6 && <Step7 s={s} d={d} copro={copro} validated={validated} onValidate={() => setValidated(true)} />}
          </fieldset>
        </div>

        {/* synthèse live */}
        <div className="ief-synth">
          <div className="sy-h"><Icon name="barChart" size={17} style={{ color: "var(--accent)" }} />Synthèse</div>
          <Cascade
            total={{ l: "Coût total TTC", v: d.coutTotal }}
            rows={synthRows}
            reste={{ l: "Reste à charge", v: d.resteACharge }}
          />
          <div className="sy-tiles">
            <div className="sy-tile"><div className="l">Taux d'aides</div><div className="v accent">{Math.round(d.tauxAides * 100)} %</div></div>
            <div className="sy-tile"><div className="l">Reste / lot moyen</div><div className="v">{window.fmtEuro(d.parLot)}</div></div>
            <div className="sy-tile"><div className="l">Aides totales</div><div className="v">{window.fmtEuro(d.aidesColl + d.aidesIndiv)}</div></div>
            <div className="sy-tile"><div className="l">Mensualité / lot</div><div className="v">{window.fmtEuro(d.ecoPtz ? d.mensualiteEcoPtz / copro.lots : 0)}</div></div>
          </div>
        </div>
      </div>

      {/* navigation */}
      <div className="ief-foot">
        <button className="se-btn se-btn-secondary btn-sm" disabled={step === 0} style={{ opacity: step === 0 ? 0.4 : 1 }} onClick={() => setStep((v) => Math.max(0, v - 1))}>
          <Icon name="chevronLeft" size={16} />Précédent
        </button>
        <span className="step-count">Étape {step + 1} / {IEF_STEPS.length} · {IEF_STEPS[step].label}</span>
        <span className="spacer"></span>
        {step < 6 ? (
          <button className="se-btn se-btn-primary btn-sm" onClick={() => setStep((v) => Math.min(6, v + 1))}>
            Suivant<Icon name="arrowRight" size={16} />
          </button>
        ) : (
          <button className="se-btn se-btn-primary btn-sm" onClick={() => setValidated(true)} disabled={validated || locked} style={{ opacity: validated || locked ? 0.5 : 1 }}>
            <Icon name="checkCircle" size={16} />{validated ? "Plans validés" : "Valider & recalculer les quote-parts"}
          </button>
        )}
      </div>
    </div>
  );
}

window.IngenierieFinanciere = IngenierieFinanciere;
