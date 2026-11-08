import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blue Lock Strikers",
  description:
    "Juego de fútbol inspirado en Blue Lock: elige tu héroe, activa tu despertar y domina la cancha.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
