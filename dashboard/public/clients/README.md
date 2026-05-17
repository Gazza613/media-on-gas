# Client brand logos

Drop a client's logo here, then set it on their KPI profile
(Settings → KPI Profiles → "Client logo URL").

- Files in `dashboard/public/` are served at the site root, so
  `dashboard/public/clients/psycho-bunny.png` is reachable at
  `https://<site>/clients/psycho-bunny.png`.
- Set the profile's **Client logo URL** to the root path, e.g.
  `/clients/psycho-bunny.png` (works in both the dashboard header and
  the client email — email needs an absolute URL, which the server
  builds from this path automatically).
- Use a **transparent PNG**. It sits directly on the dark theme
  background (no chip), so the mark must read on dark — supply the
  white/light or full-colour version of the logo, not a dark-on-
  transparent one.
- Leave the profile field blank for GAS-only branding.
