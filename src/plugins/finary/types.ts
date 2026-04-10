export interface FinaryResponse<T> {
  result: T;
}

export interface ClerkSignInResponse {
  response: {
    status: string;
    id: string;
  };
  client: {
    sessions?: Array<{
      id: string;
      last_active_token?: { jwt: string } | null;
    }>;
  };
}

export interface ClerkTokenResponse {
  jwt: string;
}

export interface Organization {
  id: string | number;
  organization_type?: string | null;
  name?: string | null;
}

export interface HoldingsAccount {
  id: string | number;
  name: string;
  manual_type?: string | null;
  balance?: number | null;
  display_balance?: number | null;
  currency?: Currency | null;
  bank_account_type?: BankAccountType | null;
  upnl?: number | null;
  upnl_percent?: number | null;
  display_upnl?: number | null;
  display_upnl_percent?: number | null;
  current_upnl?: number | null;
  current_upnl_percent?: number | null;
  display_evolution?: number | null;
  display_period_evolution?: number | null;
  securities?: SecurityHolding[] | null;
  cryptos?: unknown[] | null;
  fonds_euro?: unknown[] | null;
  ownership_repartition?: OwnershipEntry[] | null;
}

export interface OwnershipEntry {
  share?: number | null;
  membership?: OwnershipMembership | null;
}

export interface OwnershipMembership {
  member_type?: string | null;
  member?: OwnershipMember | null;
}

export interface OwnershipMember {
  fullname?: string | null;
  firstname?: string | null;
}

export interface Currency {
  code: string;
}

export interface BankAccountType {
  name?: string | null;
  subtype?: string | null;
}

export interface SecurityHolding {
  id?: string | number | null;
  quantity?: number | null;
  buying_price?: number | null;
  display_buying_price?: number | null;
  buying_value?: number | null;
  display_buying_value?: number | null;
  current_value?: number | null;
  display_current_value?: number | null;
  unrealized_pnl?: number | null;
  display_unrealized_pnl?: number | null;
  unrealized_pnl_percent?: number | null;
  security?: SecurityInfo | null;
}

export interface SecurityInfo {
  name?: string | null;
  symbol?: string | null;
  isin?: string | null;
  current_price?: number | null;
  display_current_price?: number | null;
}

export interface InstitutionConnectionsResponse {
  banks?: BankConnection[] | null;
}

export interface BankConnection {
  id?: string | number | null;
  name?: string | null;
  connection_state?: string | null;
  last_sync_at?: string | null;
  institution?: Institution | null;
  holdings_accounts?: ConnectionAccount[] | null;
}

export interface Institution {
  name?: string | null;
  slug?: string | null;
}

export interface ConnectionAccount {
  id?: string | number | null;
  name?: string | null;
  balance?: number | null;
}
