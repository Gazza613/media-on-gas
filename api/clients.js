import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
export default async function handler(req, res) {
  if (!(await rateLimit(req, res))) return;
  if (!(await checkAuth(req, res))) return;
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