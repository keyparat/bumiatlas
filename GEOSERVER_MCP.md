# BumiAtlas GeoServer MCP (ATR/BPN)

Read-only MCP gateway for ATR/BPN GeoServer layer umum:Persil. Supports WFS feature queries, WMS map tiles, direct access, and a configurable BHUMI /api/proksi adapter. It does not bypass ATR/BPN authentication or network controls and does not write to the source GeoServer.

## Endpoints
- MCP Streamable HTTP: https://bumiatlas.com/mcp/geoserver
- REST health: https://bumiatlas.com/api/geoserver?action=health
- WMS map proxy: https://bumiatlas.com/api/geoserver-wms
- Layers: /api/geoserver?action=layers
- Layer schema: /api/geoserver?action=describe
- Search by NIB: /api/geoserver?action=parcel&nib=VALUE
- Search field/value: /api/geoserver?action=search&field=NIB&q=VALUE
- Features in BBOX: /api/geoserver?action=features&bbox=minLon,minLat,maxLon,maxLat
- Export: /api/geoserver?action=export&format=geojson or kml

## Vercel environment variables

| Variable | Default / purpose |
|---|---|
| GEOSERVER_WFS_URL | https://geosvc.atrbpn.go.id/geoserver/wfs |
| GEOSERVER_WMS_URL | https://geosvc.atrbpn.go.id/geoserver/wms |
| GEOSERVER_LAYER | umum:Persil |
| GEOSERVER_SEARCH_FIELDS | NIB,NOMOR,KECAMATAN,KELURAHAN |
| GEOSERVER_TIMEOUT_MS | 18000 |
| BHUMI_PROXY_URL | https://bhumi.atrbpn.go.id/api/proksi |
| BHUMI_PROXY_MODE | raw-url (or json-url / form-url) |
| BHUMI_PROXY_BODY_FIELD | url for JSON/form modes |
| BHUMI_PROXY_BEARER_TOKEN | Optional authorized bearer token |
| BHUMI_PROXY_COOKIE | Optional authorized BHUMI session cookie |
| BHUMI_PROXY_AUTH_HEADER / BHUMI_PROXY_AUTH_VALUE | Optional provider-specific auth header |

Set secrets only in Vercel Project Settings > Environment Variables. Never put session cookies or tokens in browser JavaScript or commit them to Git.

## Important proxy note

The BHUMI proxy previously returned HTTP 401 without an authenticated session. The adapter supports configurable request envelopes, but its body format and required auth must match the authorized BHUMI API contract. The default raw-url mode sends the target WFS/WMS URL as text/plain, matching the content type seen in the earlier browser request. A 401/403 is surfaced as an authentication error, never bypassed.

Direct access to geosvc.atrbpn.go.id may require the ATR/BPN internal network/VPN. A Vercel function cannot join a user's local VPN automatically. Direct mode therefore works only if the endpoint is reachable from Vercel or through a separately deployed, secured network gateway.

## MCP tools
- geoserver_status
- geoserver_list_layers
- geoserver_describe_layer
- geoserver_search_parcels
- geoserver_get_parcel_by_nib
- geoserver_get_features
- geoserver_calculate_area
- geoserver_export

All tools are read-only. Query limits and field allowlists are enforced server-side.
