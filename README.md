# BumiAtlas GIS

Next.js GIS workspace for Indonesian land administration workflows.

## Development

- Node.js 20+
- `npm install`
- `npm run dev`

## Vercel environment variables

- `ATR_WMS_URL` (optional; defaults to `https://geosrv-app.atrbpn.go.id/geoserver/ows`)

The WMS proxy only allows the explicitly configured layer names in `app/api/wms/route.js`. WMS is a rendered map service; it does not provide parcel vector downloads. Verify layer access, service terms, and production behavior before operational use.

## Current scope

- Next.js App Router
- Leaflet interactive map and drawing toolbar
- ATR/BPN WMS overlays through a server route
- GeoJSON import/export
- Location search and dashboard summary cards

BumiAtlas MCP integration has been removed. Parcel search is not provided by this application; the map uses the configured ATR/BPN WMS layers and user-created/imported GeoJSON data.
