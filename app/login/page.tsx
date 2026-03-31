import { LoginForm } from "@/components/login-form"
import Link from "next/link"

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-md text-sm text-muted-foreground hover:text-primary hover:border-primary mb-6 transition-colors">
          &lt; Go back to home
        </Link>
        <LoginForm />
      </div>
    </div>
  )
}

