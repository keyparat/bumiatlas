# BumiAtlas GIS

Next.js GIS workspace for Indonesian land administration workflows.

## Development

- Node.js 20+
- `npm install`
- `npm run dev`

## ATR/BPN WMS on Windows

The hosted Vercel server cannot complete the ATR/BPN WMSProxy authentication redirect. For authenticated WMS layers, use the Windows Local Connector:

1. Open `local-connector`.
2. Run `start.bat`.
3. Complete ATR/BPN login in the dedicated Chromium window opened by the connector.
4. Return to the connector terminal and press Enter to verify WMS GetCapabilities.
5. Keep the connector running and open BumiAtlas. Enable an ATR/BPN layer.

The connector binds only to `127.0.0.1:8765`, keeps its dedicated browser profile locally, and does not send passwords or cookies to Vercel or GitHub. See [local-connector/README.md](local-connector/README.md) for setup and troubleshooting.

## Current scope

- Next.js App Router
- Leaflet interactive map and drawing toolbar
- ATR/BPN WMS overlays through the Windows Local Connector
- GeoJSON import/export
- Location search and dashboard summary cards

BumiAtlas MCP integration has been removed. Parcel search is not provided by this application; the map uses configured ATR/BPN WMS layers and user-created/imported GeoJSON data.

## Notes

- WMS layers are rendered map images, not parcel vector downloads.
- The connector is an experimental local integration and still requires a real authenticated session and tile-display test on the user's Windows machine.
- The server-side `/api/wms` route remains in the project for reference but is no longer the active WMS path for the map.
