import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LE-AR FUEL STATION // POS & Attendant Terminal",
  description: "Fuel Station Point of Sale, Attendant Dispenser Terminal, and Station Management Portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full bg-slate-950 text-slate-100 antialiased selection:bg-amber-500 selection:text-slate-950">
      <body suppressHydrationWarning className="min-h-full flex flex-col font-sans bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
