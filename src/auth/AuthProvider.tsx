import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type Profile = Tables<"profiles">;

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Utilisateur dont le profil est chargé (ou en cours de chargement).
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        userIdRef.current = null;
        setProfile(null);
        setLoading(false);
      } else if (s.user.id !== userIdRef.current) {
        // repasser en « chargement » dans le MÊME rendu que la session :
        // l'effet qui charge le profil arrive un rendu plus tard, et les
        // gardes de route ne doivent jamais voir « session sans profil »
        // entre les deux (ils déconnecteraient une connexion valide)
        setLoading(true);
      }
      // Même utilisateur : simple renouvellement du jeton. Supabase émet un
      // « SIGNED_IN » chaque fois que l'onglet redevient visible ; repasser en
      // chargement démontait toute l'app et effaçait les saisies en cours
      // (bug Théa 30/09/2026 : l'enquête se vidait au retour sur la fenêtre).
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // le profil ne dépend que de l'utilisateur, pas du jeton : un renouvellement
  // de session (nouvel objet, même compte) ne le recharge pas
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    userIdRef.current = userId;
    let cancelled = false;
    // le temps de charger le profil, l'app reste en état « chargement »
    // (sinon les gardes de route voient session sans profil et déconnectent)
    setLoading(true);
    const load = async () => {
      // deux essais : juste après la connexion, une requête peut partir avant
      // que le jeton de session soit attaché - la RLS renvoie alors vide et
      // il ne faut pas conclure trop vite « compte non provisionné »
      for (let essai = 0; essai < 2; essai++) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          setProfile(data);
          setLoading(false);
          return;
        }
        if (error) console.error("Chargement du profil :", error.message);
        if (essai === 0) await new Promise((r) => setTimeout(r, 500));
        if (cancelled) return;
      }
      setProfile(null);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // référence stable : ce callback sert de dépendance d'effet dans les gardes
  // de route (une nouvelle fonction à chaque rendu y relancerait l'effet)
  const signOut = useCallback(async () => {
    // portée locale : on ne révoque que la session de ce navigateur
    // (pas celles des autres appareils / onglets d'un autre navigateur)
    await supabase.auth.signOut({ scope: "local" });
    // copies de secours des enquêtes en cours de saisie (PREFIXE_SECOURS_ENQUETE,
    // Portail/Enquete.tsx) : rien ne reste dans l'onglet après la déconnexion
    try {
      for (const cle of Object.keys(sessionStorage)) {
        if (cle.startsWith("se-enquete:")) sessionStorage.removeItem(cle);
      }
    } catch {
      // stockage indisponible : rien à effacer
    }
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
