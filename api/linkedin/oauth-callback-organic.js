// One-shot OAuth callback for the COMMUNITY MANAGEMENT API app (App 2:
// "MoMo Community Reporting" or whatever you named it — LinkedIn forces
// this to be a separate developer app from the Advertising app). See
// _oauthCallback.js for the shared exchange logic.
//
// Scopes requested: r_organization_social + r_organization_admin
// (read-only organic Company Page data, no writes/posts/comments).

import { handleOAuthCallback } from "./_oauthCallback.js";

export default async function handler(req, res) {
  await handleOAuthCallback(req, res, {
    appKey: "organic",
    redirectUri: "https://media.gasmarketing.co.za/api/linkedin/oauth-callback-organic",
    scope: "r_organization_social r_organization_admin"
  });
}
