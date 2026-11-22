export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: "12vh auto", padding: 32 }}>
      <h1 style={{ color: "#ffd966" }}>Rmango Cloud</h1>
      <p>The hosted API and agent service for the Rmango desktop app.</p>
      <p>AI inference runs on Cloudflare Workers AI through this Worker’s AI binding. Rmango does not use Vercel AI Gateway.</p>
      <p>To use Rmango, open the Windows desktop app and sign in to your account.</p>
      <p style={{ opacity: .7, fontSize: 13 }}>Operational health: <a href="/api/health" style={{ color: "#a8d96a" }}>/api/health</a></p>
    </main>
  );
}
