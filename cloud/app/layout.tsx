import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rmango Cloud API",
  description: "Secure cloud inference and Roblox agent services for Rmango desktop.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui", background: "#10291f", color: "#fff9e9" }}>
        {children}
      </body>
    </html>
  );
}
