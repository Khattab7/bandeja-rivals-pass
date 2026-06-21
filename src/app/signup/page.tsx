"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import BandejaLogo from "@/components/BandejaLogo";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { name: form.name, phone: form.phone },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Member record is created automatically by the database trigger.
    router.push("/pass");
    router.refresh();
  }

  const inputClass =
    "w-full bg-transparent border border-white/40 text-white placeholder-white/50 px-4 py-3 text-sm outline-none focus:border-white transition-colors";
  const labelStyle = {
    fontFamily: "Gobold, Barlow Condensed, Arial, sans-serif",
  };

  return (
    <div className="min-h-screen bg-brand-blue flex flex-col items-center justify-center px-6 py-12">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center">
        <BandejaLogo width={180} height={44} />
        <p className="text-brand-green text-xs tracking-widest uppercase text-center mt-2" style={labelStyle}>
          RIVALS PASS
        </p>
      </div>

      <div className="w-full max-w-sm">
        <h1 className="text-white text-xl text-center mb-6 tracking-wide uppercase" style={labelStyle}>
          Create Account
        </h1>

        <form onSubmit={handleSignup} className="space-y-3">
          {/* Your data tab */}
          <div className="border-b border-brand-green pb-1 mb-4">
            <span className="text-brand-green text-xs tracking-widest uppercase" style={labelStyle}>
              Your Data
            </span>
          </div>

          <input
            name="name"
            type="text"
            placeholder="Full Name"
            value={form.name}
            onChange={handleChange}
            required
            className={inputClass}
            style={labelStyle}
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
            className={inputClass}
            style={labelStyle}
          />
          <input
            name="phone"
            type="tel"
            placeholder="Phone Number"
            value={form.phone}
            onChange={handleChange}
            className={inputClass}
            style={labelStyle}
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            required
            minLength={8}
            className={inputClass}
            style={labelStyle}
          />
          <input
            name="confirmPassword"
            type="password"
            placeholder="Repeat Password"
            value={form.confirmPassword}
            onChange={handleChange}
            required
            className={inputClass}
            style={labelStyle}
          />

          <p className="text-white/40 text-xs text-center pt-1" style={labelStyle}>
            By signing up you agree to our Terms and Conditions of Use
          </p>

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-brand-blue py-3 text-sm tracking-widest uppercase font-bold disabled:opacity-60 transition-opacity mt-2"
            style={labelStyle}
          >
            {loading ? "CREATING ACCOUNT..." : "SAVE"}
          </button>
        </form>

        <p className="text-white/60 text-xs text-center mt-6 tracking-wider uppercase" style={labelStyle}>
          Already have an account?{" "}
          <Link href="/login" className="text-brand-green hover:underline underline-offset-2">
            SIGN IN
          </Link>
        </p>
      </div>

      <div className="absolute bottom-0 left-0 w-32 h-32 opacity-20 pointer-events-none">
        <svg viewBox="0 0 100 100" fill="none">
          <line x1="0" y1="100" x2="100" y2="0" stroke="#8CF702" strokeWidth="2"/>
          <line x1="0" y1="80" x2="80" y2="0" stroke="white" strokeWidth="1"/>
        </svg>
      </div>
    </div>
  );
}
