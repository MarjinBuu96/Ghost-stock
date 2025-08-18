import Credentials from "next-auth/providers/credentials";

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
