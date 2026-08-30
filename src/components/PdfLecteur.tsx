// Lecteur PDF avec suivi du défilement : le bouton de signature ne s'active
// qu'après lecture complète (spec §4.5). Rendu pdfjs page par page dans un
// conteneur défilant - un iframe ne permet pas de détecter la fin de lecture.
import { useEffect, useRef, useState } from "react";

export function PdfLecteur({
  url,
  onLectureComplete,
  hauteur = 460,
}: {
  url: string;
  onLectureComplete: () => void;
  hauteur?: number;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<"chargement" | "pret" | "erreur">("chargement");
  const [luJusquauBout, setLuJusquauBout] = useState(false);
  const signale = useRef(false);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const pdf = await pdfjs.getDocument({ url }).promise;
        if (!vivant || !conteneur.current) return;
        conteneur.current.innerHTML = "";
        const largeur = conteneur.current.clientWidth - 24;
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const base = page.getViewport({ scale: 1 });
          const scale = (largeur / base.width) * (window.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.display = "block";
          canvas.style.marginBottom = "12px";
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,0.18)";
          if (!vivant || !conteneur.current) return;
          conteneur.current.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
        if (vivant) setEtat("pret");
      } catch {
        if (vivant) setEtat("erreur");
      }
    })();
    return () => {
      vivant = false;
    };
  }, [url]);

  // lecture complète = bas du conteneur atteint (marge de 24 px)
  const onScroll = () => {
    const el = conteneur.current;
    if (!el || etat !== "pret" || signale.current) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      signale.current = true;
      setLuJusquauBout(true);
      onLectureComplete();
    }
  };

  // document court sans défilement possible : lu dès le rendu
  useEffect(() => {
    const el = conteneur.current;
    if (etat === "pret" && el && el.scrollHeight <= el.clientHeight + 24 && !signale.current) {
      signale.current = true;
      setLuJusquauBout(true);
      onLectureComplete();
    }
  }, [etat, onLectureComplete]);

  return (
    <div>
      <div
        ref={conteneur}
        onScroll={onScroll}
        style={{
          height: hauteur,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-muted, #f4f4f2)",
          padding: 12,
        }}
      >
        {etat === "chargement" && (
          <p className="se-small" style={{ color: "var(--fg-muted)", padding: 8 }}>Chargement du document…</p>
        )}
        {etat === "erreur" && (
          <p className="se-small" style={{ color: "var(--color-error-700)", padding: 8 }}>
            Le document n'a pas pu être affiché. Rechargez la page ou contactez contact@strateco.fr.
          </p>
        )}
      </div>
      {etat === "pret" && !luJusquauBout && (
        <p className="se-small" style={{ color: "var(--fg-muted)", marginTop: 8 }}>
          Faites défiler le document jusqu'en bas pour activer la signature.
        </p>
      )}
    </div>
  );
}
