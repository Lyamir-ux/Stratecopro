// app.jsx — Application principale (routing, auth, tweaks)

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dashLayout": "kanban",
  "showProgress": true,
  "accent": "#7AB52C",
  "sidebarTheme": "clair"
}/*EDITMODE-END*/;

const ACCENT_MAP = {
  "#7AB52C": { hover: "#4A7A1F", soft: "#E8F1D7", deep: "#4A7A1F" },
  "#2E6FA8": { hover: "#1E4F7C", soft: "#EAF2FA", deep: "#1E4F7C" },
  "#4A7A1F": { hover: "#355717", soft: "#E8F1D7", deep: "#355717" },
};

const LS_KEY = "se_amo_state_v1";
function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
}
function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const init = loadState();
  const [auth, setAuth] = React.useState(init.auth || null);   // rôle connecté ou null
  const [route, setRoute] = React.useState(init.route || { name: "dashboard" });
  const [collapsed, setCollapsed] = React.useState(!!init.collapsed);
  const [consultations, setConsultations] = React.useState(init.consultations || window.CONSULTATIONS);
  const copros = window.COPROS;

  // persistance légère
  React.useEffect(() => { saveState({ auth, route, collapsed, consultations }); }, [auth, route, collapsed, consultations]);

  // gestion des consultations (marketplace AMO ↔ MOE)
  const publishConsultation = (data) => setConsultations((prev) => [
    { id: "cs-" + Date.now(), statut: "en ligne", publishedAt: "14 juin 2026", candidatures: [], ...data },
    ...prev,
  ]);
  const closeConsultation = (id) => setConsultations((prev) => prev.map((c) => (c.id === id ? { ...c, statut: "clôturée" } : c)));
  const applyConsultation = (id, org) => setConsultations((prev) => prev.map((c) =>
    (c.id === id && !c.candidatures.some((x) => x.org === org))
      ? { ...c, candidatures: [{ org, date: "14 juin 2026", statut: "reçue" }, ...c.candidatures] }
      : c));

  // accent dynamique
  React.useEffect(() => {
    const a = ACCENT_MAP[t.accent] || ACCENT_MAP["#7AB52C"];
    const root = document.documentElement.style;
    root.setProperty("--accent", t.accent);
    root.setProperty("--accent-hover", a.hover);
    root.setProperty("--accent-soft", a.soft);
    root.setProperty("--color-primary-500", t.accent);
    root.setProperty("--color-primary-700", a.deep);
    root.setProperty("--color-primary-100", a.soft);
  }, [t.accent]);

  const goDash = () => setRoute({ name: "dashboard" });
  const openCopro = (id) => setRoute({ name: "detail", coproId: id });
  const openIngenierie = (id) => setRoute({ name: "ingenierie", coproId: id });
  const nav = (name) => setRoute({ name });

  // ---- non authentifié : login ----
  if (!auth) {
    return <Login onLogin={(role) => { setAuth(role); setRoute({ name: "dashboard" }); }} />;
  }

  // ---- espace copropriétaire : portail dédié ----
  if (auth === "copro") {
    return <CoproPortal copros={copros} onLogout={() => setAuth(null)} />;
  }

  // ---- syndic : aperçu de l'espace copropriétaire (plein écran) ----
  if (auth === "syndic" && route.name === "coproview") {
    return <CoproPortal copros={copros} previewCoproId={route.coproId} onExitPreview={() => setRoute({ name: "detail", coproId: route.coproId })} />;
  }

  const recents = copros.slice(0, 4);
  const cur = (route.name === "detail" || route.name === "ingenierie") ? copros.find((c) => c.id === route.coproId) : null;
  const isMoe = auth === "moe";
  const isSyndic = auth === "syndic";

  // fil d'ariane
  const dashLabel = isMoe ? "Vos opérations" : isSyndic ? "Portefeuille du cabinet" : "Vos copropriétés";
  let crumbs = [{ label: dashLabel, onClick: route.name !== "dashboard" ? goDash : null }];
  if (route.name === "detail" && cur) crumbs = [{ label: dashLabel, onClick: goDash }, { label: cur.name }];
  else if (route.name === "ingenierie" && cur) crumbs = [{ label: "Vos copropriétés", onClick: goDash }, { label: cur.name, onClick: () => openCopro(cur.id) }, { label: "Ingénierie financière" }];
  else if (route.name === "coproview") crumbs = [{ label: dashLabel, onClick: goDash }, { label: "Vue copropriétaire" }];
  else if (route.name === "taches") crumbs = [{ label: isMoe ? "Vos missions" : "Vos tâches" }];
  else if (route.name === "consultations") crumbs = [{ label: isMoe ? "Consultations en cours" : "Consulter un intervenant" }];
  else if (route.name === "collaborateurs") crumbs = [{ label: "Collaborateurs" }];
  else if (route.name === "parametres") crumbs = [{ label: "Paramètres" }];

  // contenu principal
  let content;
  if (isMoe) {
    if (route.name === "detail" && cur) content = <MoeDetail c={cur} onBack={goDash} />;
    else if (route.name === "taches") content = <MoeMissions copros={copros} onOpen={openCopro} />;
    else if (route.name === "consultations") content = <ConsultationsMOE consultations={consultations} copros={copros} onApply={applyConsultation} />;
    else if (route.name === "collaborateurs" || route.name === "parametres") {
      content = (
        <div className="placeholder-screen">
          <div className="ps-ico"><Icon name={route.name === "collaborateurs" ? "users" : "settings"} size={30} /></div>
          <h2>{route.name === "collaborateurs" ? "Collaborateurs" : "Paramètres"}</h2>
          <p>Module à construire dans une prochaine itération, sur le même socle visuel.</p>
          <button className="se-btn se-btn-primary" style={{ marginTop: 22 }} onClick={goDash}><Icon name="gauge" size={17} />Vos opérations</button>
        </div>
      );
    } else content = <MoeDashboard copros={copros} onOpen={openCopro} />;
  } else if (isSyndic) {
    if (route.name === "detail" && cur) content = <SyndicDetail c={cur} onBack={goDash} onCoproView={() => setRoute({ name: "coproview", coproId: cur.id })} />;
    else if (route.name === "taches") content = <SyndicMissions copros={copros} onOpen={openCopro} />;
    else if (route.name === "collaborateurs" || route.name === "parametres") {
      content = (
        <div className="placeholder-screen">
          <div className="ps-ico"><Icon name={route.name === "collaborateurs" ? "users" : "settings"} size={30} /></div>
          <h2>{route.name === "collaborateurs" ? "Collaborateurs" : "Paramètres"}</h2>
          <p>Module à construire dans une prochaine itération, sur le même socle visuel.</p>
          <button className="se-btn se-btn-primary" style={{ marginTop: 22 }} onClick={goDash}><Icon name="gauge" size={17} />Portefeuille</button>
        </div>
      );
    } else content = <SyndicDashboard onOpen={openCopro} />;
  } else if (auth !== "amo") {
    content = <RolePlaceholder role={auth} onSwitch={() => { setAuth("amo"); goDash(); }} />;
  } else if (route.name === "detail" && cur) {
    content = <CoproDetail c={cur} onBack={goDash} onIngenierie={() => openIngenierie(cur.id)} />;
  } else if (route.name === "ingenierie" && cur) {
    content = <IngenierieFinanciere copro={cur} onBack={() => openCopro(cur.id)} />;
  } else if (route.name === "taches") {
    content = <MyTasks copros={copros} onOpen={openCopro} />;
  } else if (route.name === "consultations") {
    content = <ConsultationsAMO consultations={consultations} copros={copros} onPublish={publishConsultation} onClose={closeConsultation} />;
  } else if (route.name === "collaborateurs" || route.name === "parametres") {
    content = <RolePlaceholder role={route.name === "collaborateurs" ? "amo" : "amo"} onSwitch={goDash} />;
  } else {
    content = <Dashboard copros={copros} t={t} setTweak={setTweak} onOpen={openCopro} />;
  }
  // remplace le placeholder générique pour collaborateurs/paramètres
  if (auth === "amo" && (route.name === "collaborateurs" || route.name === "parametres")) {
    content = (
      <div className="placeholder-screen">
        <div className="ps-ico"><Icon name={route.name === "collaborateurs" ? "users" : "settings"} size={30} /></div>
        <h2>{route.name === "collaborateurs" ? "Collaborateurs" : "Paramètres"}</h2>
        <p>Module à construire dans une prochaine itération, sur le même socle visuel.</p>
        <button className="se-btn se-btn-primary" style={{ marginTop: 22 }} onClick={goDash}><Icon name="gauge" size={17} />Tableau de bord</button>
      </div>
    );
  }

  const dark = t.sidebarTheme === "sombre";

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <Sidebar
        route={route} onNav={nav} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)}
        recents={recents} onOpen={openCopro} onLogout={() => setAuth(null)} dark={dark} role={auth}
      />
      <div className="main">
        <Topbar crumbs={crumbs} role={auth} onRoleClick={() => setAuth(null)} />
        <div className="content">{content}</div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Tableau de bord" />
        <TweakRadio label="Direction" value={t.dashLayout}
          options={[{ value: "kanban", label: "Kanban" }, { value: "galerie", label: "Galerie" }, { value: "tableau", label: "Tableau" }]}
          onChange={(v) => setTweak("dashLayout", v)} />
        <TweakToggle label="Barre d'avancement" value={t.showProgress} onChange={(v) => setTweak("showProgress", v)} />
        <TweakSection label="Apparence" />
        <TweakColor label="Couleur d'accent" value={t.accent}
          options={["#7AB52C", "#2E6FA8", "#4A7A1F"]} onChange={(v) => setTweak("accent", v)} />
        <TweakRadio label="Menu latéral" value={t.sidebarTheme}
          options={[{ value: "clair", label: "Clair" }, { value: "sombre", label: "Sombre" }]}
          onChange={(v) => setTweak("sidebarTheme", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
