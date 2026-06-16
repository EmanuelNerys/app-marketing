export interface Account {
  id: string
  brand_name: string
  meta_page_id: string
  meta_page_name: string | null
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
