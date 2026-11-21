"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";

type Props = {
  supabaseUrl: string;
  publishableKey: string;
};

export default function ResetPasswordForm({ supabaseUrl, publishableKey }: Props) {
  const supabase = useMemo(() => createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: "implicit",
    },
  }), [supabaseUrl, publishableKey]);

  const [checking, setChecking] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    const initialiseRecovery = async () => {
      try {
        const url = new URL(window.location.href);
        const query = url.searchParams;
        const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
        const linkError = fragment.get("error_description") || query.get("error_description");
        const accessToken = fragment.get("access_token");
        const refreshToken = fragment.get("refresh_token");
        const tokenHash = query.get("token_hash");
        const linkType = fragment.get("type") || query.get("type");

        // Recovery tokens must not remain in browser history, screenshots, or copied URLs.
        if (linkError || accessToken || refreshToken || tokenHash) {
          window.history.replaceState({}, document.title, url.pathname);
        }

        if (linkError) {
          throw new Error("This recovery link is invalid or expired. Request a new password reset email from RMango.");
        }

        if (accessToken && refreshToken && linkType === "recovery") {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          const { data: verified, error: verifyError } = await supabase.auth.getUser();
          if (verifyError || !verified.user) {
            throw new Error("This recovery link is invalid or expired. Request a new password reset email from RMango.");
          }
        } else {
          if (tokenHash && linkType === "recovery") {
            const { error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: "recovery",
            });
            if (error) throw error;
          } else {
            const { data, error } = await supabase.auth.getSession();
            if (error || !data.session) {
              throw new Error("This page needs a valid password recovery link. Request a new one from RMango.");
            }
          }
        }

        if (active) setRecoveryReady(true);
      } catch (error) {
        if (active) {
          setRecoveryReady(false);
          setMessage(error instanceof Error ? error.message : "This recovery link could not be verified.");
        }
      } finally {
        if (active) setChecking(false);
      }
    };

    void initialiseRecovery();
    return () => { active = false; };
  }, [supabase]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || !recoveryReady) return;

    if (password.length < 10) {
      setMessage("Choose a password with at least 10 characters.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setSuccess(true);
      setRecoveryReady(false);
      setPassword("");
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update your password. Request a new recovery link.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{
      minHeight: "100vh", display: "grid", placeItems: "center", padding: 24,
      background: "radial-gradient(circle at 20% 0%, #1e4938 0, #10291f 42%, #0b1c16 100%)",
      color: "#fff9e9", fontFamily: "Inter, system-ui, sans-serif",
    }}>
      <section style={{
        width: "min(100%, 440px)", padding: 30, borderRadius: 20,
        border: "1px solid rgba(255,255,255,.13)", background: "rgba(14,35,27,.94)",
        boxShadow: "0 24px 80px rgba(0,0,0,.35)",
      }}>
        <div style={{ color: "#f0c85b", fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>RMANGO ACCOUNT</div>
        <h1 style={{ margin: "12px 0 8px", fontSize: 29, letterSpacing: -1 }}>Reset your password</h1>
        <p style={{ margin: "0 0 24px", color: "#b8c9bd", fontSize: 14, lineHeight: 1.6 }}>
          Choose a new password for your RMango account. This page only works from a valid recovery email.
        </p>

        {checking ? (
          <p role="status" style={{ color: "#dce9df", fontSize: 14 }}>Verifying your recovery link…</p>
        ) : success ? (
          <div role="status" style={{
            padding: 15, borderRadius: 12, border: "1px solid #467e5b",
            background: "rgba(57,126,78,.18)", color: "#d8f4df", lineHeight: 1.6, fontSize: 14,
          }}>
            Your password has been updated. Return to the RMango desktop app and sign in with the new password.
          </div>
        ) : recoveryReady ? (
          <form onSubmit={handleSubmit}>
            <label htmlFor="new-password" style={{ display: "block", marginBottom: 7, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>NEW PASSWORD</label>
            <input
              id="new-password" type="password" value={password} onChange={event => setPassword(event.target.value)}
              autoComplete="new-password" minLength={10} maxLength={128} required
              placeholder="At least 10 characters"
              style={{ boxSizing: "border-box", width: "100%", padding: 13, marginBottom: 16, borderRadius: 10, border: "1px solid #456151", background: "#10271d", color: "#fff", fontSize: 14 }}
            />
            <label htmlFor="confirm-password" style={{ display: "block", marginBottom: 7, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>CONFIRM NEW PASSWORD</label>
            <input
              id="confirm-password" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)}
              autoComplete="new-password" minLength={10} maxLength={128} required
              placeholder="Enter the new password again"
              style={{ boxSizing: "border-box", width: "100%", padding: 13, marginBottom: 18, borderRadius: 10, border: "1px solid #456151", background: "#10271d", color: "#fff", fontSize: 14 }}
            />
            <button type="submit" disabled={saving} style={{
              width: "100%", padding: 13, border: 0, borderRadius: 10, background: "#e9bd50",
              color: "#1a261b", fontWeight: 800, fontSize: 14, cursor: saving ? "wait" : "pointer",
            }}>
              {saving ? "Updating password…" : "Update password"}
            </button>
          </form>
        ) : (
          <div role="alert" style={{
            padding: 15, borderRadius: 12, border: "1px solid #805d3d",
            background: "rgba(128,93,61,.16)", color: "#f3d9bb", lineHeight: 1.6, fontSize: 14,
          }}>
            {message || "The recovery link could not be verified. Request a new one from RMango."}
          </div>
        )}

        {message && recoveryReady && (
          <p role="alert" style={{ marginTop: 14, color: "#ffcf9b", fontSize: 13 }}>{message}</p>
        )}
        <p style={{ marginTop: 22, color: "#91a79a", fontSize: 11, lineHeight: 1.6 }}>
          Never share your recovery link or password. Close this page after your password has been changed.
        </p>
      </section>
    </main>
  );
}
