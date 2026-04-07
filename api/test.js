export default async function handler(req, res) {
  res.status(200).json({
    hasMetaToken: !!process.env.META_ACCESS_TOKEN,
    hasMetaAccount: !!process.env.META_AD_ACCOUNT_ID,
    hasTiktokToken: !!process.env.TIKTOK_ACCESS_TOKEN,
    hasTiktokAdv: !!process.env.TIKTOK_ADVERTISER_ID,
    hasClaudeKey: !!process.env.ANTHROPIC_API_KEY
  });
}