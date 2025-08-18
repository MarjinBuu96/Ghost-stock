"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", {
      redirect: false,
      email,
      code,
      callbackUrl,
    });
    if (res?.error) {
      setError("Invalid email or code (hint: code is 123456).");
    } else {
      router.push(callbackUrl);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-gray-800 p-6 rounded shadow">
        <h2 className="text-2xl font-bold mb-4 text-center">Sign in</h2>
        <label className="block text-sm mb-2">Email</label>
        <input
          className="w-full mb-4 px-3 py-2 rounded text-black"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
        />
        <label className="block text-sm mb-2">Access Code</label>
        <input
          className="w-full mb-4 px-3 py-2 rounded text-black"
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          required
        />
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <button className="w-full bg-green-500 hover:bg-green-600 text-black font-semibold rounded py-2">
          Continue
        </button>
        <p className="text-xs text-gray-400 mt-3">
          Demo mode: use any email and code <span className="font-mono">123456</span>.
        </p>
      </form>
    </main>
  );
}
