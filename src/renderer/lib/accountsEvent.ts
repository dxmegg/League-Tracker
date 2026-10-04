export const ACTIVE_ACCOUNT_KEY = "active_account";
export const ACTIVE_ACCOUNT_EVENT = "active-account-changed";
export const ALL_ACCOUNTS_SENTINEL = "";

export function broadcastActiveAccount(puuid: string): void {
  window.dispatchEvent(new CustomEvent(ACTIVE_ACCOUNT_EVENT, { detail: puuid }));
}
