import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cuaderno de Conquistadores",
    short_name: "Cuaderno",
    description: "Gestión del progreso del club de Conquistadores.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fb",
    theme_color: "#075985",
    lang: "es",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
