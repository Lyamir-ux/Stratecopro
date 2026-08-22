export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      adhesions_pret: {
        Row: {
          bic: string | null
          bulletins: Json
          copro_id: string
          coproprietaire_id: string
          created_at: string
          form: Json
          iban: string | null
          id: string
          lieu_signature: string | null
          rib_concordance: string | null
          scenario_id: string | null
          sepa_path: string | null
          signed_at: string | null
          statut: string
          updated_at: string
        }
        Insert: {
          bic?: string | null
          bulletins?: Json
          copro_id: string
          coproprietaire_id: string
          created_at?: string
          form?: Json
          iban?: string | null
          id?: string
          lieu_signature?: string | null
          rib_concordance?: string | null
          scenario_id?: string | null
          sepa_path?: string | null
          signed_at?: string | null
          statut?: string
          updated_at?: string
        }
        Update: {
          bic?: string | null
          bulletins?: Json
          copro_id?: string
          coproprietaire_id?: string
          created_at?: string
          form?: Json
          iban?: string | null
          id?: string
          lieu_signature?: string | null
          rib_concordance?: string | null
          scenario_id?: string | null
          sepa_path?: string | null
          signed_at?: string | null
          statut?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adhesions_pret_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adhesions_pret_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adhesions_pret_coproprietaire_id_fkey"
            columns: ["coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adhesions_pret_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios_financiers"
            referencedColumns: ["id"]
          },
        ]
      }
      baremes: {
        Row: {
          actif: boolean
          created_at: string
          id: string
          millesime: number
          params: Json
          zone: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          id?: string
          millesime: number
          params: Json
          zone: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          id?: string
          millesime?: number
          params?: Json
          zone?: string
        }
        Relationships: []
      }
      batiments: {
        Row: {
          adresse: string | null
          code: string
          copro_id: string
          declare_creation: boolean
          id: string
          label: string | null
          position: number
        }
        Insert: {
          adresse?: string | null
          code: string
          copro_id: string
          declare_creation?: boolean
          id?: string
          label?: string | null
          position?: number
        }
        Update: {
          adresse?: string | null
          code?: string
          copro_id?: string
          declare_creation?: boolean
          id?: string
          label?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "batiments_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batiments_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      candidatures: {
        Row: {
          consultation_id: string
          decision_at: string | null
          decision_email_statut: string | null
          decision_vue_at: string | null
          engagement_at: string | null
          fichier_name: string | null
          fichier_path: string | null
          id: string
          message: string | null
          montant: number | null
          org_name: string
          prestataire_id: string | null
          received_at: string
          retrait_at: string | null
          retrait_motif: string | null
          statut: Database["public"]["Enums"]["statut_candidature"]
          tarif_chantier: number | null
          tarif_chantier_mode: string
          tarif_conception: number | null
          tarif_diag_avp: number | null
          tarif_etancheite_apres: number | null
          tarif_etancheite_avant: number | null
          tarif_options: Json | null
          tarif_pro_dce: number | null
          tarif_pro_dce_mode: string
          tarif_realisation: number | null
        }
        Insert: {
          consultation_id: string
          decision_at?: string | null
          decision_email_statut?: string | null
          decision_vue_at?: string | null
          engagement_at?: string | null
          fichier_name?: string | null
          fichier_path?: string | null
          id?: string
          message?: string | null
          montant?: number | null
          org_name: string
          prestataire_id?: string | null
          received_at?: string
          retrait_at?: string | null
          retrait_motif?: string | null
          statut?: Database["public"]["Enums"]["statut_candidature"]
          tarif_chantier?: number | null
          tarif_chantier_mode?: string
          tarif_conception?: number | null
          tarif_diag_avp?: number | null
          tarif_etancheite_apres?: number | null
          tarif_etancheite_avant?: number | null
          tarif_options?: Json | null
          tarif_pro_dce?: number | null
          tarif_pro_dce_mode?: string
          tarif_realisation?: number | null
        }
        Update: {
          consultation_id?: string
          decision_at?: string | null
          decision_email_statut?: string | null
          decision_vue_at?: string | null
          engagement_at?: string | null
          fichier_name?: string | null
          fichier_path?: string | null
          id?: string
          message?: string | null
          montant?: number | null
          org_name?: string
          prestataire_id?: string | null
          received_at?: string
          retrait_at?: string | null
          retrait_motif?: string | null
          statut?: Database["public"]["Enums"]["statut_candidature"]
          tarif_chantier?: number | null
          tarif_chantier_mode?: string
          tarif_conception?: number | null
          tarif_diag_avp?: number | null
          tarif_etancheite_apres?: number | null
          tarif_etancheite_avant?: number | null
          tarif_options?: Json | null
          tarif_pro_dce?: number | null
          tarif_pro_dce_mode?: string
          tarif_realisation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidatures_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidatures_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          checklist_id: string
          done: boolean
          fichier_id: string | null
          id: string
          label: string
          position: number
        }
        Insert: {
          checklist_id: string
          done?: boolean
          fichier_id?: string | null
          id?: string
          label: string
          position?: number
        }
        Update: {
          checklist_id?: string
          done?: boolean
          fichier_id?: string | null
          id?: string
          label?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_fichier_id_fkey"
            columns: ["fichier_id"]
            isOneToOne: false
            referencedRelation: "fichiers"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          copro_id: string
          dispositif: string
          id: string
          label: string
        }
        Insert: {
          copro_id: string
          dispositif: string
          id?: string
          label: string
        }
        Update: {
          copro_id?: string
          dispositif?: string
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      choix_financement: {
        Row: {
          coproprietaire_id: string
          duree_annees: number | null
          id: string
          lot_ids: string[]
          scenario_id: string
          transmitted_at: string
          type: Database["public"]["Enums"]["type_financement"]
          updated_at: string
        }
        Insert: {
          coproprietaire_id: string
          duree_annees?: number | null
          id?: string
          lot_ids?: string[]
          scenario_id: string
          transmitted_at?: string
          type: Database["public"]["Enums"]["type_financement"]
          updated_at?: string
        }
        Update: {
          coproprietaire_id?: string
          duree_annees?: number | null
          id?: string
          lot_ids?: string[]
          scenario_id?: string
          transmitted_at?: string
          type?: Database["public"]["Enums"]["type_financement"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "choix_financement_coproprietaire_id_fkey"
            columns: ["coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "choix_financement_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios_financiers"
            referencedColumns: ["id"]
          },
        ]
      }
      cles_repartition: {
        Row: {
          code: string
          copro_id: string
          id: string
          is_default: boolean
          label: string | null
        }
        Insert: {
          code: string
          copro_id: string
          id?: string
          is_default?: boolean
          label?: string | null
        }
        Update: {
          code?: string
          copro_id?: string
          id?: string
          is_default?: boolean
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cles_repartition_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cles_repartition_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_acces: {
        Row: {
          consultation_id: string
          first_at: string
          id: string
          last_at: string
          prestataire_id: string
        }
        Insert: {
          consultation_id: string
          first_at?: string
          id?: string
          last_at?: string
          prestataire_id: string
        }
        Update: {
          consultation_id?: string
          first_at?: string
          id?: string
          last_at?: string
          prestataire_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_acces_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_acces_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_docs: {
        Row: {
          consultation_id: string
          id: string
          name: string
          path: string
          size: number | null
          uploaded_at: string
        }
        Insert: {
          consultation_id: string
          id?: string
          name: string
          path: string
          size?: number | null
          uploaded_at?: string
        }
        Update: {
          consultation_id?: string
          id?: string
          name?: string
          path?: string
          size?: number | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_docs_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_notifications: {
        Row: {
          consultation_id: string
          email: string
          erreur: string | null
          id: string
          prestataire_id: string
          sent_at: string
          statut: Database["public"]["Enums"]["statut_notification"]
        }
        Insert: {
          consultation_id: string
          email: string
          erreur?: string | null
          id?: string
          prestataire_id: string
          sent_at?: string
          statut?: Database["public"]["Enums"]["statut_notification"]
        }
        Update: {
          consultation_id?: string
          email?: string
          erreur?: string | null
          id?: string
          prestataire_id?: string
          sent_at?: string
          statut?: Database["public"]["Enums"]["statut_notification"]
        }
        Relationships: [
          {
            foreignKeyName: "consultation_notifications_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_notifications_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_questions: {
        Row: {
          answered_at: string | null
          asked_at: string
          consultation_id: string
          id: string
          prestataire_id: string
          question: string
          reponse: string | null
        }
        Insert: {
          answered_at?: string | null
          asked_at?: string
          consultation_id: string
          id?: string
          prestataire_id: string
          question: string
          reponse?: string | null
        }
        Update: {
          answered_at?: string | null
          asked_at?: string
          consultation_id?: string
          id?: string
          prestataire_id?: string
          question?: string
          reponse?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultation_questions_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_questions_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          budget: number | null
          copro_externe_adresse: string | null
          copro_externe_lots: number | null
          copro_externe_nom: string | null
          copro_externe_ville: string | null
          copro_id: string | null
          date_limite: string | null
          id: string
          mission: string
          nb_batiments: number | null
          nb_logements: number | null
          options: string[]
          published_at: string
          sous_type: string | null
          statut: Database["public"]["Enums"]["statut_consultation"]
          type: Database["public"]["Enums"]["type_consultation"]
        }
        Insert: {
          budget?: number | null
          copro_externe_adresse?: string | null
          copro_externe_lots?: number | null
          copro_externe_nom?: string | null
          copro_externe_ville?: string | null
          copro_id?: string | null
          date_limite?: string | null
          id?: string
          mission: string
          nb_batiments?: number | null
          nb_logements?: number | null
          options?: string[]
          published_at?: string
          sous_type?: string | null
          statut?: Database["public"]["Enums"]["statut_consultation"]
          type: Database["public"]["Enums"]["type_consultation"]
        }
        Update: {
          budget?: number | null
          copro_externe_adresse?: string | null
          copro_externe_lots?: number | null
          copro_externe_nom?: string | null
          copro_externe_ville?: string | null
          copro_id?: string | null
          date_limite?: string | null
          id?: string
          mission?: string
          nb_batiments?: number | null
          nb_logements?: number | null
          options?: string[]
          published_at?: string
          sous_type?: string | null
          statut?: Database["public"]["Enums"]["statut_consultation"]
          type?: Database["public"]["Enums"]["type_consultation"]
        }
        Relationships: [
          {
            foreignKeyName: "consultations_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      copro_financement_config: {
        Row: {
          adhesion_ouverte: boolean
          banque: string
          copro_id: string
          duree_annees: number
          updated_at: string
        }
        Insert: {
          adhesion_ouverte?: boolean
          banque?: string
          copro_id: string
          duree_annees?: number
          updated_at?: string
        }
        Update: {
          adhesion_ouverte?: boolean
          banque?: string
          copro_id?: string
          duree_annees?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copro_financement_config_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: true
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copro_financement_config_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: true
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      copro_members: {
        Row: {
          copro_id: string
          member_role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          copro_id: string
          member_role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          copro_id?: string
          member_role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copro_members_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copro_members_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copro_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      coproprietaires: {
        Row: {
          adresse: string | null
          copro_id: string
          created_at: string
          email: string | null
          id: string
          nom: string
          telephone: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          adresse?: string | null
          copro_id: string
          created_at?: string
          email?: string | null
          id?: string
          nom: string
          telephone?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          adresse?: string | null
          copro_id?: string
          created_at?: string
          email?: string | null
          id?: string
          nom?: string
          telephone?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coproprietaires_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coproprietaires_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coproprietaires_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      coproprietes: {
        Row: {
          adresse: string | null
          chef_projet: string | null
          city: string | null
          code_postal: string | null
          created_at: string
          deleted_at: string | null
          denomination_batiments: string
          energy_after: string | null
          energy_before: string | null
          fragile: boolean
          gain_pct: number | null
          gestionnaire_email: string | null
          gestionnaire_nom: string | null
          id: string
          name: string
          nb_logements: number | null
          organisation_id: string | null
          phase: Database["public"]["Enums"]["phase_copro"]
          photo_path: string | null
          progress: number
          slug: string | null
          syndic_name: string | null
          tag: string | null
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          chef_projet?: string | null
          city?: string | null
          code_postal?: string | null
          created_at?: string
          deleted_at?: string | null
          denomination_batiments?: string
          energy_after?: string | null
          energy_before?: string | null
          fragile?: boolean
          gain_pct?: number | null
          gestionnaire_email?: string | null
          gestionnaire_nom?: string | null
          id?: string
          name: string
          nb_logements?: number | null
          organisation_id?: string | null
          phase?: Database["public"]["Enums"]["phase_copro"]
          photo_path?: string | null
          progress?: number
          slug?: string | null
          syndic_name?: string | null
          tag?: string | null
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          chef_projet?: string | null
          city?: string | null
          code_postal?: string | null
          created_at?: string
          deleted_at?: string | null
          denomination_batiments?: string
          energy_after?: string | null
          energy_before?: string | null
          fragile?: boolean
          gain_pct?: number | null
          gestionnaire_email?: string | null
          gestionnaire_nom?: string | null
          id?: string
          name?: string
          nb_logements?: number | null
          organisation_id?: string | null
          phase?: Database["public"]["Enums"]["phase_copro"]
          photo_path?: string | null
          progress?: number
          slug?: string | null
          syndic_name?: string | null
          tag?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coproprietes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      enquete_reponses: {
        Row: {
          coproprietaire_id: string
          enquete_id: string
          id: string
          nb_personnes: number | null
          profil_mpr: string | null
          reponses: Json | null
          rfr: number | null
          statut_occupation: string | null
          updated_at: string
        }
        Insert: {
          coproprietaire_id: string
          enquete_id: string
          id?: string
          nb_personnes?: number | null
          profil_mpr?: string | null
          reponses?: Json | null
          rfr?: number | null
          statut_occupation?: string | null
          updated_at?: string
        }
        Update: {
          coproprietaire_id?: string
          enquete_id?: string
          id?: string
          nb_personnes?: number | null
          profil_mpr?: string | null
          reponses?: Json | null
          rfr?: number | null
          statut_occupation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquete_reponses_coproprietaire_id_fkey"
            columns: ["coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquete_reponses_enquete_id_fkey"
            columns: ["enquete_id"]
            isOneToOne: false
            referencedRelation: "enquetes"
            referencedColumns: ["id"]
          },
        ]
      }
      enquetes: {
        Row: {
          copro_id: string
          created_at: string
          id: string
          questions: Json
          sent_at: string | null
          statut: Database["public"]["Enums"]["statut_enquete"]
        }
        Insert: {
          copro_id: string
          created_at?: string
          id?: string
          questions?: Json
          sent_at?: string | null
          statut?: Database["public"]["Enums"]["statut_enquete"]
        }
        Update: {
          copro_id?: string
          created_at?: string
          id?: string
          questions?: Json
          sent_at?: string | null
          statut?: Database["public"]["Enums"]["statut_enquete"]
        }
        Relationships: [
          {
            foreignKeyName: "enquetes_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquetes_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks: {
        Row: {
          auteur_nom: string
          auteur_role: string
          created_at: string
          id: string
          message: string
          navigateur: string | null
          page: string
          statut: string
          traite_email_le: string | null
          traite_email_statut: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          auteur_nom?: string
          auteur_role?: string
          created_at?: string
          id?: string
          message: string
          navigateur?: string | null
          page?: string
          statut?: string
          traite_email_le?: string | null
          traite_email_statut?: string | null
          type?: string
          user_id?: string | null
        }
        Update: {
          auteur_nom?: string
          auteur_role?: string
          created_at?: string
          id?: string
          message?: string
          navigateur?: string | null
          page?: string
          statut?: string
          traite_email_le?: string | null
          traite_email_statut?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fichiers: {
        Row: {
          copro_id: string
          created_at: string
          dossier: string
          id: string
          mime: string | null
          name: string
          name_original: string | null
          partage_copro: boolean
          size: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          copro_id: string
          created_at?: string
          dossier?: string
          id?: string
          mime?: string | null
          name: string
          name_original?: string | null
          partage_copro?: boolean
          size?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          copro_id?: string
          created_at?: string
          dossier?: string
          id?: string
          mime?: string | null
          name?: string
          name_original?: string | null
          partage_copro?: boolean
          size?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichiers_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichiers_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichiers_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lot_tantiemes: {
        Row: {
          cle_id: string
          lot_id: string
          tantiemes: number
        }
        Insert: {
          cle_id: string
          lot_id: string
          tantiemes: number
        }
        Update: {
          cle_id?: string
          lot_id?: string
          tantiemes?: number
        }
        Relationships: [
          {
            foreignKeyName: "lot_tantiemes_cle_id_fkey"
            columns: ["cle_id"]
            isOneToOne: false
            referencedRelation: "cles_repartition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_tantiemes_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          batiment_id: string | null
          copro_id: string
          coproprietaire_id: string | null
          created_at: string
          id: string
          num: string
          rattache_a: string | null
          usage: Database["public"]["Enums"]["usage_lot"]
        }
        Insert: {
          batiment_id?: string | null
          copro_id: string
          coproprietaire_id?: string | null
          created_at?: string
          id?: string
          num: string
          rattache_a?: string | null
          usage?: Database["public"]["Enums"]["usage_lot"]
        }
        Update: {
          batiment_id?: string | null
          copro_id?: string
          coproprietaire_id?: string | null
          created_at?: string
          id?: string
          num?: string
          rattache_a?: string | null
          usage?: Database["public"]["Enums"]["usage_lot"]
        }
        Relationships: [
          {
            foreignKeyName: "lots_batiment_id_fkey"
            columns: ["batiment_id"]
            isOneToOne: false
            referencedRelation: "batiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_coproprietaire_id_fkey"
            columns: ["coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_rattache_a_fkey"
            columns: ["rattache_a"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      message_lectures: {
        Row: {
          copro_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          copro_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          copro_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_lectures_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_lectures_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      messages_projet: {
        Row: {
          auteur_nom: string
          auteur_role: string
          body: string
          canal: Database["public"]["Enums"]["canal_message"]
          copro_id: string
          created_at: string
          id: string
          prestataire_id: string | null
          user_id: string | null
        }
        Insert: {
          auteur_nom?: string
          auteur_role?: string
          body: string
          canal: Database["public"]["Enums"]["canal_message"]
          copro_id: string
          created_at?: string
          id?: string
          prestataire_id?: string | null
          user_id?: string | null
        }
        Update: {
          auteur_nom?: string
          auteur_role?: string
          body?: string
          canal?: Database["public"]["Enums"]["canal_message"]
          copro_id?: string
          created_at?: string
          id?: string
          prestataire_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_projet_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_projet_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_projet_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
        ]
      }
      montage_docs: {
        Row: {
          commentaire: string | null
          copro_id: string
          created_at: string
          doc_key: string
          files: Json
          id: string
          montage: string
          statut: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commentaire?: string | null
          copro_id: string
          created_at?: string
          doc_key: string
          files?: Json
          id?: string
          montage?: string
          statut?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commentaire?: string | null
          copro_id?: string
          created_at?: string
          doc_key?: string
          files?: Json
          id?: string
          montage?: string
          statut?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "montage_docs_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "montage_docs_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      montage_formulaires: {
        Row: {
          copro_id: string
          created_at: string
          data: Json
          statut: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          copro_id: string
          created_at?: string
          data?: Json
          statut?: string
          type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          copro_id?: string
          created_at?: string
          data?: Json
          statut?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "montage_formulaires_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "montage_formulaires_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      notes_projet: {
        Row: {
          author_user_id: string | null
          body: string
          copro_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          copro_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          copro_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_projet_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notes_projet_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_projet_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_membres: {
        Row: {
          org_role: Database["public"]["Enums"]["org_role"]
          organisation_id: string
          user_id: string
        }
        Insert: {
          org_role?: Database["public"]["Enums"]["org_role"]
          organisation_id: string
          user_id: string
        }
        Update: {
          org_role?: Database["public"]["Enums"]["org_role"]
          organisation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_membres_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_membres_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          id: string
          nom: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          nom: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          nom?: string
          slug?: string
        }
        Relationships: []
      }
      phase_notes: {
        Row: {
          body: string
          copro_id: string
          id: string
          phase: Database["public"]["Enums"]["phase_copro"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          copro_id: string
          id?: string
          phase: Database["public"]["Enums"]["phase_copro"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          copro_id?: string
          id?: string
          phase?: Database["public"]["Enums"]["phase_copro"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phase_notes_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_notes_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pieces_justificatives: {
        Row: {
          copro_id: string
          coproprietaire_id: string
          id: string
          mime: string | null
          name: string
          size: number | null
          storage_path: string
          type: Database["public"]["Enums"]["type_piece"]
          uploaded_at: string
        }
        Insert: {
          copro_id: string
          coproprietaire_id: string
          id?: string
          mime?: string | null
          name: string
          size?: number | null
          storage_path: string
          type: Database["public"]["Enums"]["type_piece"]
          uploaded_at?: string
        }
        Update: {
          copro_id?: string
          coproprietaire_id?: string
          id?: string
          mime?: string | null
          name?: string
          size?: number | null
          storage_path?: string
          type?: Database["public"]["Enums"]["type_piece"]
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pieces_justificatives_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_justificatives_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_justificatives_coproprietaire_id_fkey"
            columns: ["coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
            referencedColumns: ["id"]
          },
        ]
      }
      plans_definitifs: {
        Row: {
          copro_id: string
          created_at: string
          data: Json
          id: string
          nom: string
          resultat: Json | null
          source_fichier: string | null
          statut: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          copro_id: string
          created_at?: string
          data?: Json
          id?: string
          nom?: string
          resultat?: Json | null
          source_fichier?: string | null
          statut?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          copro_id?: string
          created_at?: string
          data?: Json
          id?: string
          nom?: string
          resultat?: Json | null
          source_fichier?: string | null
          statut?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_definitifs_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_definitifs_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      plans_individuels: {
        Row: {
          avance_part: number
          cee_part: number
          coproprietaire_id: string
          detail: Json | null
          eco_ptz_part: number
          id: string
          mensualite: number
          mpr_indiv: number
          quote_part: number
          reste: number
          scenario_id: string
          subv_coll_part: number
          tantiemes: number
        }
        Insert: {
          avance_part?: number
          cee_part?: number
          coproprietaire_id: string
          detail?: Json | null
          eco_ptz_part?: number
          id?: string
          mensualite?: number
          mpr_indiv?: number
          quote_part?: number
          reste?: number
          scenario_id: string
          subv_coll_part?: number
          tantiemes?: number
        }
        Update: {
          avance_part?: number
          cee_part?: number
          coproprietaire_id?: string
          detail?: Json | null
          eco_ptz_part?: number
          id?: string
          mensualite?: number
          mpr_indiv?: number
          quote_part?: number
          reste?: number
          scenario_id?: string
          subv_coll_part?: number
          tantiemes?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_individuels_coproprietaire_id_fkey"
            columns: ["coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_individuels_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios_financiers"
            referencedColumns: ["id"]
          },
        ]
      }
      prestataire_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nom: string
          prestataire_id: string
          role: string | null
          telephone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nom: string
          prestataire_id: string
          role?: string | null
          telephone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nom?: string
          prestataire_id?: string
          role?: string | null
          telephone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prestataire_contacts_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
        ]
      }
      prestataire_docs: {
        Row: {
          expire_le: string | null
          id: string
          name: string
          path: string
          prestataire_id: string
          rappel_envoye_at: string | null
          size: number | null
          uploaded_at: string
        }
        Insert: {
          expire_le?: string | null
          id?: string
          name: string
          path: string
          prestataire_id: string
          rappel_envoye_at?: string | null
          size?: number | null
          uploaded_at?: string
        }
        Update: {
          expire_le?: string | null
          id?: string
          name?: string
          path?: string
          prestataire_id?: string
          rappel_envoye_at?: string | null
          size?: number | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prestataire_docs_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
        ]
      }
      prestataires: {
        Row: {
          actif: boolean
          adresse: string | null
          code_postal: string | null
          contact_nom: string | null
          created_at: string
          email: string
          email_secondaire: string | null
          id: string
          logo_path: string | null
          notes: string | null
          raison_sociale: string
          siret: string | null
          site_web: string | null
          telephone: string | null
          types: Database["public"]["Enums"]["type_consultation"][]
          updated_at: string
          user_id: string | null
          ville: string | null
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          code_postal?: string | null
          contact_nom?: string | null
          created_at?: string
          email: string
          email_secondaire?: string | null
          id?: string
          logo_path?: string | null
          notes?: string | null
          raison_sociale: string
          siret?: string | null
          site_web?: string | null
          telephone?: string | null
          types?: Database["public"]["Enums"]["type_consultation"][]
          updated_at?: string
          user_id?: string | null
          ville?: string | null
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          code_postal?: string | null
          contact_nom?: string | null
          created_at?: string
          email?: string
          email_secondaire?: string | null
          id?: string
          logo_path?: string | null
          notes?: string | null
          raison_sociale?: string
          siret?: string | null
          site_web?: string | null
          telephone?: string | null
          types?: Database["public"]["Enums"]["type_consultation"][]
          updated_at?: string
          user_id?: string | null
          ville?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          avatar_color: string | null
          created_at: string
          full_name: string
          initials: string
          job_title: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          avatar_color?: string | null
          created_at?: string
          full_name: string
          initials: string
          job_title?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          avatar_color?: string | null
          created_at?: string
          full_name?: string
          initials?: string
          job_title?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      projet_docs: {
        Row: {
          copro_id: string
          id: string
          name: string
          path: string
          prestataire_id: string
          size: number | null
          uploaded_at: string
        }
        Insert: {
          copro_id: string
          id?: string
          name: string
          path: string
          prestataire_id: string
          size?: number | null
          uploaded_at?: string
        }
        Update: {
          copro_id?: string
          id?: string
          name?: string
          path?: string
          prestataire_id?: string
          size?: number | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projet_docs_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projet_docs_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projet_docs_prestataire_id_fkey"
            columns: ["prestataire_id"]
            isOneToOne: false
            referencedRelation: "prestataires"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios_financiers: {
        Row: {
          bareme_millesime: number | null
          copro_id: string
          created_at: string
          id: string
          locked: boolean
          name: string
          params: Json
          plan_definitif_id: string | null
          resultat: Json | null
          statut: Database["public"]["Enums"]["statut_scenario"]
          updated_at: string
          validated_at: string | null
        }
        Insert: {
          bareme_millesime?: number | null
          copro_id: string
          created_at?: string
          id?: string
          locked?: boolean
          name: string
          params: Json
          plan_definitif_id?: string | null
          resultat?: Json | null
          statut?: Database["public"]["Enums"]["statut_scenario"]
          updated_at?: string
          validated_at?: string | null
        }
        Update: {
          bareme_millesime?: number | null
          copro_id?: string
          created_at?: string
          id?: string
          locked?: boolean
          name?: string
          params?: Json
          plan_definitif_id?: string | null
          resultat?: Json | null
          statut?: Database["public"]["Enums"]["statut_scenario"]
          updated_at?: string
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenarios_financiers_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenarios_financiers_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenarios_financiers_plan_definitif_id_fkey"
            columns: ["plan_definitif_id"]
            isOneToOne: false
            referencedRelation: "plans_definitifs"
            referencedColumns: ["id"]
          },
        ]
      }
      suivi_financier: {
        Row: {
          copro_id: string
          created_at: string
          paiements: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          copro_id: string
          created_at?: string
          paiements?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          copro_id?: string
          created_at?: string
          paiements?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suivi_financier_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: true
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suivi_financier_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: true
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
      taches: {
        Row: {
          assignee_user_id: string | null
          copro_id: string
          created_at: string
          due_date: string | null
          due_label: string | null
          id: string
          jalon: string | null
          phase: Database["public"]["Enums"]["phase_copro"]
          position: number
          status: Database["public"]["Enums"]["statut_tache"]
          tag: string | null
          title: string
        }
        Insert: {
          assignee_user_id?: string | null
          copro_id: string
          created_at?: string
          due_date?: string | null
          due_label?: string | null
          id?: string
          jalon?: string | null
          phase: Database["public"]["Enums"]["phase_copro"]
          position?: number
          status?: Database["public"]["Enums"]["statut_tache"]
          tag?: string | null
          title: string
        }
        Update: {
          assignee_user_id?: string | null
          copro_id?: string
          created_at?: string
          due_date?: string | null
          due_label?: string | null
          id?: string
          jalon?: string | null
          phase?: Database["public"]["Enums"]["phase_copro"]
          position?: number
          status?: Database["public"]["Enums"]["statut_tache"]
          tag?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "taches_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "taches_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taches_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      copro_stats: {
        Row: {
          batiments: number | null
          coproprietaires: number | null
          id: string | null
          lots: number | null
          lots_hab: number | null
          montant_ttc: number | null
          next_task: string | null
          reste_a_charge: number | null
          scenario: string | null
          taux_aides: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      a_postule: { Args: { p_consultation_id: string }; Returns: boolean }
      copro_visible_presta: { Args: { p_copro_id: string }; Returns: boolean }
      documents_dossier: {
        Args: { p_copro_id: string }
        Returns: {
          depose_le: string
          dossier: string
          id: string
          name: string
          origine: string
          path: string
          taille: number
        }[]
      }
      enquete_reponses_syndic: {
        Args: { p_copro_id: string }
        Returns: {
          coproprietaire_id: string
          nb_personnes: number
          profil_mpr: string
          statut_occupation: string
          updated_at: string
        }[]
      }
      is_amo: { Args: never; Returns: boolean }
      is_copro_of: { Args: { p_copro_id: string }; Returns: boolean }
      is_directeur_of: { Args: { p_copro_id: string }; Returns: boolean }
      is_moe_retenu_of: { Args: { p_copro_id: string }; Returns: boolean }
      is_presta_retenu_of: { Args: { p_copro_id: string }; Returns: boolean }
      is_scenario_partage: { Args: { p_scenario_id: string }; Returns: boolean }
      is_syndic_of: { Args: { p_copro_id: string }; Returns: boolean }
      my_coproprietaire_ids: { Args: never; Returns: string[] }
      my_lot_ids: { Args: never; Returns: string[] }
      my_presta_types: {
        Args: never
        Returns: Database["public"]["Enums"]["type_consultation"][]
      }
      my_prestataire_id: { Args: never; Returns: string }
      peut_postuler: { Args: { p_consultation_id: string }; Returns: boolean }
      peut_voir_consultation: {
        Args: { p_consultation_id: string }
        Returns: boolean
      }
      rattacher_lot: {
        // p_cible_id null = détacher le lot (défaut SQL non vu par le générateur)
        Args: { p_cible_id: string | null; p_lot_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "amo" | "syndic" | "moe" | "copro" | "presta"
      canal_message: "prestataires" | "syndic" | "coproprietaires"
      member_role: "amo_referent" | "syndic" | "moe" | "coproprietaire"
      org_role: "directeur" | "gestionnaire"
      phase_copro: "diagnostic" | "etudes" | "travaux"
      statut_candidature: "recue" | "retenue" | "non_retenue"
      statut_consultation: "en_ligne" | "cloturee"
      statut_enquete: "brouillon" | "prete" | "envoyee"
      statut_notification: "simule" | "envoye" | "erreur"
      statut_scenario: "brouillon" | "partage" | "importe"
      statut_tache: "todo" | "doing" | "done"
      type_consultation: "moe" | "diag" | "ct" | "sps" | "autre"
      type_financement: "collectif" | "individuel" | "fonds"
      type_piece:
        | "avis_imposition"
        | "piece_identite"
        | "rib"
        | "justificatif_domicile"
        | "taxe_fonciere"
      usage_lot:
        | "habitation"
        | "garage"
        | "caves"
        | "autres"
        | "commerces"
        | "bureaux"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["amo", "syndic", "moe", "copro", "presta"],
      canal_message: ["prestataires", "syndic", "coproprietaires"],
      member_role: ["amo_referent", "syndic", "moe", "coproprietaire"],
      org_role: ["directeur", "gestionnaire"],
      phase_copro: ["diagnostic", "etudes", "travaux"],
      statut_candidature: ["recue", "retenue", "non_retenue"],
      statut_consultation: ["en_ligne", "cloturee"],
      statut_enquete: ["brouillon", "prete", "envoyee"],
      statut_notification: ["simule", "envoye", "erreur"],
      statut_scenario: ["brouillon", "partage", "importe"],
      statut_tache: ["todo", "doing", "done"],
      type_consultation: ["moe", "diag", "ct", "sps", "autre"],
      type_financement: ["collectif", "individuel", "fonds"],
      type_piece: [
        "avis_imposition",
        "piece_identite",
        "rib",
        "justificatif_domicile",
        "taxe_fonciere",
      ],
      usage_lot: [
        "habitation",
        "garage",
        "caves",
        "autres",
        "commerces",
        "bureaux",
      ],
    },
  },
} as const
