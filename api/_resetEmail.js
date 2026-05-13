// Shared password-reset email rendering. Used by both /api/forgot-password
// (self-serve) and /api/admin-reset (superadmin-triggered). Mirrors the
// invite email template but with the copy and subject changed for resets.

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildResetHtml(opts) {
  var greetingName = escapeHtml(opts.name || "there");
  var resetUrl = opts.resetUrl;
  var triggeredByLabel = opts.triggeredBy === "self"
    ? "You requested a password reset"
    : "A password reset was triggered for you by " + escapeHtml(opts.triggeredBy || "the admin team");
  var logoUrl = opts.origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";
  var expiresDisplay = new Date(opts.expiresAt).toLocaleString("en-ZA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset your MEDIA ON GAS password</title>
</head>
<body style="margin:0;padding:0;background:#070E16;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#070E16;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:linear-gradient(170deg,#0F1820 0%,#13202C 100%);border-radius:20px;overflow:hidden;border:1px solid rgba(168,85,247,0.18);">

      <tr><td style="padding:40px 40px 28px;text-align:center;">
        <div style="font-size:11px;color:#F96203;letter-spacing:6px;font-weight:800;margin-bottom:6px;text-transform:uppercase;">GAS Marketing Automation</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:4px;color:#FFFBF8;margin-bottom:0;">
          <span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span>
        </div>
        <div style="font-size:10px;color:#8B7FA3;letter-spacing:3px;margin-top:6px;text-transform:uppercase;font-weight:600;">Performance Metrics That Matter</div>
      </td></tr>

      <tr><td style="padding:0 40px;">
        <div style="height:1px;background:linear-gradient(90deg,transparent,#F96203,transparent);"></div>
      </td></tr>

      <tr><td style="padding:36px 40px 12px;">
        <div style="font-size:11px;color:#8B7FA3;letter-spacing:3px;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Password Reset</div>
        <div style="font-size:26px;font-weight:900;color:#FFFBF8;line-height:1.2;margin-bottom:14px;">Reset your password</div>
        <div style="font-size:15px;color:#FFFBF8;line-height:1.7;">
          Hi ${greetingName},
        </div>
        <div style="font-size:14px;color:rgba(255,251,248,0.82);line-height:1.75;margin-top:14px;">
          ${triggeredByLabel}. Click the button below to choose a new password.
        </div>
        <div style="font-size:14px;color:rgba(255,251,248,0.82);line-height:1.75;margin-top:14px;">
          This link expires on <strong style="color:#F96203;">${expiresDisplay}</strong> and can only be used once. If you did not request this reset, you can safely ignore this email, your password will not change.
        </div>
      </td></tr>

      <tr><td style="padding:28px 40px 8px;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="background:linear-gradient(135deg,#FF3D00,#FF6B00);border-radius:12px;">
            <a href="${resetUrl}" style="display:inline-block;padding:16px 42px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:3px;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Reset Password</a>
          </td></tr>
        </table>
        <div style="margin-top:14px;font-size:10px;color:#8B7FA3;letter-spacing:2px;text-transform:uppercase;font-weight:600;">One-time link, expires in 1 hour</div>
      </td></tr>

      <tr><td style="padding:20px 40px 0;">
        <div style="font-size:11px;color:rgba(255,251,248,0.55);line-height:1.6;text-align:center;">
          Trouble with the button? Copy this link into your browser:<br>
          <a href="${resetUrl}" style="color:#8B7FA3;word-break:break-all;">${resetUrl}</a>
        </div>
      </td></tr>

      <tr><td style="padding:28px 40px 8px;">
        <div style="height:1px;background:rgba(168,85,247,0.16);"></div>
      </td></tr>

      <tr><td style="padding:20px 40px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          <tr>
            <td valign="middle" style="width:56px;padding-right:14px;">
              <img src="${logoUrl}" alt="GAS Marketing" width="48" height="48" border="0" style="width:48px;height:48px;border-radius:50%;display:block;border:none;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"/>
            </td>
            <td valign="middle">
              <div style="font-size:12px;color:#FFFBF8;font-weight:800;letter-spacing:3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                <span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span>
              </div>
              <div style="font-size:10px;color:#8B7FA3;letter-spacing:2px;margin-top:3px;text-transform:uppercase;font-weight:600;">Performance Metrics That Matter</div>
              <div style="font-size:11px;color:#8B7FA3;margin-top:6px;">
                <a href="mailto:grow@gasmarketing.co.za" style="color:#8B7FA3;text-decoration:none;">grow@gasmarketing.co.za</a>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function buildResetText(opts) {
  var triggeredByLabel = opts.triggeredBy === "self"
    ? "You requested a password reset for your MEDIA ON GAS dashboard account."
    : "A password reset was triggered for your MEDIA ON GAS dashboard account by " + (opts.triggeredBy || "the admin team") + ".";
  var expiresDisplay = new Date(opts.expiresAt).toLocaleString("en-ZA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
  return "Hi " + (opts.name || "there") + ",\n\n" +
    triggeredByLabel + "\n\n" +
    "Reset your password (one-time link, expires in 1 hour):\n" + opts.resetUrl + "\n\n" +
    "This link expires on " + expiresDisplay + ".\n\n" +
    "If you did not request this reset, you can safely ignore this email. Your password will not change.\n\n" +
    "GAS Marketing Automation\n";
}

// Audit email to the superadmin every time a reset is requested. Even if
// the request was legitimate, knowing it happened is part of the security
// trail. For self-serve, the requestedBy is "self"; for admin-triggered,
// it's the superadmin's email.
export function buildAuditHtml(opts) {
  var who = escapeHtml(opts.targetEmail || "");
  var src = opts.source === "self"
    ? "Self-serve, from the login screen"
    : "Admin-triggered by " + escapeHtml(opts.requestedBy || "");
  var ts = new Date().toLocaleString("en-ZA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
  return "<p style=\"font-family:Arial,sans-serif;font-size:14px;color:#13202C;line-height:1.7\">" +
    "<strong>MEDIA ON GAS — Password reset requested</strong></p>" +
    "<p style=\"font-family:Arial,sans-serif;font-size:13px;color:#13202C;line-height:1.7\">" +
    "User: <strong>" + who + "</strong><br>" +
    "Source: " + src + "<br>" +
    "When: " + ts + "<br>" +
    "Token TTL: 1 hour, one-time use." +
    "</p>" +
    "<p style=\"font-family:Arial,sans-serif;font-size:12px;color:#444\">" +
    "If this looks suspicious (e.g. a user the team didn't add, a request you didn't expect), " +
    "open the dashboard Settings &rarr; Team panel and revoke the account immediately. " +
    "The reset token will be discarded as soon as the account is revoked." +
    "</p>";
}
