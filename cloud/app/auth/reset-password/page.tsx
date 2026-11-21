import { requiredEnv } from "@/lib/env";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <ResetPasswordForm
      supabaseUrl={requiredEnv("SUPABASE_URL")}
      publishableKey={requiredEnv("SUPABASE_PUBLISHABLE_KEY")}
    />
  );
}
