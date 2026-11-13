import { NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MCP_URL = process.env.BUMIATLAS_MCP_URL || "https://bumiatlas.com/mcp/parcels";
const ALLOWED_TOOLS = new Set(["Parcel_search", "Parcel_get"]);

function normalizeResult(result) {
  if (result?.isError) {
    const message = (result.content || []).filter(item => item.type === "text").map(item => item.text).join("\n");
    throw new Error(message || "BumiAtlas MCP mengembalikan kesalahan.");
  }
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const textContent = (result?.content || []).filter(item => item.type === "text").map(item => item.text).join("\n");
  if (!textContent) return result ?? null;
  try { return JSON.parse(textContent); } catch { return { text: textContent }; }
}

export async function POST(request) {
  const token = process.env.BUMIATLAS_MCP_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({
      error: "Token MCP belum dikonfigurasi. Tambahkan BUMIATLAS_MCP_ACCESS_TOKEN pada Environment Variables Vercel."
    }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body request harus berupa JSON." }, { status: 400 }); }

  const tool = body?.tool;
  const args = body?.arguments ?? {};
  if (!ALLOWED_TOOLS.has(tool)) {
    return NextResponse.json({ error: "Tool MCP tidak diizinkan." }, { status: 400 });
  }
  if (tool === "Parcel_search") {
    if (typeof args.query !== "string" || !args.query.trim() || args.query.length > 160) {
      return NextResponse.json({ error: "Isi pencarian persil tidak valid." }, { status: 400 });
    }
    args.query = args.query.trim();
    args.limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
    if (args.radius !== undefined) args.radius = Math.min(Math.max(Number(args.radius) || 50, 1), 5000);
  } else {
    if (args.id === undefined || args.id === null || String(args.id).length > 128) {
      return NextResponse.json({ error: "ID persil tidak valid." }, { status: 400 });
    }
    args.id = String(args.id);
    args.include_geometry = args.include_geometry !== false;
  }

  const client = new Client({ name: "bumiatlas-nextjs", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: (input, init = {}) => fetch(input, { ...init, redirect: "error" })
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({ name: tool, arguments: args });
    return NextResponse.json({ ok: true, data: normalizeResult(result) }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message = error?.name === "UnauthorizedError"
      ? "Token MCP ditolak atau sudah kedaluwarsa. Perbarui BUMIATLAS_MCP_ACCESS_TOKEN."
      : (error?.message || "Tidak dapat menghubungi BumiAtlas MCP.");
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    try { await client.close(); } catch {}
    try { await transport.close(); } catch {}
  }
}
