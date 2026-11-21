import Link from "next/link";

export const metadata = {
  title: "Email confirmed · Rmango",
  description: "Your Rmango email confirmation flow is complete.",
};

export default function EmailConfirmedPage() {
  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: 24,
      background: "radial-gradient(ellipse at 50% 15%, #254c32 0%, #10291f 52%, #091710 100%)",
      color: "#fff9e9",
      fontFamily: "system-ui, sans-serif",
    }}>
      <section style={{
        width: "min(100%, 480px)",
        padding: "38px 32px",
        textAlign: "center",
        border: "1px solid rgba(190, 220, 142, .22)",
        borderRadius: 24,
        background: "rgba(15, 34, 25, .86)",
        boxShadow: "0 24px 80px rgba(0,0,0,.28)",
      }}>
        <div aria-hidden="true" style={{
          width: 76,
          height: 76,
          margin: "0 auto 22px",
          display: "grid",
          placeItems: "center",
          borderRadius: 24,
          color: "#d3f1a2",
          background: "linear-gradient(145deg, rgba(166, 211, 111, .22), rgba(47, 91, 54, .16))",
          border: "1px solid rgba(195, 227, 146, .35)",
          fontSize: 34,
        }}>✓</div>
        <p style={{ margin: 0, color: "#cce69c", fontSize: 11, letterSpacing: ".18em", fontWeight: 800 }}>RMANGO ACCOUNT</p>
        <h1 style={{ margin: "12px 0 10px", fontSize: 30, lineHeight: 1.15 }}>Email confirmed</h1>
        <p style={{ margin: "0 auto 26px", maxWidth: 350, color: "#b9c7b8", lineHeight: 1.65 }}>
          Your confirmation link has been accepted. Return to the Rmango desktop app and sign in with your account email and password.
        </p>
        <Link href="/" style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 44,
          padding: "0 22px",
          borderRadius: 12,
          color: "#142516",
          background: "#c9e69a",
          textDecoration: "none",
          fontWeight: 750,
        }}>Return to Rmango Cloud</Link>
      </section>
    </main>
  );
}
