import type { ReactNode } from "react";
import { Icon } from "./Icon";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** false : un clic sur l'arrière-plan ne ferme pas (saisie en cours à protéger). */
  closeOnBackdrop?: boolean;
}

export function Modal({ title, onClose, children, width = 560, closeOnBackdrop = true }: ModalProps) {
  return (
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,26,26,0.45)",
        zIndex: 90,
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="se-card"
        style={{ width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto", padding: 26 }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, margin: 0 }}>{title}</h2>
          <span style={{ flex: 1 }}></span>
          <button className="icon-btn" onClick={onClose} title="Fermer">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
