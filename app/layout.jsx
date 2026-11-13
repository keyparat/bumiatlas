import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "./globals.css";

export const metadata = {
  title: "BumiAtlas | GIS & Land Intelligence",
  description: "Web GIS dan dashboard data pertanahan Indonesia."
};

export default function RootLayout({ children }) {
  return <html lang="id"><body>{children}</body></html>;
}
