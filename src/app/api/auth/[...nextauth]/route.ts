// src/app/api/auth/[...nextauth]/route.ts
import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },

  providers: [
    CredentialsProvider({
      name: "Email и пароль",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          // NextAuth воспримет как invalid credentials
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            companyId: true,
            passwordHash: true,
          },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) {
          return null;
        }

        // В JWT уйдут эти поля (через jwt callback)
        return {
          id: user.id,
          name: user.name ?? user.email,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
        } as any;
      },
    }),
  ],

  pages: {
    signIn: "/auth/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      // При первом логине user приходит из authorize
      if (user) {
        const u = user as any;

        // важно: зафиксировать sub как user.id (чтобы session.user.id всегда был real id)
        (token as any).sub = u.id;

        (token as any).role = u.role;
        (token as any).companyId = u.companyId;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).sub ?? token.sub;
        (session.user as any).role = (token as any).role;
        (session.user as any).companyId = (token as any).companyId;
      }

      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
