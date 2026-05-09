import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "../components/Nav";
import { PusherToast } from "../components/PusherToast";

export const metadata: Metadata = {
  title: "autoresearcher",
  description: "Autopilot research agent + operator dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          <Nav />
          <main className="main">{children}</main>
        </div>
        <PusherToast />
      </body>
    </html>
  );
}
