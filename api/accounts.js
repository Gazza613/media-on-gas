export default async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN;
  const url = "https://graph.facebook.com/v25.0/me/adaccounts?fields=name,account_id,account_status&limit=100&access_token=" + token;
  try {
    const response = await fetch(url);
    const data = await response.json();
    const active = data.data
      .filter(a => a.account_status === 1)
      .filter(a => !a.name.includes("Read-Only"))
      .filter(a => a.name !== "Gary Berman")
      .filter(a => a.name !== "Dan Griffiths")
      .filter(a => a.name !== "Gila Rappaport")
      .map(a => ({
        name: a.name,
        accountId: a.id,
        slug: a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      }));
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({ accounts: active });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}