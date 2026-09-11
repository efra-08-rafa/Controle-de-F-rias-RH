import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controlo de Férias RH",
  description: "Sistema de gestão de funcionários e controlo de férias.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
