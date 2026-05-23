import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
export default async function handler(req, res) {
  if (!(await rateLimit(req, res))) return;
  if (!(await checkAuth(req, res))) return;
  // Admin-only. The clients[] payload includes internal Meta + TikTok
  // account IDs that should never reach a client share-link viewer
  // (those IDs are the unit of access in every backend URL and validation
  // list). Mirrors the role gate on /api/pages, /api/accounts, etc.
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role !== "admin" && principal.role !== "superadmin") {
    res.status(403).json({ error: "Admin-only endpoint" });
    return;
  }
  const clients = [
    {
      slug: "mtn-momo",
      name: "MTN MoMo",
      brandColour: "#004F71",
      brandAccent: "#FFCB05",
      platforms: ["Facebook", "Instagram", "TikTok"],
      metaAccountId: "act_542990539806888",
      tiktokAdvertiserId: "7446793748044202000"
    }
  ];

  res.status(200).json({ clients });
}