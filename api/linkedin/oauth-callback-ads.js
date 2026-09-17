// One-shot OAuth callback for the ADVERTISING API app (App 1:
// "MTN MOMO SEPT2026 START"). Registered on the LinkedIn Developer
// Portal as the redirect URL for App 1. See _oauthCallback.js for the
// shared exchange logic.
//
// Scopes requested: r_ads + r_ads_reporting (read-only paid campaign
// data, no writes). Adjust here if the LinkedIn approval grants
// different scopes.

import { handleOAuthCallback } from "./_oauthCallback.js";

export default async function handler(req, res) {
  await handleOAuthCallback(req, res, {
    appKey: "ads",
    redirectUri: "https://media.gasmarketing.co.za/api/linkedin/oauth-callback-ads",
    scope: "r_ads r_ads_reporting"
  });
}
