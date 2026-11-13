import GisWorkspace from "../components/GisWorkspace";

export default function Home() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark">B</span><span>Bumi<span className="brand-muted">Atlas</span></span></a>
        <div className="topbar-center"><span className="live-dot" /> LAND INTELLIGENCE WORKSPACE</div>
        <a className="top-link" href="https://bumiatlas.com/mcp-docs/parcels" target="_blank" rel="noreferrer">Dokumentasi ↗</a>
      </header>
      <section className="page-heading">
        <div><p className="eyebrow">GEOSPASIAL · PERTANAHAN INDONESIA</p><h1>GIS Command Center</h1><p className="subheading">Peta bidang, layer ATR/BPN, dan ringkasan data dalam satu workspace.</p></div>
        <div className="heading-tag">BETA · NEXT.JS</div>
      </section>
      <section className="metric-grid" aria-label="Ringkasan dashboard">
        <article className="metric-card"><span className="metric-label">Bidang ditampilkan</span><strong id="metric-parcels">—</strong><small>Fitur pada sesi peta ini</small></article>
        <article className="metric-card"><span className="metric-label">Total luas digitasi</span><strong id="metric-area">—</strong><small>Estimasi dari geometri</small></article>
        <article className="metric-card"><span className="metric-label">Layer aktif</span><strong id="metric-layers">1</strong><small>Basemap dan overlay</small></article>
        <article className="metric-card"><span className="metric-label">Sumber data</span><strong>ATR/BPN</strong><small>WMS melalui server proxy</small></article>
      </section>
      <GisWorkspace />
      <footer className="footer">BumiAtlas GIS · Data tematik mengikuti ketersediaan dan ketentuan layanan sumber data.</footer>
    </main>
  );
}
