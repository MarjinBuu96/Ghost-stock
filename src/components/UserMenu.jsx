"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function UserMenu() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <span className="text-gray-300">…</span>;
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn()}
        className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded text-black font-semibold"
      >
        Sign In
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-300">
        {session.user.name || session.user.email}
      </span>
      <button
        onClick={() => signOut()}
        className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
      >
        Sign Out
      </button>
    </div>
  );
}
