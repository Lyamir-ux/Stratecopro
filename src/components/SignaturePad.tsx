// Pad de signature — deux modes : tracé (souris / doigt / stylet) ou
// signature simple saisie au clavier (nom-prénom rendu en écriture manuscrite).
// Dans les deux cas, restitue un PNG transparent via onChange.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

const INK = "#1a1a59";

/** Rend un nom-prénom en image de signature (police manuscrite). */
function signatureDepuisNom(nom: string): string | null {
  const texte = nom.trim();
  if (!texte) return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = 'italic 44px "Segoe Script", "Brush Script MT", "Comic Sans MS", cursive';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(texte).width);
  canvas.width = w + 40;
  canvas.height = 90;
  const ctx2 = canvas.getContext("2d")!;
  ctx2.font = font;
  ctx2.fillStyle = INK;
  ctx2.textBaseline = "middle";
  ctx2.fillText(texte, 20, 48);
  return canvas.toDataURL("image/png");
}

export function SignaturePad({
  onChange,
  height = 140,
  defaultName = "",
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
  /** pré-remplit le mode « nom et prénom » (signature électronique de base) */
  defaultName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [mode, setMode] = useState<"dessin" | "nom">("dessin");
  const [nom, setNom] = useState(defaultName);

  useEffect(() => {
    if (mode !== "dessin") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    hasInk.current = false;
    setEmpty(true);
  }, [mode]);

  // mode « nom » : l'image de signature suit la saisie
  useEffect(() => {
    if (mode !== "nom") return;
    onChange(signatureDepuisNom(nom));
    // onChange volontairement hors dépendances (référence instable côté parents)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nom]);

  const basculer = (m: "dessin" | "nom") => {
    if (m === mode) return;
    setMode(m);
    if (m === "dessin") onChange(null);
  };

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // capture indisponible (navigateur ancien / événement synthétique) — le tracé fonctionne sans
    }
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(hasInk.current ? canvas.toDataURL("image/png") : null);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="seg" style={{ display: "inline-flex", marginBottom: 8 }}>
        <button type="button" className={mode === "dessin" ? "on" : ""} onClick={() => basculer("dessin")}>
          <Icon name="edit" size={13} /> Dessiner
        </button>
        <button type="button" className={mode === "nom" ? "on" : ""} onClick={() => basculer("nom")}>
          <Icon name="user" size={13} /> Nom et prénom
        </button>
      </div>

      {mode === "dessin" ? (
        <>
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height,
              border: "1.5px dashed var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg)",
              touchAction: "none",
              cursor: "crosshair",
            }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <span className="se-small" style={{ color: "var(--fg-muted)", flex: 1 }}>
              {empty ? "Signez dans le cadre ci-dessus (souris, doigt ou stylet)." : "Signature enregistrée."}
            </span>
            <button type="button" className="se-btn se-btn-ghost btn-sm" onClick={clear}>
              <Icon name="trash" size={14} />
              Effacer
            </button>
          </div>
        </>
      ) : (
        <>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Votre nom et prénom"
            style={{ width: "100%" }}
          />
          <div
            style={{
              marginTop: 8,
              height: Math.max(90, height - 40),
              border: "1.5px dashed var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg)",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {nom.trim() ? (
              <span
                style={{
                  fontFamily: '"Segoe Script", "Brush Script MT", "Comic Sans MS", cursive',
                  fontStyle: "italic",
                  fontSize: 30,
                  color: INK,
                  padding: "0 16px",
                  whiteSpace: "nowrap",
                }}
              >
                {nom.trim()}
              </span>
            ) : (
              <span className="se-small" style={{ color: "var(--fg-muted)" }}>
                Saisissez votre nom et prénom — il sera apposé comme signature.
              </span>
            )}
          </div>
          <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 8, marginBottom: 0 }}>
            Signature électronique simple : votre nom-prénom, rendu en écriture manuscrite et horodaté.
          </p>
        </>
      )}
    </div>
  );
}
