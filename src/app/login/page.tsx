"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import BandejaLogo from "@/components/BandejaLogo";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/pass");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-brand-blue flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center">
        <BandejaLogo width={180} height={44} />
        <p
          className="text-brand-green text-xs tracking-widest uppercase text-center mt-2"
          style={{ fontFamily: "Gobold, Barlow Condensed, Arial, sans-serif" }}
        >
          RIVALS PASS
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        <h1
          className="text-white text-xl text-center mb-6 tracking-wide uppercase"
          style={{ fontFamily: "Gobold, Barlow Condensed, Arial, sans-serif" }}
        >
          Sign In
        </h1>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-transparent border border-white/40 text-white placeholder-white/50 px-4 py-3 text-sm outline-none focus:border-white transition-colors"
            style={{ fontFamily: "Gobold, Barlow Condensed, Arial, sans-serif" }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-transparent border border-white/40 text-white placeholder-white/50 px-4 py-3 text-sm outline-none focus:border-white transition-colors"
            style={{ fontFamily: "Gobold, Barlow Condensed, Arial, sans-serif" }}
          />

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-brand-blue py-3 text-sm tracking-widest uppercase font-bold disabled:opacity-60 transition-opacity"
            style={{ fontFamily: "Gobold, Barlow Condensed, Arial, sans-serif" }}
          >
            {loading ? "SIGNING IN..." : "LOGIN"}
          </button>
        </form>

        <p
          className="text-white/60 text-xs text-center mt-8 tracking-wider uppercase"
          style={{ fontFamily: "Gobold, Barlow Condensed, Arial, sans-serif" }}
        >
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-brand-green underline-offset-2 hover:underline">
            CREATE AN ACCOUNT
          </Link>
        </p>
      </div>

      {/* Decorative corner slash */}
      <div className="absolute bottom-0 left-0 w-32 h-32 opacity-20 pointer-events-none">
        <svg viewBox="0 0 100 100" fill="none">
          <line x1="0" y1="100" x2="100" y2="0" stroke="#8CF702" strokeWidth="2"/>
          <line x1="0" y1="80" x2="80" y2="0" stroke="white" strokeWidth="1"/>
        </svg>
      </div>
    </div>
  );
}
