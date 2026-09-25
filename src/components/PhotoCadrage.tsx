// Photo de dossier cadrée (bandeau, cartes) et fenêtre « Recadrer la photo »
// (feedback Amir 24/09/2026). La fenêtre s'ouvre à l'import d'une photo - rien
// n'est envoyé avant validation - et depuis le bouton « Recadrer » d'une photo
// déjà en place. On fait glisser l'image dans le cadre du bandeau et on règle
// le zoom ; l'aperçu de la carte du tableau de bord suit. Logique pure et
// tests : src/lib/photoCadrage.ts.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { CADRAGE_DEFAUT, ZOOM_MAX, deplacerCadrage, normaliserCadrage, stylePhoto, type Cadrage } from "@/lib/photoCadrage";

/** Image cadrée qui remplit son parent (le parent doit être positionné). */
export function PhotoCadree({ src, cadrage }: { src: string; cadrage: Cadrage }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <img src={src} alt="" draggable={false} style={stylePhoto(cadrage)} />
    </div>
  );
}

/** Rapport largeur / hauteur du bandeau réellement affiché (repli : 1 100 × 168). */
export function ratioBandeau(): number {
  const el = document.querySelector(".detail-hero .dh-banner") as HTMLElement | null;
  const w = el?.clientWidth ?? 0;
  const h = el?.clientHeight ?? 0;
  return w > 0 && h > 0 ? w / h : 1100 / 168;
}

export function RecadrerPhoto({
  src,
  initial,
  ratio,
  nouvelle,
  enCours,
  erreur,
  onValider,
  onClose,
}: {
  src: string;
  initial?: Cadrage;
  /** Largeur / hauteur du bandeau du dossier. */
  ratio: number;
  /** Photo tout juste choisie (pas encore envoyée). */
  nouvelle?: boolean;
  enCours?: boolean;
  erreur?: string | null;
  onValider: (c: Cadrage) => void;
  onClose: () => void;
}) {
  const [cadrage, setCadrage] = useState<Cadrage>(initial ?? CADRAGE_DEFAUT);
  const [naturel, setNaturel] = useState<{ nw: number; nh: number } | null>(null);
  const cadre = useRef<HTMLDivElement>(null);
  const glisse = useRef<{ x: number; y: number } | null>(null);

  const debut = (e: ReactPointerEvent<HTMLDivElement>) => {
    glisse.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const bouge = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = glisse.current;
    const el = cadre.current;
    if (!g || !el || !naturel) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    glisse.current = { x: e.clientX, y: e.clientY };
    setCadrage((c) => deplacerCadrage(c, dx, dy, { cw: el.clientWidth, ch: el.clientHeight, ...naturel }));
  };
  const fin = () => {
    glisse.current = null;
  };

  return (
    <Modal title={nouvelle ? "Cadrer la nouvelle photo" : "Recadrer la photo"} onClose={onClose} width={760} closeOnBackdrop={false}>
      <p className="se-body" style={{ marginTop: 0 }}>
        Faites glisser la photo pour choisir la partie visible dans le bandeau du dossier, puis ajustez le zoom.
        La photo d'origine est conservée : vous pourrez la recadrer à nouveau à tout moment.
      </p>
      <div className="se-small" style={{ color: "var(--fg-muted)", marginBottom: 6, fontWeight: 600 }}>Bandeau du dossier</div>
      <div
        ref={cadre}
        onPointerDown={debut}
        onPointerMove={bouge}
        onPointerUp={fin}
        onPointerCancel={fin}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: String(ratio),
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-muted)",
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
          overflow: "hidden",
        }}
        title="Faites glisser pour recadrer"
      >
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => setNaturel({ nw: e.currentTarget.naturalWidth, nh: e.currentTarget.naturalHeight })}
            style={{ ...stylePhoto(cadrage), pointerEvents: "none" }}
          />
        </div>
        <span
          style={{
            position: "absolute",
            right: 10,
            bottom: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "#fff",
            background: "rgba(26,26,26,0.55)",
            borderRadius: 6,
            padding: "3px 8px",
            pointerEvents: "none",
          }}
        >
          <Icon name="move" size={12} />
          Glisser pour recadrer
        </span>
      </div>

      <div style={{ display: "flex", gap: 22, alignItems: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <label className="se-small" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--fg2)" }}>
            <Icon name="search" size={14} />
            Zoom
            <input
              type="range"
              min={1}
              max={ZOOM_MAX}
              step={0.05}
              value={cadrage.zoom}
              onChange={(e) => setCadrage((c) => ({ ...c, zoom: Number(e.target.value) }))}
              style={{ flex: 1 }}
              aria-label="Zoom de la photo"
            />
            <span className="mono" style={{ minWidth: 42, textAlign: "right" }}>
              {Math.round(cadrage.zoom * 100)} %
            </span>
          </label>
          <button className="se-btn se-btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setCadrage(CADRAGE_DEFAUT)}>
            <Icon name="refresh" size={13} />
            Recentrer
          </button>
        </div>
        <div>
          <div className="se-small" style={{ color: "var(--fg-muted)", marginBottom: 6, fontWeight: 600 }}>Carte du tableau de bord</div>
          <div style={{ position: "relative", width: 220, aspectRatio: "16 / 9", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", overflow: "hidden", background: "var(--bg-muted)" }}>
            <PhotoCadree src={src} cadrage={cadrage} />
          </div>
        </div>
      </div>

      {erreur && (
        <p style={{ marginTop: 14, marginBottom: 0, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-error-50)", color: "var(--color-error-700)", fontSize: 13.5 }}>
          {erreur}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="se-btn se-btn-primary" disabled={enCours || !naturel} onClick={() => onValider(normaliserCadrage(cadrage))}>
          <Icon name="check" size={16} />
          {enCours ? "Enregistrement…" : nouvelle ? "Enregistrer la photo" : "Enregistrer le cadrage"}
        </button>
        <button className="se-btn se-btn-ghost" disabled={enCours} onClick={onClose}>
          Annuler
        </button>
      </div>
    </Modal>
  );
}
