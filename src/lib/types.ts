export type AppRole =
  | "platform_owner"
  | "super_admin"
  | "management"
  | "dept_manager"
  | "staff"
  | "viewer";

export type ConfidentialityLevel = "public" | "internal" | "confidential" | "highly_confidential";

export type DocumentStatus = "draft" | "active" | "under_review" | "approved" | "expired" | "archived";

export type ContractStatus =
  | "draft"
  | "under_review"
  | "pending_approval"
  | "pending_signature"
  | "active"
  | "near_expiry"
  | "renewal_in_progress"
  | "expired"
  | "terminated"
  | "archived";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  position: string | null;
  department_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Department {
  id: string;
  code: string;
  name_th: string;
  name_en: string | null;
  is_active: boolean;
}

export interface DocumentCategory {
  id: string;
  code: string;
  name_th: string;
  name_en: string | null;
  prefix: string | null;
  is_active: boolean;
}

export interface Partner {
  id: string;
  code: string;
  name: string;
  type: "customer" | "supplier" | "both";
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  status: "active" | "inactive" | "blocked";
}

export interface Document {
  id: string;
  document_no: string;
  title: string;
  description: string | null;
  category_id: string;
  department_id: string;
  partner_id: string | null;
  project_id: string | null;
  owner_id: string;
  issue_date: string | null;
  effective_date: string | null;
  end_date: string | null;
  value_amount: number | null;
  currency: string;
  status: DocumentStatus;
  confidentiality: ConfidentialityLevel;
  tags: string[] | null;
  keywords: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Contract {
  id: string;
  contract_no: string;
  title: string;
  contract_type: string | null;
  partner_id: string;
  department_id: string;
  owner_id: string;
  sign_date: string | null;
  start_date: string;
  end_date: string;
  notice_days: number | null;
  auto_renewal: boolean;
  value_amount: number | null;
  currency: string;
  status: ContractStatus;
  notes: string | null;
  created_at: string;
}
