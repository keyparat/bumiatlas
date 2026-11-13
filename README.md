# BumiAtlas GIS

Next.js GIS workspace for Indonesian land administration workflows.

## Development

- Node.js 20+
- `npm install`
- `npm run dev`

## Vercel environment variables

- `ATR_WMS_URL` (optional; defaults to `https://geosrv-app.atrbpn.go.id/geoserver/ows`)

The WMS proxy only allows the explicitly configured layer names in `app/api/wms/route.js`. WMS is a rendered map service; it does not provide parcel vector downloads. Verify layer access, service terms, and production behavior before operational use.

## Current migration scope

- Next.js App Router foundation
- Leaflet interactive map and drawing toolbar
- ATR/BPN WMS overlays through a server route
- GeoJSON import/export
- Initial dashboard summary cards

BumiAtlas MCP OAuth and parcel lookup are not yet migrated. They should be implemented as server-side routes with an approved OAuth flow rather than exposing MCP credentials or tokens in browser code.
