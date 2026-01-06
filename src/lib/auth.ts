import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // 1. Проверяем, что передали email и пароль
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        // 2. Ищем пользователя в БД
        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          // Пользователь не найден
          return null;
        }

        // 3. Сравниваем пароль с hash из БД
        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) {
          // Неверный пароль
          return null;
        }

        // 4. Возвращаем объект юзера для NextAuth
        return {
          id: user.id,
          name: user.name ?? user.email,
          email: user.email,
          companyId: user.companyId,
          role: user.role,
        } as any;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      // При логине один раз кладём в токен companyId и role
      if (user) {
        (token as any).companyId = (user as any).companyId;
        (token as any).role = (user as any).role;
      }
      return token;
    },
async session({ session, token }) {
  if (session.user) {
    (session.user as any).id = (token as any).sub; // <-- важно
    (session.user as any).companyId = (token as any).companyId;
    (session.user as any).role = (token as any).role;
  }
  return session;
}
  },
};

export function auth() {
  return getServerSession(authOptions);
}
