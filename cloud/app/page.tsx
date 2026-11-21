export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: "12vh auto", padding: 32 }}>
      <h1 style={{ color: "#ffd966" }}>Rmango Cloud</h1>
      <p>The hosted API for Rmango desktop. AI inference runs on remote model providers through Vercel AI Gateway.</p>
      <p>Desktop users do not install local models or enter AI provider API keys.</p>
      <p style={{ opacity: .7, fontSize: 13 }}>Operational health: <a href="/api/health" style={{ color: "#a8d96a" }}>/api/health</a></p>
    </main>
  );
}
