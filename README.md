# ATR/BPN Land Parcel Lookup MCP (Indonesia)

Connect your AI assistant to [BumiAtlas](https://bumiatlas.com) for Indonesian land parcel research through the Model Context Protocol.

This listing is a focused entry point for:

- Land parcels (bidang tanah) from ATR/BPN's public land map (BHUMI)
- Certificate number (nomor hak) and NIB lookup, or every parcel at a coordinate
- Right type (Hak Milik, Hak Guna Bangunan, Hak Guna Usaha, Hak Pakai, Hak Pengelolaan, Wakaf), declared vs mapped area, year, side lengths and boundary
- Overlaps with other parcels, HGU, concessions and conservation areas
- BPN village codes and certificate number decoding

The MCP connection is provided by BumiAtlas. This repository does not run a separate server. For parcels, HGU, mining and zoning in one connection, use [BumiAtlas MCP](https://github.com/BumiAtlas/bumiatlas-mcp).

## Connect

```
https://bumiatlas.com/mcp/parcels
```

Add it as a custom connector in any MCP client and sign in with Google. Tools, examples and data notes: [bumiatlas.com/mcp-docs/parcels](https://bumiatlas.com/mcp-docs/parcels).

## Tools

| Tool | Description |
|---|---|
| `Parcel_search` | Find parcels by certificate number (14 digits, e.g. `22.01.05.03.1.00123`), NIB, village code + NIB as printed on certificates, or `latitude, longitude` with a radius |
| `Parcel_get` | Full record: right type, declared area vs mapped area and their difference, year, survey method, village, perimeter and sides, RDTR zones, land value zone (ZNT) class, flood hazard; boundary as GeoJSON |
| `Parcel_overlaps` | Other parcels, HGU, mining/logging concessions and conservation areas overlapping the parcel, with shared area and shares of each |
| `Parcel_image` | Satellite or street map image of a parcel or point, with every parcel in view outlined and labelled with its NIB, optionally with building footprints (Bali so far) |
| `Parcel_find_village` | Look up BPN villages (desa/kelurahan) by name or code prefix, or decode a 14-digit certificate number into land office, district and village |
| `Flood_get` | BNPB InaRISK flood hazard class at a point |

## Example prompts

- *"Look up certificate number 22.01.05.03.1.00123"*
- *"What parcels are at -6.4601, 107.0093? Show the right type and area"*
- *"Does the mapped area of this parcel match the area on the certificate?"*
- *"Is this parcel overlapped by another certificate or an HGU?"*
- *"Which village is BPN code 22030903?"*

## Data source

ATR/BPN land map (persil layer) and BPN village boundaries.

## GeoServer MCP (ATR/BPN)

BumiAtlas also provides a read-only GeoServer MCP gateway for the ATR/BPN `umum:Persil` WFS layer. It supports direct GeoServer access and a configurable BHUMI `/api/proksi` adapter.

- MCP endpoint: `https://bumiatlas.com/mcp/geoserver`
- REST health: `https://bumiatlas.com/api/geoserver?action=health`
- Setup, environment variables, proxy authentication, and tools: [GEOSERVER_MCP.md](./GEOSERVER_MCP.md)

The direct ATR/BPN GeoServer may require an internal VPN. The BHUMI proxy requires valid authorized authentication; the adapter does not bypass HTTP 401/403 responses.
