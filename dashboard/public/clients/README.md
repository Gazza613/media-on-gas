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
- PNG with transparency or a square-ish logo works best. It renders
  on a white rounded chip so dark/navy marks read fine.
- Leave the profile field blank for GAS-only branding.
