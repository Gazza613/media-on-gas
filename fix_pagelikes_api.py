with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Fix: separate page_engagement from actual page likes
# page_engagement is total engagement, not page likes
# For actual page likes, use "like" action only (not page_engagement)
# Also add "follow" for Instagram follower tracking
c = c.replace(
    """            var pageLikes = 0;
            if (c.actions) {
              for (var a = 0; a < c.actions.length; a++) {
                var act = c.actions[a];
                if (act.action_type === "lead" || act.action_type === "onsite_web_lead" || act.action_type === "offsite_conversion.fb_pixel_lead") {
                  leads = Math.max(leads, parseInt(act.value));
                }
                if (act.action_type === "app_custom_event.fb_mobile_activate_app" || act.action_type === "app_install") {
                  appInstalls += parseInt(act.value);
                }
                if (act.action_type === "landing_page_view" || act.action_type === "omni_landing_page_view") {
                  landingPageViews = Math.max(landingPageViews, parseInt(act.value));
                }
                if (act.action_type === "like" || act.action_type === "page_engagement") {
                  pageLikes = Math.max(pageLikes, parseInt(act.value));
                }
              }
            }""",
    """            var pageLikes = 0;
            var pageFollows = 0;
            if (c.actions) {
              for (var a = 0; a < c.actions.length; a++) {
                var act = c.actions[a];
                if (act.action_type === "lead" || act.action_type === "onsite_web_lead" || act.action_type === "offsite_conversion.fb_pixel_lead" || act.action_type === "onsite_conversion.lead_grouped" || act.action_type === "offsite_complete_registration_add_meta_leads") {
                  leads = Math.max(leads, parseInt(act.value));
                }
                if (act.action_type === "app_custom_event.fb_mobile_activate_app" || act.action_type === "app_install") {
                  appInstalls += parseInt(act.value);
                }
                if (act.action_type === "landing_page_view" || act.action_type === "omni_landing_page_view") {
                  landingPageViews = Math.max(landingPageViews, parseInt(act.value));
                }
                if (act.action_type === "like") {
                  pageLikes = parseInt(act.value);
                }
                if (act.action_type === "page_engagement") {
                  pageFollows = parseInt(act.value);
                }
              }
            }""")

# Add pageFollows to the campaign push
c = c.replace(
    """pageLikes: pageLikes.toString(),
              costPerLead:""",
    """pageLikes: pageLikes.toString(),
              pageFollows: pageFollows.toString(),
              costPerLead:""")

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - fixed pageLikes to use only 'like' action type")
