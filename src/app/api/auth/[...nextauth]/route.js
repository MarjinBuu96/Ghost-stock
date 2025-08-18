export const runtime = "nodejs";

import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";
// If the "@/lib" alias doesn't work for you, use:
// import { authOptions } from "../../../../lib/authOptions";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
