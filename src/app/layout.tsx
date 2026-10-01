import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "RTO Autopsy — find out why orders failed",
  description: "Operational intelligence for RTO, NDR and delivery failures: deterministic analytics, root-cause candidates and intervention simulation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
