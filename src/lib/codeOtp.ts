// Code de signature à usage unique (6 chiffres), tapé ou collé depuis l'e-mail.
// Feedback de A CHELGHAM du 09/10/2026 (« signer le mandat : rien ne se passe ») :
// le champ portait maxLength={6}, que le navigateur applique au texte collé AVANT
// que les non-chiffres soient retirés - « 123 456 » ou un espace en tête ne
// laissait que 5 chiffres, et le bouton de signature restait désactivé.

export const LONGUEUR_CODE_OTP = 6;

/** Les 6 chiffres du code dans ce qui a été tapé ou collé : un groupe isolé de 6
 *  chiffres l'emporte (« Votre code : 123456 », même après « 10 minutes »), sinon
 *  les premiers chiffres, séparateurs ignorés (« 123 456 », « 123-456 »). */
export function extraireCodeOtp(saisie: string): string {
  const groupe = /(?:^|\D)(\d{6})(?!\d)/.exec(saisie);
  if (groupe) return groupe[1];
  return saisie.replace(/\D/g, "").slice(0, LONGUEUR_CODE_OTP);
}
