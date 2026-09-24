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
    PostgrestVersion: "14.5"
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
      audit_log: {
        Row: {
          bulletin_id: string
          evenement: string
          hash_courant: string
          hash_precedent: string | null
          horodatage: string
          id: number
          ip: unknown
          payload: Json | null
          signataire_id: string | null
          user_agent: string | null
        }
        Insert: {
          bulletin_id: string
          evenement: string
          hash_courant?: string
          hash_precedent?: string | null
          horodatage?: string
          id?: number
          ip?: unknown
          payload?: Json | null
          signataire_id?: string | null
          user_agent?: string | null
        }
        Update: {
          bulletin_id?: string
          evenement?: string
          hash_courant?: string
          hash_precedent?: string | null
          horodatage?: string
          id?: number
          ip?: unknown
          payload?: Json | null
          signataire_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
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
      bulletins: {
        Row: {
          adhesion_id: string | null
          alerte_j25_le: string | null
          certificat_path: string | null
          cgu_version: string
          copro_id: string
          coproprietaire_id: string
          created_at: string
          cree_par: string
          document_hash: string | null
          document_path: string | null
          document_signe_hash: string | null
          document_signe_path: string | null
          eco_ptz_demande: boolean
          iban_chiffre: string | null
          iban_dernier4: string | null
          id: string
          liens_envoyes_le: string | null
          lot_id: string | null
          lot_reference: string
          notification_anah_le: string | null
          purge_effectuee_le: string | null
          rib_hash: string | null
          rib_path: string | null
          sceau_signature: string | null
          scelle_le: string | null
          statut: Database["public"]["Enums"]["bulletin_statut"]
          tantiemes: number | null
          transmission_banque_le: string | null
        }
        Insert: {
          adhesion_id?: string | null
          alerte_j25_le?: string | null
          certificat_path?: string | null
          cgu_version: string
          copro_id: string
          coproprietaire_id: string
          created_at?: string
          cree_par?: string
          document_hash?: string | null
          document_path?: string | null
          document_signe_hash?: string | null
          document_signe_path?: string | null
          eco_ptz_demande?: boolean
          iban_chiffre?: string | null
          iban_dernier4?: string | null
          id?: string
          liens_envoyes_le?: string | null
          lot_id?: string | null
          lot_reference: string
          notification_anah_le?: string | null
          purge_effectuee_le?: string | null
          rib_hash?: string | null
          rib_path?: string | null
          sceau_signature?: string | null
          scelle_le?: string | null
          statut?: Database["public"]["Enums"]["bulletin_statut"]
          tantiemes?: number | null
          transmission_banque_le?: string | null
        }
        Update: {
          adhesion_id?: string | null
          alerte_j25_le?: string | null
          certificat_path?: string | null
          cgu_version?: string
          copro_id?: string
          coproprietaire_id?: string
          created_at?: string
          cree_par?: string
          document_hash?: string | null
          document_path?: string | null
          document_signe_hash?: string | null
          document_signe_path?: string | null
          eco_ptz_demande?: boolean
          iban_chiffre?: string | null
          iban_dernier4?: string | null
          id?: string
          liens_envoyes_le?: string | null
          lot_id?: string | null
          lot_reference?: string
          notification_anah_le?: string | null
          purge_effectuee_le?: string | null
          rib_hash?: string | null
          rib_path?: string | null
          sceau_signature?: string | null
          scelle_le?: string | null
          statut?: Database["public"]["Enums"]["bulletin_statut"]
          tantiemes?: number | null
          transmission_banque_le?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulletins_adhesion_id_fkey"
            columns: ["adhesion_id"]
            isOneToOne: false
            referencedRelation: "adhesions_pret"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletins_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletins_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletins_coproprietaire_id_fkey"
            columns: ["coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletins_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
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
      cgu_acceptations: {
        Row: {
          accepte_le: string
          cgu_version: string
          contexte: string
          coproprietaire_id: string | null
          id: string
          info_avis_imposition: boolean
          user_id: string
        }
        Insert: {
          accepte_le?: string
          cgu_version: string
          contexte?: string
          coproprietaire_id?: string | null
          id?: string
          info_avis_imposition?: boolean
          user_id?: string
        }
        Update: {
          accepte_le?: string
          cgu_version?: string
          contexte?: string
          coproprietaire_id?: string | null
          id?: string
          info_avis_imposition?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cgu_acceptations_coproprietaire_id_fkey"
            columns: ["coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
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
          saisi_par: string
          scenario_id: string
          transmitted_at: string
          type: Database["public"]["Enums"]["type_financement"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          coproprietaire_id: string
          duree_annees?: number | null
          id?: string
          lot_ids?: string[]
          saisi_par?: string
          scenario_id: string
          transmitted_at?: string
          type: Database["public"]["Enums"]["type_financement"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          coproprietaire_id?: string
          duree_annees?: number | null
          id?: string
          lot_ids?: string[]
          saisi_par?: string
          scenario_id?: string
          transmitted_at?: string
          type?: Database["public"]["Enums"]["type_financement"]
          updated_at?: string
          updated_by?: string | null
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
          lien_adhesion: string | null
          updated_at: string
        }
        Insert: {
          adhesion_ouverte?: boolean
          banque?: string
          copro_id: string
          duree_annees?: number
          lien_adhesion?: string | null
          updated_at?: string
        }
        Update: {
          adhesion_ouverte?: boolean
          banque?: string
          copro_id?: string
          duree_annees?: number
          lien_adhesion?: string | null
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
          sortant_le: string | null
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
          sortant_le?: string | null
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
          sortant_le?: string | null
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
      demandes_amo: {
        Row: {
          adresse: string
          chauffage: string | null
          commentaire_amo: string | null
          copro_id: string | null
          copro_nom: string
          created_at: string
          demandeur_email: string | null
          demandeur_nom: string
          demandeur_user_id: string | null
          fichiers: Json
          id: string
          nb_lots: number | null
          organisation_id: string | null
          statut: string
          syndic_name: string | null
          traite_le: string | null
          traite_par: string | null
          vmc: boolean | null
        }
        Insert: {
          adresse?: string
          chauffage?: string | null
          commentaire_amo?: string | null
          copro_id?: string | null
          copro_nom: string
          created_at?: string
          demandeur_email?: string | null
          demandeur_nom?: string
          demandeur_user_id?: string | null
          fichiers?: Json
          id?: string
          nb_lots?: number | null
          organisation_id?: string | null
          statut?: string
          syndic_name?: string | null
          traite_le?: string | null
          traite_par?: string | null
          vmc?: boolean | null
        }
        Update: {
          adresse?: string
          chauffage?: string | null
          commentaire_amo?: string | null
          copro_id?: string | null
          copro_nom?: string
          created_at?: string
          demandeur_email?: string | null
          demandeur_nom?: string
          demandeur_user_id?: string | null
          fichiers?: Json
          id?: string
          nb_lots?: number | null
          organisation_id?: string | null
          statut?: string
          syndic_name?: string | null
          traite_le?: string | null
          traite_par?: string | null
          vmc?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "demandes_amo_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_amo_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_amo_demandeur_user_id_fkey"
            columns: ["demandeur_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      documents_reference: {
        Row: {
          created_at: string
          description: string | null
          id: string
          mime: string | null
          name: string
          secteur: string
          size: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          mime?: string | null
          name: string
          secteur?: string
          size?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          mime?: string | null
          name?: string
          secteur?: string
          size?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      enquete_reponses: {
        Row: {
          coproprietaire_id: string
          enquete_id: string
          id: string
          nb_personnes: number | null
          profil_mpr: string | null
          profil_statut: string
          profil_verifie_le: string | null
          profil_verifie_par: string | null
          reponses: Json | null
          rfr: number | null
          rfr_n2: number | null
          statut_occupation: string | null
          updated_at: string
        }
        Insert: {
          coproprietaire_id: string
          enquete_id: string
          id?: string
          nb_personnes?: number | null
          profil_mpr?: string | null
          profil_statut?: string
          profil_verifie_le?: string | null
          profil_verifie_par?: string | null
          reponses?: Json | null
          rfr?: number | null
          rfr_n2?: number | null
          statut_occupation?: string | null
          updated_at?: string
        }
        Update: {
          coproprietaire_id?: string
          enquete_id?: string
          id?: string
          nb_personnes?: number | null
          profil_mpr?: string | null
          profil_statut?: string
          profil_verifie_le?: string | null
          profil_verifie_par?: string | null
          reponses?: Json | null
          rfr?: number | null
          rfr_n2?: number | null
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
          {
            foreignKeyName: "enquete_reponses_profil_verifie_par_fkey"
            columns: ["profil_verifie_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
      fiche_etat_signatures: {
        Row: {
          attestation_le: string | null
          copro_id: string
          created_at: string
          donnees_hash: string | null
          email: string
          id: string
          lien_envoye_le: string | null
          nom: string
          role: string
          signe_le: string | null
          statut: string
          token_expire_le: string | null
          updated_at: string
        }
        Insert: {
          attestation_le?: string | null
          copro_id: string
          created_at?: string
          donnees_hash?: string | null
          email?: string
          id?: string
          lien_envoye_le?: string | null
          nom?: string
          role: string
          signe_le?: string | null
          statut?: string
          token_expire_le?: string | null
          updated_at?: string
        }
        Update: {
          attestation_le?: string | null
          copro_id?: string
          created_at?: string
          donnees_hash?: string | null
          email?: string
          id?: string
          lien_envoye_le?: string | null
          nom?: string
          role?: string
          signe_le?: string | null
          statut?: string
          token_expire_le?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiche_etat_signatures_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
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
      lots_mutations: {
        Row: {
          ancien_coproprietaire_id: string | null
          annexe: boolean
          commentaire: string | null
          copro_id: string
          fait_le: string
          fait_par: string | null
          id: string
          lot_id: string
          motif: string
          nouveau_coproprietaire_id: string
        }
        Insert: {
          ancien_coproprietaire_id?: string | null
          annexe?: boolean
          commentaire?: string | null
          copro_id: string
          fait_le?: string
          fait_par?: string | null
          id?: string
          lot_id: string
          motif: string
          nouveau_coproprietaire_id: string
        }
        Update: {
          ancien_coproprietaire_id?: string | null
          annexe?: boolean
          commentaire?: string | null
          copro_id?: string
          fait_le?: string
          fait_par?: string | null
          id?: string
          lot_id?: string
          motif?: string
          nouveau_coproprietaire_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lots_mutations_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_mutations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_mutations_ancien_coproprietaire_id_fkey"
            columns: ["ancien_coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_mutations_nouveau_coproprietaire_id_fkey"
            columns: ["nouveau_coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
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
          coproprietaire_id: string | null
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
          coproprietaire_id?: string | null
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
          coproprietaire_id?: string | null
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
            foreignKeyName: "messages_projet_coproprietaire_id_fkey"
            columns: ["coproprietaire_id"]
            isOneToOne: false
            referencedRelation: "coproprietaires"
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
          confidentiel: boolean
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
          confidentiel?: boolean
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
          confidentiel?: boolean
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
          module_ppt: boolean
          nom: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_ppt?: boolean
          nom: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          module_ppt?: boolean
          nom?: string
          slug?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          code_hash: string
          created_at: string
          expire_le: string
          id: string
          signataire_id: string
          tentatives: number
          valide_le: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          expire_le: string
          id?: string
          signataire_id: string
          tentatives?: number
          valide_le?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          expire_le?: string
          id?: string
          signataire_id?: string
          tentatives?: number
          valide_le?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "otp_codes_signataire_id_fkey"
            columns: ["signataire_id"]
            isOneToOne: false
            referencedRelation: "signataires"
            referencedColumns: ["id"]
          },
        ]
      }
      passations: {
        Row: {
          ancien_chef: string | null
          copro_id: string
          created_at: string
          email_statut: string
          id: string
          notifie_par: string | null
          nouveau_chef: string
        }
        Insert: {
          ancien_chef?: string | null
          copro_id: string
          created_at?: string
          email_statut?: string
          id?: string
          notifie_par?: string | null
          nouveau_chef: string
        }
        Update: {
          ancien_chef?: string | null
          copro_id?: string
          created_at?: string
          email_statut?: string
          id?: string
          notifie_par?: string | null
          nouveau_chef?: string
        }
        Relationships: [
          {
            foreignKeyName: "passations_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passations_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
        ]
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
          deposee_par: string | null
          deposee_par_nom: string | null
          id: string
          mime: string | null
          motif_refus: string | null
          name: string
          qualification: string | null
          refus_email_le: string | null
          refus_email_statut: string | null
          sha256: string | null
          size: number | null
          statut: Database["public"]["Enums"]["statut_piece"]
          storage_path: string
          type: Database["public"]["Enums"]["type_piece"]
          uploaded_at: string
          verifiee_le: string | null
          verifiee_par: string | null
          verifiee_par_nom: string | null
        }
        Insert: {
          copro_id: string
          coproprietaire_id: string
          deposee_par?: string | null
          deposee_par_nom?: string | null
          id?: string
          mime?: string | null
          motif_refus?: string | null
          name: string
          qualification?: string | null
          refus_email_le?: string | null
          refus_email_statut?: string | null
          sha256?: string | null
          size?: number | null
          statut?: Database["public"]["Enums"]["statut_piece"]
          storage_path: string
          type: Database["public"]["Enums"]["type_piece"]
          uploaded_at?: string
          verifiee_le?: string | null
          verifiee_par?: string | null
          verifiee_par_nom?: string | null
        }
        Update: {
          copro_id?: string
          coproprietaire_id?: string
          deposee_par?: string | null
          deposee_par_nom?: string | null
          id?: string
          mime?: string | null
          motif_refus?: string | null
          name?: string
          qualification?: string | null
          refus_email_le?: string | null
          refus_email_statut?: string | null
          sha256?: string | null
          size?: number | null
          statut?: Database["public"]["Enums"]["statut_piece"]
          storage_path?: string
          type?: Database["public"]["Enums"]["type_piece"]
          uploaded_at?: string
          verifiee_le?: string | null
          verifiee_par?: string | null
          verifiee_par_nom?: string | null
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
          estimatif_groupe: string | null
          id: string
          nature: string
          nom: string
          resultat: Json | null
          scenario_ordre: number | null
          source_fichier: string | null
          source_fichier_id: string | null
          statut: string
          updated_at: string
          updated_by: string | null
          valide_fichier_id: string | null
          valide_le: string | null
          version: number
        }
        Insert: {
          copro_id: string
          created_at?: string
          data?: Json
          estimatif_groupe?: string | null
          id?: string
          nature?: string
          nom?: string
          resultat?: Json | null
          scenario_ordre?: number | null
          source_fichier?: string | null
          source_fichier_id?: string | null
          statut?: string
          updated_at?: string
          updated_by?: string | null
          valide_fichier_id?: string | null
          valide_le?: string | null
          version?: number
        }
        Update: {
          copro_id?: string
          created_at?: string
          data?: Json
          estimatif_groupe?: string | null
          id?: string
          nature?: string
          nom?: string
          resultat?: Json | null
          scenario_ordre?: number | null
          source_fichier?: string | null
          source_fichier_id?: string | null
          statut?: string
          updated_at?: string
          updated_by?: string | null
          valide_fichier_id?: string | null
          valide_le?: string | null
          version?: number
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
          {
            foreignKeyName: "plans_definitifs_source_fichier_id_fkey"
            columns: ["source_fichier_id"]
            isOneToOne: false
            referencedRelation: "fichiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_definitifs_valide_fichier_id_fkey"
            columns: ["valide_fichier_id"]
            isOneToOne: false
            referencedRelation: "fichiers"
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
      ppt_affectations: {
        Row: {
          au: string | null
          du: string
          email: string | null
          id: string
          nom: string | null
          ppt_copro_id: string
          user_id: string | null
        }
        Insert: {
          au?: string | null
          du?: string
          email?: string | null
          id?: string
          nom?: string | null
          ppt_copro_id: string
          user_id?: string | null
        }
        Update: {
          au?: string | null
          du?: string
          email?: string | null
          id?: string
          nom?: string | null
          ppt_copro_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ppt_affectations_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_affectations_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_affectations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ppt_ag: {
        Row: {
          created_at: string
          date_ag: string
          id: string
          notes: string | null
          ppt_copro_id: string
          pv_rapport_id: string | null
          saisi_par: string | null
          type: string
        }
        Insert: {
          created_at?: string
          date_ag: string
          id?: string
          notes?: string | null
          ppt_copro_id: string
          pv_rapport_id?: string | null
          saisi_par?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          date_ag?: string
          id?: string
          notes?: string | null
          ppt_copro_id?: string
          pv_rapport_id?: string | null
          saisi_par?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppt_ag_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_ag_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_ag_pv_rapport_id_fkey"
            columns: ["pv_rapport_id"]
            isOneToOne: false
            referencedRelation: "ppt_rapports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_ag_saisi_par_fkey"
            columns: ["saisi_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ppt_analyses: {
        Row: {
          importe_le: string
          importe_par: string | null
          json_corrige: Json
          json_verif: Json
          rapport_id: string
          updated_at: string
        }
        Insert: {
          importe_le?: string
          importe_par?: string | null
          json_corrige: Json
          json_verif: Json
          rapport_id: string
          updated_at?: string
        }
        Update: {
          importe_le?: string
          importe_par?: string | null
          json_corrige?: Json
          json_verif?: Json
          rapport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppt_analyses_importe_par_fkey"
            columns: ["importe_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ppt_analyses_rapport_id_fkey"
            columns: ["rapport_id"]
            isOneToOne: true
            referencedRelation: "ppt_rapports"
            referencedColumns: ["id"]
          },
        ]
      }
      ppt_coproprietes: {
        Row: {
          adresse: string | null
          annee_construction: number | null
          budget_previsionnel_annuel: number | null
          cep_kwhep_m2_an: number | null
          chauffage: string | null
          code_postal: string | null
          commune: string | null
          copro_id: string | null
          created_at: string
          created_by: string | null
          date_dpe: string | null
          deleted_at: string | null
          energie_chauffage: string | null
          etiquette_energie: string | null
          etiquette_ges: string | null
          fonds_travaux_cotisation_annuelle: number | null
          fonds_travaux_maj: string | null
          fonds_travaux_solde: number | null
          gestionnaire_email: string | null
          gestionnaire_nom: string | null
          id: string
          immatriculation_rnc: string | null
          importe_le: string | null
          nb_batiments: number | null
          nb_logements: number | null
          nb_lots: number | null
          nom: string
          organisation_id: string
          plus_de_15_ans: boolean | null
          pppt_presente: boolean | null
          surface_m2: number | null
          surface_type: string | null
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          annee_construction?: number | null
          budget_previsionnel_annuel?: number | null
          cep_kwhep_m2_an?: number | null
          chauffage?: string | null
          code_postal?: string | null
          commune?: string | null
          copro_id?: string | null
          created_at?: string
          created_by?: string | null
          date_dpe?: string | null
          deleted_at?: string | null
          energie_chauffage?: string | null
          etiquette_energie?: string | null
          etiquette_ges?: string | null
          fonds_travaux_cotisation_annuelle?: number | null
          fonds_travaux_maj?: string | null
          fonds_travaux_solde?: number | null
          gestionnaire_email?: string | null
          gestionnaire_nom?: string | null
          id?: string
          immatriculation_rnc?: string | null
          importe_le?: string | null
          nb_batiments?: number | null
          nb_logements?: number | null
          nb_lots?: number | null
          nom: string
          organisation_id: string
          plus_de_15_ans?: boolean | null
          pppt_presente?: boolean | null
          surface_m2?: number | null
          surface_type?: string | null
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          annee_construction?: number | null
          budget_previsionnel_annuel?: number | null
          cep_kwhep_m2_an?: number | null
          chauffage?: string | null
          code_postal?: string | null
          commune?: string | null
          copro_id?: string | null
          created_at?: string
          created_by?: string | null
          date_dpe?: string | null
          deleted_at?: string | null
          energie_chauffage?: string | null
          etiquette_energie?: string | null
          etiquette_ges?: string | null
          fonds_travaux_cotisation_annuelle?: number | null
          fonds_travaux_maj?: string | null
          fonds_travaux_solde?: number | null
          gestionnaire_email?: string | null
          gestionnaire_nom?: string | null
          id?: string
          immatriculation_rnc?: string | null
          importe_le?: string | null
          nb_batiments?: number | null
          nb_logements?: number | null
          nb_lots?: number | null
          nom?: string
          organisation_id?: string
          plus_de_15_ans?: boolean | null
          pppt_presente?: boolean | null
          surface_m2?: number | null
          surface_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppt_coproprietes_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_coproprietes_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_coproprietes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ppt_coproprietes_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      ppt_corrections: {
        Row: {
          chemin_json: string
          id: string
          le: string
          motif: string | null
          par: string | null
          poste_code: string | null
          rapport_id: string
          valeur_apres: Json | null
          valeur_avant: Json | null
        }
        Insert: {
          chemin_json: string
          id?: string
          le?: string
          motif?: string | null
          par?: string | null
          poste_code?: string | null
          rapport_id: string
          valeur_apres?: Json | null
          valeur_avant?: Json | null
        }
        Update: {
          chemin_json?: string
          id?: string
          le?: string
          motif?: string | null
          par?: string | null
          poste_code?: string | null
          rapport_id?: string
          valeur_apres?: Json | null
          valeur_avant?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ppt_corrections_par_fkey"
            columns: ["par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ppt_corrections_rapport_id_fkey"
            columns: ["rapport_id"]
            isOneToOne: false
            referencedRelation: "ppt_rapports"
            referencedColumns: ["id"]
          },
        ]
      }
      ppt_journal: {
        Row: {
          detail: Json
          id: string
          le: string
          par: string | null
          ppt_copro_id: string
          rapport_id: string | null
          type: string
        }
        Insert: {
          detail?: Json
          id?: string
          le?: string
          par?: string | null
          ppt_copro_id: string
          rapport_id?: string | null
          type: string
        }
        Update: {
          detail?: Json
          id?: string
          le?: string
          par?: string | null
          ppt_copro_id?: string
          rapport_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppt_journal_par_fkey"
            columns: ["par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ppt_journal_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_journal_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_journal_rapport_id_fkey"
            columns: ["rapport_id"]
            isOneToOne: false
            referencedRelation: "ppt_rapports"
            referencedColumns: ["id"]
          },
        ]
      }
      ppt_parametres_org: {
        Row: {
          base_honoraires: string
          inflation_pct: number
          moe_pct: number
          organisation_id: string
          syndic_pct: number
          taux_honoraires_pct: number
          tva_energetique_pct: number
          tva_facades_pct: number
          updated_at: string
        }
        Insert: {
          base_honoraires?: string
          inflation_pct?: number
          moe_pct?: number
          organisation_id: string
          syndic_pct?: number
          taux_honoraires_pct?: number
          tva_energetique_pct?: number
          tva_facades_pct?: number
          updated_at?: string
        }
        Update: {
          base_honoraires?: string
          inflation_pct?: number
          moe_pct?: number
          organisation_id?: string
          syndic_pct?: number
          taux_honoraires_pct?: number
          tva_energetique_pct?: number
          tva_facades_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppt_parametres_org_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      ppt_postes: {
        Row: {
          actif: boolean
          annee_origine: string | null
          annee_prevue: number | null
          annee_prochaine_presentation: number | null
          avec_moe: boolean
          batiment: string | null
          code_source: string | null
          commentaire: string | null
          cout_ht_base: number | null
          cout_origine: string | null
          created_at: string
          critere: string | null
          gain_energetique_pct: number | null
          id: string
          libelle: string
          libelle_source: string | null
          montant_vote: number | null
          montant_syndic: number | null
          commentaire_syndic: string | null
          // retouche manuelle (0087) : retrait d'une ligne par le syndic, motivé
          motif_retrait: string | null
          retire_le: string | null
          retire_par: string | null
          origine: string
          ouvrage: string | null
          position: number
          ppt_copro_id: string
          priorite: string
          rapport_id: string | null
          statut: string
          tva_pct: number | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          annee_origine?: string | null
          annee_prevue?: number | null
          annee_prochaine_presentation?: number | null
          avec_moe?: boolean
          batiment?: string | null
          code_source?: string | null
          commentaire?: string | null
          cout_ht_base?: number | null
          cout_origine?: string | null
          created_at?: string
          critere?: string | null
          gain_energetique_pct?: number | null
          id?: string
          libelle: string
          libelle_source?: string | null
          montant_vote?: number | null
          montant_syndic?: number | null
          commentaire_syndic?: string | null
          motif_retrait?: string | null
          retire_le?: string | null
          retire_par?: string | null
          origine?: string
          ouvrage?: string | null
          position?: number
          ppt_copro_id: string
          priorite: string
          rapport_id?: string | null
          statut?: string
          tva_pct?: number | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          annee_origine?: string | null
          annee_prevue?: number | null
          annee_prochaine_presentation?: number | null
          avec_moe?: boolean
          batiment?: string | null
          code_source?: string | null
          commentaire?: string | null
          cout_ht_base?: number | null
          cout_origine?: string | null
          created_at?: string
          critere?: string | null
          gain_energetique_pct?: number | null
          id?: string
          libelle?: string
          libelle_source?: string | null
          montant_vote?: number | null
          montant_syndic?: number | null
          commentaire_syndic?: string | null
          motif_retrait?: string | null
          retire_le?: string | null
          retire_par?: string | null
          origine?: string
          ouvrage?: string | null
          position?: number
          ppt_copro_id?: string
          priorite?: string
          rapport_id?: string | null
          statut?: string
          tva_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppt_postes_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_postes_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_postes_rapport_id_fkey"
            columns: ["rapport_id"]
            isOneToOne: false
            referencedRelation: "ppt_rapports"
            referencedColumns: ["id"]
          },
        ]
      }
      ppt_rapports: {
        Row: {
          created_at: string
          date_document: string | null
          depose_le: string
          depose_par: string | null
          id: string
          mime: string | null
          motif_rejet: string | null
          name: string
          nature_detectee: string | null
          ppt_copro_id: string
          prestataire: string | null
          prestataire_type: string | null
          remplace_rapport_id: string | null
          schema_version: string | null
          score_coherence_pct: number | null
          score_conformite_pct: number | null
          size: number | null
          statut: string
          taux_honoraires_pct: number | null
          storage_path: string
          type: string
          updated_at: string
          valide_le: string | null
          valide_par: string | null
          verdict: string | null
        }
        Insert: {
          created_at?: string
          date_document?: string | null
          depose_le?: string
          depose_par?: string | null
          id?: string
          mime?: string | null
          motif_rejet?: string | null
          name: string
          nature_detectee?: string | null
          ppt_copro_id: string
          prestataire?: string | null
          prestataire_type?: string | null
          remplace_rapport_id?: string | null
          schema_version?: string | null
          score_coherence_pct?: number | null
          score_conformite_pct?: number | null
          size?: number | null
          statut?: string
          taux_honoraires_pct?: number | null
          storage_path: string
          type?: string
          updated_at?: string
          valide_le?: string | null
          valide_par?: string | null
          verdict?: string | null
        }
        Update: {
          created_at?: string
          date_document?: string | null
          depose_le?: string
          depose_par?: string | null
          id?: string
          mime?: string | null
          motif_rejet?: string | null
          name?: string
          nature_detectee?: string | null
          ppt_copro_id?: string
          prestataire?: string | null
          prestataire_type?: string | null
          remplace_rapport_id?: string | null
          schema_version?: string | null
          score_coherence_pct?: number | null
          score_conformite_pct?: number | null
          size?: number | null
          statut?: string
          taux_honoraires_pct?: number | null
          storage_path?: string
          type?: string
          updated_at?: string
          valide_le?: string | null
          valide_par?: string | null
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ppt_rapports_depose_par_fkey"
            columns: ["depose_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ppt_rapports_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_rapports_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_rapports_remplace_rapport_id_fkey"
            columns: ["remplace_rapport_id"]
            isOneToOne: false
            referencedRelation: "ppt_rapports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_rapports_valide_par_fkey"
            columns: ["valide_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ppt_remarques: {
        Row: {
          action: string | null
          attendu: string | null
          code: string
          constat: string | null
          created_at: string
          ecart: string | null
          famille: string
          id: string
          libelle: string
          observe: string | null
          page: number | null
          poste_id: string | null
          ppt_copro_id: string
          rapport_id: string
          severite: string
          statut: string
          traitee: boolean
          visible_syndic: boolean
        }
        Insert: {
          action?: string | null
          attendu?: string | null
          code: string
          constat?: string | null
          created_at?: string
          ecart?: string | null
          famille: string
          id?: string
          libelle: string
          observe?: string | null
          page?: number | null
          poste_id?: string | null
          ppt_copro_id: string
          rapport_id: string
          severite: string
          statut: string
          traitee?: boolean
          visible_syndic?: boolean
        }
        Update: {
          action?: string | null
          attendu?: string | null
          code?: string
          constat?: string | null
          created_at?: string
          ecart?: string | null
          famille?: string
          id?: string
          libelle?: string
          observe?: string | null
          page?: number | null
          poste_id?: string | null
          ppt_copro_id?: string
          rapport_id?: string
          severite?: string
          statut?: string
          traitee?: boolean
          visible_syndic?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ppt_remarques_poste_id_fkey"
            columns: ["poste_id"]
            isOneToOne: false
            referencedRelation: "ppt_postes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_remarques_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_remarques_ppt_copro_id_fkey"
            columns: ["ppt_copro_id"]
            isOneToOne: false
            referencedRelation: "ppt_coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_remarques_rapport_id_fkey"
            columns: ["rapport_id"]
            isOneToOne: false
            referencedRelation: "ppt_rapports"
            referencedColumns: ["id"]
          },
        ]
      }
      ppt_resolutions: {
        Row: {
          abstentions: number | null
          ag_id: string
          article: string | null
          created_at: string
          id: string
          intitule: string
          issue: string
          montant_vote: number | null
          poste_id: string | null
          voix_contre: number | null
          voix_pour: number | null
        }
        Insert: {
          abstentions?: number | null
          ag_id: string
          article?: string | null
          created_at?: string
          id?: string
          intitule: string
          issue: string
          montant_vote?: number | null
          poste_id?: string | null
          voix_contre?: number | null
          voix_pour?: number | null
        }
        Update: {
          abstentions?: number | null
          ag_id?: string
          article?: string | null
          created_at?: string
          id?: string
          intitule?: string
          issue?: string
          montant_vote?: number | null
          poste_id?: string | null
          voix_contre?: number | null
          voix_pour?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ppt_resolutions_ag_id_fkey"
            columns: ["ag_id"]
            isOneToOne: false
            referencedRelation: "ppt_ag"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppt_resolutions_poste_id_fkey"
            columns: ["poste_id"]
            isOneToOne: false
            referencedRelation: "ppt_postes"
            referencedColumns: ["id"]
          },
        ]
      }
      ppt_traitements: {
        Row: {
          cout_usd: number | null
          demarre_le: string
          duree_ms: number | null
          erreur: string | null
          id: string
          mode: string
          modele: string | null
          prompt_version: string | null
          rapport_id: string
          schema_version: string | null
          statut: string
          termine_le: string | null
          tokens_cache_ecriture: number | null
          tokens_cache_lecture: number | null
          tokens_entree: number | null
          tokens_sortie: number | null
        }
        Insert: {
          cout_usd?: number | null
          demarre_le?: string
          duree_ms?: number | null
          erreur?: string | null
          id?: string
          mode: string
          modele?: string | null
          prompt_version?: string | null
          rapport_id: string
          schema_version?: string | null
          statut?: string
          termine_le?: string | null
          tokens_cache_ecriture?: number | null
          tokens_cache_lecture?: number | null
          tokens_entree?: number | null
          tokens_sortie?: number | null
        }
        Update: {
          cout_usd?: number | null
          demarre_le?: string
          duree_ms?: number | null
          erreur?: string | null
          id?: string
          mode?: string
          modele?: string | null
          prompt_version?: string | null
          rapport_id?: string
          schema_version?: string | null
          statut?: string
          termine_le?: string | null
          tokens_cache_ecriture?: number | null
          tokens_cache_lecture?: number | null
          tokens_entree?: number | null
          tokens_sortie?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ppt_traitements_rapport_id_fkey"
            columns: ["rapport_id"]
            isOneToOne: false
            referencedRelation: "ppt_rapports"
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
          dirigeant: boolean
          full_name: string
          initials: string
          job_title: string | null
          niveau_pieces: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          avatar_color?: string | null
          created_at?: string
          dirigeant?: boolean
          full_name: string
          initials: string
          job_title?: string | null
          niveau_pieces?: number
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          avatar_color?: string | null
          created_at?: string
          dirigeant?: boolean
          full_name?: string
          initials?: string
          job_title?: string | null
          niveau_pieces?: number
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
      rapport_syndic_envois: {
        Row: {
          created_at: string
          destinataires: Json
          envoyes: number
          erreurs: number
          id: string
          organisation_id: string
          periode: string
        }
        Insert: {
          created_at?: string
          destinataires?: Json
          envoyes?: number
          erreurs?: number
          id?: string
          organisation_id: string
          periode: string
        }
        Update: {
          created_at?: string
          destinataires?: Json
          envoyes?: number
          erreurs?: number
          id?: string
          organisation_id?: string
          periode?: string
        }
        Relationships: [
          {
            foreignKeyName: "rapport_syndic_envois_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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
      signataires: {
        Row: {
          adresse_ligne1: string | null
          adresse_ligne2: string | null
          attestation_honneur_le: string | null
          attestation_piece_le: string | null
          bulletin_id: string
          cgu_acceptees_le: string | null
          civilite: string | null
          code_postal: string | null
          created_at: string
          date_naissance: string | null
          document_hash_signature: string | null
          document_lu_le: string | null
          email: string
          id: string
          lieu_naissance: string | null
          nom: string
          ordre: number
          pays: string | null
          piece_deposee_ip: unknown
          piece_deposee_le: string | null
          piece_identite_hash: string | null
          piece_identite_path: string | null
          piece_identite_type: string | null
          prenom: string
          relance1_le: string | null
          relance2_le: string | null
          role: Database["public"]["Enums"]["signataire_role"]
          signe_ip: unknown
          signe_le: string | null
          signe_user_agent: string | null
          statut: Database["public"]["Enums"]["signataire_statut"]
          telephone: string
          token_consomme_le: string | null
          token_expire_le: string | null
          token_hash: string | null
          ville: string | null
        }
        Insert: {
          adresse_ligne1?: string | null
          adresse_ligne2?: string | null
          attestation_honneur_le?: string | null
          attestation_piece_le?: string | null
          bulletin_id: string
          cgu_acceptees_le?: string | null
          civilite?: string | null
          code_postal?: string | null
          created_at?: string
          date_naissance?: string | null
          document_hash_signature?: string | null
          document_lu_le?: string | null
          email: string
          id?: string
          lieu_naissance?: string | null
          nom: string
          ordre: number
          pays?: string | null
          piece_deposee_ip?: unknown
          piece_deposee_le?: string | null
          piece_identite_hash?: string | null
          piece_identite_path?: string | null
          piece_identite_type?: string | null
          prenom: string
          relance1_le?: string | null
          relance2_le?: string | null
          role: Database["public"]["Enums"]["signataire_role"]
          signe_ip?: unknown
          signe_le?: string | null
          signe_user_agent?: string | null
          statut?: Database["public"]["Enums"]["signataire_statut"]
          telephone: string
          token_consomme_le?: string | null
          token_expire_le?: string | null
          token_hash?: string | null
          ville?: string | null
        }
        Update: {
          adresse_ligne1?: string | null
          adresse_ligne2?: string | null
          attestation_honneur_le?: string | null
          attestation_piece_le?: string | null
          bulletin_id?: string
          cgu_acceptees_le?: string | null
          civilite?: string | null
          code_postal?: string | null
          created_at?: string
          date_naissance?: string | null
          document_hash_signature?: string | null
          document_lu_le?: string | null
          email?: string
          id?: string
          lieu_naissance?: string | null
          nom?: string
          ordre?: number
          pays?: string | null
          piece_deposee_ip?: unknown
          piece_deposee_le?: string | null
          piece_identite_hash?: string | null
          piece_identite_path?: string | null
          piece_identite_type?: string | null
          prenom?: string
          relance1_le?: string | null
          relance2_le?: string | null
          role?: Database["public"]["Enums"]["signataire_role"]
          signe_ip?: unknown
          signe_le?: string | null
          signe_user_agent?: string | null
          statut?: Database["public"]["Enums"]["signataire_statut"]
          telephone?: string
          token_consomme_le?: string | null
          token_expire_le?: string | null
          token_hash?: string | null
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signataires_bulletin_id_fkey"
            columns: ["bulletin_id"]
            isOneToOne: false
            referencedRelation: "bulletins"
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
      syndic_taches: {
        Row: {
          cle: string
          copro_id: string
          echeance: string | null
          fait_le: string | null
          fait_par: string | null
          id: string
          ordre: number
          phase: Database["public"]["Enums"]["phase_copro"]
          statut: string
          tag: string | null
          titre: string
          updated_at: string
        }
        Insert: {
          cle: string
          copro_id: string
          echeance?: string | null
          fait_le?: string | null
          fait_par?: string | null
          id?: string
          ordre?: number
          phase: Database["public"]["Enums"]["phase_copro"]
          statut?: string
          tag?: string | null
          titre: string
          updated_at?: string
        }
        Update: {
          cle?: string
          copro_id?: string
          echeance?: string | null
          fait_le?: string | null
          fait_par?: string | null
          id?: string
          ordre?: number
          phase?: Database["public"]["Enums"]["phase_copro"]
          statut?: string
          tag?: string | null
          titre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "syndic_taches_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copro_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syndic_taches_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "coproprietes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syndic_taches_fait_par_fkey"
            columns: ["fait_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
          staches_faites: number | null
          staches_total: number | null
          taches_faites: number | null
          taches_total: number | null
          taux_aides: number | null
        }
        Relationships: []
      }
      ppt_copro_stats: {
        Row: {
          derniere_ag: string | null
          id: string | null
          montant_ht_base: number | null
          nb_ag: number | null
          postes: number | null
          postes_non_chiffres: number | null
          prochaine_annee: number | null
          rapports_en_attente: number | null
          remarques_ouvertes: number | null
          reno_phase: string | null
          statut_rapport: string | null
          valide_le: string | null
        }
        Insert: {
          derniere_ag?: never
          id?: string | null
          montant_ht_base?: never
          nb_ag?: never
          postes?: never
          postes_non_chiffres?: never
          prochaine_annee?: never
          rapports_en_attente?: never
          remarques_ouvertes?: never
          reno_phase?: never
          statut_rapport?: never
          valide_le?: never
        }
        Update: {
          derniere_ag?: never
          id?: string | null
          montant_ht_base?: never
          nb_ag?: never
          postes?: never
          postes_non_chiffres?: never
          prochaine_annee?: never
          rapports_en_attente?: never
          remarques_ouvertes?: never
          reno_phase?: never
          statut_rapport?: never
          valide_le?: never
        }
        Relationships: []
      }
    }
    Functions: {
      a_postule: { Args: { p_consultation_id: string }; Returns: boolean }
      appels_de_fonds_syndic: {
        Args: { p_copro_id: string }
        Returns: {
          appel: number
          coproprietaire_id: string
          prime_cee: number
          source: string
        }[]
      }
      checklist_cocher_pieces: {
        // retouche manuelle à préserver : p_fichier_id accepte null (défaut SQL)
        Args: { p_copro_id: string; p_fichier_id?: string | null; p_labels: string[] }
        Returns: number
      }
      checklist_delier_fichier: {
        Args: { p_fichier_id: string }
        Returns: number
      }
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
      is_amo_niveau1: { Args: never; Returns: boolean }
      is_copro_of: { Args: { p_copro_id: string }; Returns: boolean }
      is_directeur_of: { Args: { p_copro_id: string }; Returns: boolean }
      is_dirigeant: { Args: never; Returns: boolean }
      is_moe_retenu_of: { Args: { p_copro_id: string }; Returns: boolean }
      is_org_membre_of: { Args: { p_copro_id: string }; Returns: boolean }
      is_presta_retenu_of: { Args: { p_copro_id: string }; Returns: boolean }
      is_scenario_partage: { Args: { p_scenario_id: string }; Returns: boolean }
      is_syndic_of: { Args: { p_copro_id: string }; Returns: boolean }
      my_coproprietaire_ids: { Args: never; Returns: string[] }
      syndic_changer_proprietaire: {
        // retouche manuelle (0090) : tous les paramètres sauf p_lot_id ont un défaut SQL
        Args: {
          p_lot_id: string
          p_coproprietaire_id?: string | null
          p_nom?: string | null
          p_email?: string | null
          p_telephone?: string | null
          p_type?: string | null
          p_motif?: string | null
          p_commentaire?: string | null
        }
        Returns: string
      }
      my_coproprietaire_ids_of: { Args: { p_copro_id: string }; Returns: string[] }
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
      phase_calculee: {
        Args: { p_copro_id: string }
        Returns: Database["public"]["Enums"]["phase_copro"]
      }
      ppt_ag_ouvre: { Args: { p_ag: string }; Returns: boolean }
      ppt_code_priorite: { Args: { p: string }; Returns: string }
      ppt_code_severite: { Args: { p: string }; Returns: string }
      ppt_code_statut_controle: { Args: { p: string }; Returns: string }
      ppt_corbeille_copro: {
        Args: { p_id: string; p_restaurer?: boolean }
        Returns: undefined
      }
      ppt_depose: { Args: { p_id: string }; Returns: boolean }
      ppt_importer_portefeuille: {
        Args: { p_lignes: Json; p_org: string }
        Returns: Json
      }
      ppt_enregistrer_revue: {
        Args: {
          p_corrections?: Json
          p_json_corrige: Json
          p_rapport_id: string
        }
        Returns: undefined
      }
      ppt_importer_analyse: {
        Args: { p_json: Json; p_mode?: string; p_rapport_id: string }
        Returns: undefined
      }
      ppt_is_directeur_org: { Args: { p_org: string }; Returns: boolean }
      ppt_is_gestionnaire_of: { Args: { p_id: string }; Returns: boolean }
      ppt_is_membre_org: { Args: { p_org: string }; Returns: boolean }
      ppt_journaliser: {
        Args: {
          p_copro: string
          p_detail?: Json
          p_rapport: string
          p_type: string
        }
        Returns: undefined
      }
      ppt_membres_enseigne: {
        Args: { p_org: string }
        Returns: {
          email: string
          nom: string
          org_role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }[]
      }
      ppt_org_de: { Args: { p_id: string }; Returns: string }
      ppt_ouvre: { Args: { p_id: string }; Returns: boolean }
      ppt_ajouter_poste: {
        Args: { p_annee?: number | null; p_commentaire?: string | null; p_copro_id: string; p_libelle: string; p_montant?: number | null; p_priorite: string }
        Returns: string
      }
      ppt_corriger_rapport: {
        Args: {
          p_copro_id: string
          p_name?: string | null
          p_rapport_id: string
          p_storage_path?: string | null
          p_type?: string | null
        }
        Returns: undefined
      }
      ppt_deposants: {
        Args: { p_copro: string }
        Returns: { rapport_id: string; user_id: string | null; nom: string | null; email: string | null }[]
      }
      ppt_supprimer_rapport: {
        Args: { p_motif?: string; p_rapport_id: string }
        Returns: string
      }
      ppt_decaler_postes: {
        Args: { p_decalages: Json }
        Returns: number
      }
      ppt_retirer_poste: {
        // retouche manuelle (0087) : motif obligatoire
        Args: { p_motif: string; p_poste_id: string }
        Returns: undefined
      }
      ppt_retablir_poste: {
        Args: { p_poste_id: string }
        Returns: undefined
      }
      ppt_saisir_montant_poste: {
        Args: { p_commentaire?: string | null; p_montant: number | null; p_poste_id: string }
        Returns: undefined
      }
      ppt_rejeter_rapport: {
        Args: { p_motif: string; p_rapport_id: string }
        Returns: undefined
      }
      ppt_valider_rapport: {
        Args: { p_levees?: Json; p_rapport_id: string }
        Returns: undefined
      }
      ppt_devalider_rapport: {
        Args: { p_motif?: string | null; p_rapport_id: string }
        Returns: undefined
      }
      rattacher_lot: {
        // retouche manuelle à préserver : p_cible_id a un défaut SQL (null)
        // que le générateur ne voit pas
        Args: { p_cible_id: string | null; p_lot_id: string }
        Returns: undefined
      }
      seed_syndic_taches: {
        Args: { p_copro_ids: string[] }
        Returns: undefined
      }
      sync_rattachement_gestionnaire: {
        Args: { p_copro_id?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "amo" | "syndic" | "moe" | "copro" | "presta"
      bulletin_statut:
        | "brouillon"
        | "en_signature"
        | "complet"
        | "expire"
        | "annule"
      canal_message: "prestataires" | "syndic" | "coproprietaires"
      member_role: "amo_referent" | "syndic" | "moe" | "coproprietaire"
      org_role: "directeur" | "gestionnaire" | "administratif" | "comptable"
      phase_copro: "diagnostic" | "etudes" | "travaux"
      signataire_role: "principal" | "cosignataire"
      signataire_statut: "en_attente" | "identite_deposee" | "signe" | "expire"
      statut_piece: "a_verifier" | "valide" | "refuse"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      bulletin_statut: [
        "brouillon",
        "en_signature",
        "complet",
        "expire",
        "annule",
      ],
      canal_message: ["prestataires", "syndic", "coproprietaires"],
      member_role: ["amo_referent", "syndic", "moe", "coproprietaire"],
      org_role: ["directeur", "gestionnaire", "administratif", "comptable"],
      phase_copro: ["diagnostic", "etudes", "travaux"],
      signataire_role: ["principal", "cosignataire"],
      signataire_statut: ["en_attente", "identite_deposee", "signe", "expire"],
      statut_piece: ["a_verifier", "valide", "refuse"],
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
