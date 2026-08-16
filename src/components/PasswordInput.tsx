// Champ mot de passe avec œil « voir / masquer » (écrans de connexion).
import { useState, type InputHTMLAttributes } from "react";
import { Icon } from "./Icon";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput(props: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex" }}>
      <input
        {...props}
        className="login-input"
        type={visible ? "text" : "password"}
        style={{ width: "100%", paddingRight: 44, ...props.style }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        tabIndex={-1}
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: 6,
          display: "inline-flex",
          alignItems: "center",
          color: "var(--fg-muted)",
        }}
      >
        <Icon name={visible ? "eyeOff" : "eye"} size={18} />
      </button>
    </div>
  );
}
