import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      name: "Demo Login",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Access Code", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials) return null;
        const { email, code } = credentials;
        // Demo: any email + code 123456 works
        if (email && code === "123456") {
          return { id: email, name: email.split("@")[0], email };
        }
        return null;
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },

  callbacks: {
    // Keep your token shaping
    async jwt({ token, user }) {
      if (user) token.user = { email: user.email, name: user.name };
      return token;
    },

    // 🔑 Enrich the session with plan from Prisma.UserSettings
    async session({ session, token }) {
      if (token?.user) {
        session.user = token.user;
        const email = token.user.email;

        try {
          const settings = email
            ? await prisma.userSettings.findUnique({ where: { userEmail: email } })
            : null;

          // Normalize: treat "free" as "starter"
          const plan = settings?.plan === "free"
            ? "starter"
            : (settings?.plan || "starter");

          session.user.planTier = plan;                 // <-- use this to gate features
          session.user.stripeCustomerId = settings?.stripeCustomerId || null;
        } catch (e) {
          // On any DB error, fall back to starter
          session.user.planTier = "starter";
          session.user.stripeCustomerId = null;
        }
      }
      return session;
    },
  },
};
