import { Suspense } from "react";
import AccountRecoveryForm from "@/components/auth/AccountRecoveryForm";
export default function ForgotPasswordPage() { return <Suspense><AccountRecoveryForm mode="reset" /></Suspense>; }
