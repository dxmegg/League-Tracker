// Cloudflare Worker that holds the Riot API key server-side.
// The app never sees the key. Changing this URL requires a matching Worker deployment.
export const PROXY_BASE_URL = "https://rift-records-proxy.dxmegg.workers.dev";
