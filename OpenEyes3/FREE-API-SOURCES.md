# OpenEyes free API sources

OpenEyes uses public/free sources where a stable, documented source exists. Providers that require an account/token are explicitly marked; the app does not fake results when a provider is unavailable.

| Tool | Source | Access |
|---|---|---|
| Synthetic Test | local | no network |
| Discord Lookup | Discord REST API | free, bot token required |
| Snapchat Lookup | Snapchat/Snap Kit public-profile APIs | credentials/eligibility required |
| TikTok Lookup | TikTok Display/Research API | OAuth/approval required |
| Telegram Lookup | Telegram Bot API | free, bot token required |
| Username Sweep | GitHub, GitLab, Stack Exchange, Reddit public APIs | free/fair use |
| IP Lookup | ipwho.is + Cloudflare DNS | free public endpoints |
| WiFi Lookup | WiGLE | free tier, key required |
| ASN Lookup | RIPEstat | free public API |
| Domain Recon | Cloudflare DoH + RDAP.net | free public APIs |
| Subdomain Enum | crt.sh | free public JSON API |
| Port Sweep | Shodan InternetDB | free passive lookup; no active probing |
| Wallet Trace | mempool.space | free Bitcoin REST API |
| BIN Lookup | CardBinCheck | free keyless fair-use API |
| IBAN Check | ISO 13616 local validation | no network required |
| Email Intel | Cloudflare DoH | free public DNS API |
| Breach Search | XposedOrNot | free keyless email breach API |
| Mail Posture | Cloudflare DoH | free public DNS API |
| Wayback | Internet Archive CDX | free public API |
| Web Fingerprint | direct HTTPS inspection | no paid provider required |
| Paste Search | public source adapters | source-dependent |
| Phone Lookup | USACallerLookup | free keyless US API; local fallback elsewhere |
| Metadata | local parser | no network required |
| Hash Toolkit | local analysis | no network required |

The social APIs are intentionally not replaced with unofficial scraping services. Where the official platform requires a token/OAuth flow, OpenEyes reports that requirement instead of pretending the endpoint is keyless.
