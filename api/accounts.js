import { checkAuth } from "./_auth.js";
export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  const token = process.env.META_ACCESS_TOKEN;
  const url = "https://graph.facebook.com/v25.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=" + token;

  const excluded = [
    "Gila Rappaport",
    "Gary Berman",
    "Dan Griffiths",
    "18FORTYSIX",
    "IKI BREATHE",
    "GAS_Unicam",
    "The Anxiety Project",
    "10157625843740107"
  ];

  const nameMap = {
    "GAS Marketing Automation": "GAS Marketing (Willowbrook + Internal)",
    "GAS_MoMo_ZA_V2": "MTN MoMo",
    "GAS_MTN_Khava": "MTN Khava",
    "GAS_ConcordCollege": "Concord College",
    "GAS_EdenCollege": "Eden College",
    "GAS | Psycho Bunny (test)": "Psycho Bunny ZA",
    "GAS | PsychoBunnyZA": "Psycho Bunny ZA"
  };

  try {
    const response = await fetch(url);
    const data = await response.json();
    const active = data.data
      .filter(a => a.account_status === 1)
      .filter(a => !a.name.includes("Read-Only"))
      .filter(a => !excluded.includes(a.name))
      .map(a => ({
        name: nameMap[a.name] || a.name,
        originalName: a.name,
        accountId: a.id,
        slug: (nameMap[a.name] || a.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      }));

    res.status(200).json({ accounts: active });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
}