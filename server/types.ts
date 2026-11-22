export interface FlagEntry {
  wheel: string;
  category: string;
  matched_indicators?: string[];
  citation?: string;
}

export interface TacticAnalysisEntry {
  wheel: string;
  category: string;
  citation: string;
  severity_weight: number;
  matched_indicators: string[];
}

export interface TacticCatalogEntry {
  wheel: string;
  category: string;
  citation: string;
  severity_weight: number;
  keyword_count: number;
  pattern_count: number;
  description: string;
}

export interface AnalysisResult {
  categories: string[];
  economic_abuse_flags: string[];
  child_abuse_flags: string[];
  darvo_flags: string[];
  legal_abuse_flags: string[];
  tech_abuse_flags: string[];
  mesosystem_abuse_flags: string[];
  institutional_betrayal_flags: string[];
  proactive_aggression_flags: string[];
  lethality_risk_flags: string[];
  institutional_abuse: boolean;
  severity: number;
  all_flags: FlagEntry[];
  tactics_analyzed: TacticAnalysisEntry[];
  matched_indicators: string[];
  frameworks_triggered: string[];
  total_tactics_evaluated: number;
}

export type DocumentCategory =
  | 'personal_communication'
  | 'email'
  | 'court_document'
  | 'medical_document'
  | 'spreadsheet_log'
  | 'screenshot_ocr'
  | 'generic_document';

export interface PlacementCitation {
  evidence_id?: number;
  filename: string;
  file_hash_short?: string;
  platform: string;
  document_category: DocumentCategory;
  page?: number;
  row?: number;
  line_start?: number;
  line_end?: number;
  paragraph?: number;
  section?: string;
  xml_path?: string;
  json_index?: number;
  ocr_confidence?: number;
  citation_label: string;
}

export type AttributionStatus =
  | 'verified_strict'
  | 'inferred_needs_review'
  | 'ambiguous_warning';

export interface AttributionAudit {
  status: AttributionStatus;
  sender: string;
  receiver: string;
  sender_token?: string;
  receiver_token?: string;
  token_collision: boolean;
  body_header_conflict: boolean;
  method: string;
  notes: string;
}

export interface PiiRedactionCounts {
  emails: number;
  phones: number;
  ssn: number;
  financial: number;
  medical_ids: number;
  addresses: number;
  dob: number;
  locations?: number;
  network_and_devices?: number;
}

export interface PartyTokenMapping {
  role: 'sender' | 'receiver' | 'third_party';
  original_hint: string;
  token: string;
}

export interface RawMessage {
  timestamp: string | null;
  sender: string;
  receiver?: string;
  content: string;
  sender_id?: string;
  receiver_id?: string;
  conversation_id?: string;
  message_id?: string;
  subject?: string;
  source_platform?: string;
  document_category?: DocumentCategory;
  placement?: PlacementCitation;
  attribution_method?: string;
  ocr_confidence?: number;
}

export interface ForensicEvidenceRecord {
  id: number;
  filename: string;
  file_size: number;
  file_hash: string;
  upload_date: string;
  detected_platform: string;
  document_category: DocumentCategory;
  total_messages_parsed: number;
  flagged_events_count: number;
  pii_sanitized: boolean;
  pii_redactions: PiiRedactionCounts;
  ocr_used: boolean;
  ocr_confidence?: number;
  attribution_summary: {
    verified_strict: number;
    inferred_needs_review: number;
    ambiguous_warning: number;
  };
  party_tokens: PartyTokenMapping[];
  search_snippet?: string;
  search_rank?: number;
}

export interface AnalyzedEventRecord {
  id: number;
  evidence_id: number;
  evidence_filename: string;
  timestamp: string | null;
  sender: string;
  receiver: string;
  content: string;
  severity_score: number;
  sender_id: string;
  receiver_id: string;
  conversation_id: string;
  message_id: string;
  subject: string;
  source_platform: string;
  document_category: DocumentCategory;
  is_verified: boolean;
  user_context_notes: string;
  all_flags: FlagEntry[];
  tactics_analyzed: TacticAnalysisEntry[];
  matched_indicators: string[];
  placement_citation: PlacementCitation;
  attribution_audit: AttributionAudit;
  raw_content_hash: string;
  pii_redacted_count: number;
  search_snippet?: string;
  search_rank?: number;
}

export interface ChronologySection {
  section_id: string;
  title: string;
  subtitle: string;
  date_key: string | null;
  highest_severity: number;
  event_count: number;
  source_files: string[];
  events: AnalyzedEventRecord[];
}
