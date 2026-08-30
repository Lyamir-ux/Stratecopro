// Page publique des CGU du service de dépôt de pièces et de signature
// électronique - accessible sans compte (liens depuis les parcours de
// signature et les e-mails).
import { CguTexte, CGU_VERSION } from "@/lib/cguSignature";

export default function CguSignature() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #f6f6f4)" }}>
      <div
        style={{
          background: "linear-gradient(150deg, #213A0E 0%, #355717 70%)",
          padding: "18px 24px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <img src="/logo-strateco-pro-white.png" alt="Strat Eco" style={{ height: 32 }} />
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>
          Conditions Générales d'Utilisation - version {CGU_VERSION}
        </span>
      </div>
      <div
        className="cgu-page"
        style={{
          maxWidth: 860,
          margin: "0 auto",
          padding: "28px 20px 60px",
          fontSize: 14.5,
          lineHeight: 1.6,
        }}
      >
        <style>{`
          .cgu-page h2 { font-size: 22px; margin: 26px 0 10px; }
          .cgu-page h3 { font-size: 17px; margin: 24px 0 8px; color: #213A0E; }
          .cgu-page h4 { font-size: 15px; margin: 18px 0 6px; }
          .cgu-page p { margin: 8px 0; }
          .cgu-page ul, .cgu-page ol { margin: 8px 0 8px 22px; }
          .cgu-page li { margin: 4px 0; }
          .cgu-page blockquote { border-left: 3px solid #355717; margin: 10px 0; padding: 4px 14px; background: #fff; }
          .cgu-page table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13.5px; }
          .cgu-page th, .cgu-page td { border: 1px solid #d5d5d0; padding: 6px 10px; text-align: left; vertical-align: top; }
          .cgu-page th { background: #eef1ea; }
        `}</style>
        <CguTexte />
      </div>
    </div>
  );
}
