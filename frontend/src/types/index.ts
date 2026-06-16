export interface Account {
  id: string
  brand_name: string
  meta_page_id: string
  meta_page_name: string | null
  plan_type: string
  onboarding_step: number
  is_active: boolean
  created_at: string
}

export interface AutomationConfig {
  keyword: string
  auto_reply_message: string
  account_id: string
}

export interface MetaAuthUrl {
  auth_url: string
}

export interface MetaCallbackResponse {
  success: boolean
  account_id: string
  brand_name: string
  page_name: string | null
  onboarding_step: number
}

export interface OnboardingStatus {
  account_id: string
  brand_name: string
  page_name: string | null
  plan_type: string
  onboarding_step: number
  instagram_connected: boolean
  ad_account_selected: boolean
}

export interface AdAccount {
  id: string
  name: string
  account_status: number
  currency: string
}
