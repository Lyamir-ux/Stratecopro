import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

interface Props {
  icon: IconName;
  title: string;
  text?: string;
}

export function PlaceholderScreen({ icon, title, text }: Props) {
  const navigate = useNavigate();
  return (
    <div className="placeholder-screen">
      <div className="ps-ico">
        <Icon name={icon} size={30} />
      </div>
      <h2>{title}</h2>
      <p>{text || "Module en cours de construction — prochaine étape du chantier."}</p>
      <button className="se-btn se-btn-primary" style={{ marginTop: 22 }} onClick={() => navigate("/")}>
        <Icon name="gauge" size={17} />
        Tableau de bord
      </button>
    </div>
  );
}
