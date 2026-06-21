"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import BandejaLogo from "@/components/BandejaLogo";

const COUNTRY_CODES = [
  { code: "+20",  flag: "🇪🇬", name: "Egypt",        digits: 10 },
  { code: "+971", flag: "🇦🇪", name: "UAE",           digits: 9  },
  { code: "+966", flag: "🇸🇦", name: "Saudi Arabia",  digits: 9  },
  { code: "+974", flag: "🇶🇦", name: "Qatar",         digits: 8  },
  { code: "+965", flag: "🇰🇼", name: "Kuwait",        digits: 8  },
  { code: "+973", flag: "🇧🇭", name: "Bahrain",       digits: 8  },
  { code: "+968", flag: "🇴🇲", name: "Oman",          digits: 8  },
  { code: "+962", flag: "🇯🇴", name: "Jordan",        digits: 9  },
  { code: "+961", flag: "🇱🇧", name: "Lebanon",       digits: 8  },
  { code: "+212", flag: "🇲🇦", name: "Morocco",       digits: 9  },
  { code: "+213", flag: "🇩🇿", name: "Algeria",       digits: 9  },
  { code: "+216", flag: "🇹🇳", name: "Tunisia",       digits: 8  },
  { code: "+44",  flag: "🇬🇧", name: "UK",            digits: 10 },
  { code: "+1",   flag: "🇺🇸", name: "USA / Canada",  digits: 10 },
  { code: "+33",  flag: "🇫🇷", name: "France",        digits: 9  },
  { code: "+49",  flag: "🇩🇪", name: "Germany",       digits: 10 },
  { code: "+34",  flag: "🇪🇸", name: "Spain",         digits: 9  },
  { code: "+90",  flag: "🇹🇷", name: "Turkey",        digits: 10 },
  { code: "+92",  flag: "🇵🇰", name: "Pakistan",      digits: 10 },
  { code: "+91",  flag: "🇮🇳", name: "India",         digits: 10 },
];

const labelStyle = {
  fontFamily: "Gobold, Barlow Condensed, Arial, sans-serif",
};

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
  });
  const [countryCode, setCountryCode] = useState("+20");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode)!;

  function validatePhone(number: string, code: string) {
    const country = COUNTRY_CODES.find((c) => c.code === code);
    if (!country) return null;
    const digits = number.replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length !== country.digits) {
      return `${country.name} numbers must be ${country.digits} digits after the country code.`;
    }
    return null;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (e.target.name === "phoneNumber") {
      setPhoneError(validatePhone(e.target.value, countryCode));
    }
  }

  function handleCountryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setCountryCode(e.target.value);
    setPhoneError(validatePhone(form.phoneNumber, e.target.value));
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const phoneValidationError = validatePhone(form.phoneNumber, countryCode);
    if (phoneValidationError) {
      setPhoneError(phoneValidationError);
      return;
    }

    setLoading(true);

    const fullPhone = countryCode + form.phoneNumber.replace(/\D/g, "").replace(/^0+/, "");

    const { error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { name: form.name, phone: fullPhone },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    router.push("/pass");
    router.refresh();
  }

  const inputClass =
    "w-full bg-transparent border border-white/40 text-white placeholder-white/50 px-4 py-3 text-sm outline-none focus:border-white transition-colors";

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

          {/* Phone field: country code + number */}
          <div className="flex flex-col gap-1">
            <div className="flex">
              <select
                value={countryCode}
                onChange={handleCountryChange}
                className="bg-brand-blue border border-white/40 text-white text-sm outline-none focus:border-white transition-colors px-2 py-3 flex-shrink-0"
                style={{ ...labelStyle, minWidth: "110px", borderColor: phoneError ? "#f87171" : undefined }}
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code} style={{ background: "#0D5FD6" }}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>
              <input
                name="phoneNumber"
                type="tel"
                placeholder={`${selectedCountry.digits} digits`}
                value={form.phoneNumber}
                onChange={handleChange}
                required
                className="flex-1 bg-transparent border border-l-0 border-white/40 text-white placeholder-white/50 px-4 py-3 text-sm outline-none focus:border-white transition-colors"
                style={{ ...labelStyle, borderColor: phoneError ? "#f87171" : undefined }}
              />
            </div>
            {phoneError && (
              <p className="text-red-400 text-[10px] tracking-wide" style={labelStyle}>{phoneError}</p>
            )}
          </div>

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
