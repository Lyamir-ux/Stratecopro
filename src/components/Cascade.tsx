// Cascade de financement (coût total → déductions → reste) - portée de copro.jsx.
import { fmtEuro } from "@/lib/format";

interface Row {
  l: string;
  v: number;
  k?: "primary" | "blue" | "dark";
}

const COLOR: Record<string, string> = {
  primary: "var(--color-primary-500)",
  blue: "var(--color-secondary-500)",
  dark: "var(--color-neutral-700)",
};

export function Cascade({ total, rows, reste }: { total: Row; rows: Row[]; reste?: Row }) {
  return (
    <div className="cascade">
      <div className="casc-row casc-total">
        <div className="cr-top">
          <span className="cr-lbl">
            <span className="sw" style={{ background: COLOR.dark }}></span>
            {total.l}
          </span>
          <span className="cr-val">{fmtEuro(total.v)}</span>
        </div>
        <div className="casc-track">
          <i style={{ width: "100%", background: COLOR.dark }}></i>
        </div>
      </div>
      {rows.map((r, i) => (
        <div className="casc-row" key={i}>
          <div className="cr-top">
            <span className="cr-lbl">
              <span className="sw" style={{ background: COLOR[r.k ?? "primary"] }}></span>− {r.l}
            </span>
            <span className="cr-val minus">− {fmtEuro(r.v)}</span>
          </div>
          <div className="casc-track">
            <i
              style={{
                width: (total.v > 0 ? Math.max(3, (r.v / total.v) * 100) : 3) + "%",
                background: COLOR[r.k ?? "primary"],
              }}
            ></i>
          </div>
        </div>
      ))}
      {reste && (
        <div className="casc-reste">
          <span className="l">{reste.l}</span>
          <span className="v">{fmtEuro(reste.v)}</span>
        </div>
      )}
    </div>
  );
}
