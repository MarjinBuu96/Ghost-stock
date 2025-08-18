import Credentials from "next-auth/providers/credentials";

export const authConfig = {
  providers: [
    Credentials({
      name: "Demo Login",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Access Code", type: "password" }
      },
      async authorize(credentials) {
        // SUPER SIMPLE DEMO LOGIC:
        // Accepts any email with code 123456. Replace with real checks later.
        if (!credentials) return null;
        const { email, code } = credentials;
        if (code === "123456" && email) {
          return { id: email, name: email.split("@")[0], email };
        }
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login", // custom login page
  },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.user = { email: user.email, name: user.name };
      return token;
    },
    async session({ session, token }) {
      if (token?.user) session.user = token.user;
      return session;
    },
  },
};
