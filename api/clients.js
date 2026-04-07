export default async function handler(req, res) {
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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ clients });
}