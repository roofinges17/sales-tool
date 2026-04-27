export interface Profile {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: "owner" | "admin" | "manager" | "seller";
  department_id?: string | null;
  status: string;
  preferred_language: "en" | "es";
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  name: string;
  type?: "RESIDENTIAL" | "COMMERCIAL" | "MULTIFAMILY" | null;
  status?: "ACTIVE" | "INACTIVE" | "PROSPECT" | null;
  email?: string | null;
  phone?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  industry?: string | null;
  website?: string | null;
  notes?: string | null;
  lead_source?: string | null;
  assigned_to_id?: string | null;
  created_by_id?: string | null;
  created_at: string;
  updated_at: string;
  // joins
  assigned_to?: Profile | null;
}

export interface Contact {
  id: string;
  account_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  is_primary?: boolean;
  role?: "HOMEOWNER" | "SPOUSE" | "TENANT" | "PROPERTY_MANAGER" | "REALTOR" | "OTHER" | null;
  notes?: string | null;
  ghl_contact_id?: string | null;
  ghl_location_id?: string | null;
  ghl_last_sync_at?: string | null;
  preferred_language: "en" | "es";
  // Lead qualification
  owner_status?: string | null;
  reroof_timeline?: string | null;
  south_florida_property?: boolean | null;
  // Property / roof spec
  folio_number?: string | null;
  full_address?: string | null;
  roof_color?: string | null;
  roof_type_current?: string[] | null;
  roof_type_sold?: string[] | null;
  roof_size?: string | null;
  roof_size_sf?: string | null;
  hoa?: string | null;
  // Financial / contract
  contract_price?: number | null;
  total_price?: number | null;
  estimate_number?: string | null;
  estimate_date?: string | null;
  contract_url?: string | null;
  file_upload_url?: string | null;
  payment_1?: number | null;
  payment_2?: number | null;
  payment_3?: number | null;
  payment_4?: number | null;
  // Service / intake
  reason_for_call?: string | null;
  your_message?: string | null;
  conversation_summary?: string | null;
  services_requested?: string[] | null;
  free_gutters_insulation?: string | null;
  created_at: string;
  updated_at: string;
}

export type OpportunitySource =
  | "facebook" | "instagram" | "tiktok" | "google_ads"
  | "free_pdf_form" | "chat_widget" | "general_roofing_leads" | "manual";

export interface Pipeline {
  id: string;
  ghl_pipeline_id: string;
  location_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Stage {
  id: string;
  pipeline_id: string;
  ghl_stage_id: string;
  name: string;
  sort_order: number;
  color: string;
  is_terminal: boolean;
  created_at: string;
}

export interface Opportunity {
  id: string;
  contact_id?: string | null;
  pipeline_id: string;
  stage_id: string;
  value?: number | null;
  assigned_to_id?: string | null;
  source?: OpportunitySource | null;
  ghl_opportunity_id?: string | null;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
  // joins
  contact?: Pick<Contact, "id" | "first_name" | "last_name" | "phone" | "email" | "preferred_language"> | null;
  stage?: Pick<Stage, "id" | "name" | "color" | "sort_order" | "is_terminal"> | null;
  assigned_to?: Pick<Profile, "id" | "name"> | null;
}

export interface Property {
  id: string;
  account_id: string;
  name?: string | null;
  street: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  is_primary: boolean;
  property_type?: "SINGLE_FAMILY" | "MULTI_FAMILY" | "COMMERCIAL" | "INDUSTRIAL" | "OTHER" | null;
  square_footage?: number | null;
  year_built?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  name: string;
  version: number;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  subtotal?: number | null;
  total?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  monthly_payment?: number | null;
  lead_source?: string | null;
  account_id?: string | null;
  property_id?: string | null;
  created_by_id?: string | null;
  assigned_to_id?: string | null;
  department_id?: string | null;
  created_at: string;
  updated_at: string;
  // joins
  account?: Pick<Account, "id" | "name"> | null;
  assigned_to?: Pick<Profile, "id" | "name"> | null;
}

export interface Sale {
  id: string;
  name: string;
  contract_number?: string | null;
  status: "PENDING" | "ACTIVE" | "CANCELLED" | "COMPLETED";
  contract_value: number;
  account_id: string;
  primary_seller_id?: string | null;
  department_id?: string | null;
  created_at: string;
  updated_at: string;
  // joins
  account?: Pick<Account, "id" | "name"> | null;
}

export interface LeadSource {
  id: string;
  name: string;
  value: string;
  seller_share_percent: number;
  is_active: boolean;
}

export interface CompanySettings {
  id: string;
  company_name: string;
  contract_prefix: string;
  estimate_prefix: string;
  default_tax_rate: number;
  quote_validity_days: number;
}
