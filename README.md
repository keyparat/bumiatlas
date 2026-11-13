# BumiAtlas GIS

Next.js GIS workspace for Indonesian land administration workflows.

## Development

- Node.js 20+
- `npm install`
- `npm run dev`

## Vercel environment variables

- `ATR_WMS_URL` (optional; defaults to `https://geosrv-app.atrbpn.go.id/geoserver/ows`)
- `BUMIATLAS_MCP_ACCESS_TOKEN` (required for parcel search; keep secret)
- `BUMIATLAS_MCP_URL` (optional; defaults to `https://bumiatlas.com/mcp/parcels`)

The WMS proxy only allows the explicitly configured layer names in `app/api/wms/route.js`. WMS is a rendered map service; it does not provide parcel vector downloads. Verify layer access, service terms, and production behavior before operational use.

## Current migration scope

- Next.js App Router foundation
- Leaflet interactive map and drawing toolbar
- ATR/BPN WMS overlays through a server route
- GeoJSON import/export
- Initial dashboard summary cards

Parcel lookup now runs through a server-side MCP route. Configure the access token as a Vercel secret environment variable. The legacy browser OAuth flow is not used by the Next.js app; if the MCP provider issues short-lived OAuth tokens rather than a static service token, a provider-approved server-side OAuth callback and refresh flow must be added before production use.
