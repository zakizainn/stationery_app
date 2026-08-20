import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { Role } from "@/types";

interface AuthorizedUser {
  id: string;
  name: string;
  nik: string;
  role: Role;
  departemenId: number;
  departemenNama: string;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        nik: { label: "NIK", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.nik || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { nik: credentials.nik },
          include: { departemen: true },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        const authUser: AuthorizedUser = {
          id: String(user.id),
          name: user.nama,
          nik: user.nik,
          role: user.role,
          departemenId: user.departemenId,
          departemenNama: user.departemen.nama,
        };
        return authUser;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const authUser = user as AuthorizedUser | undefined;
      if (authUser) {
        token.id = authUser.id;
        token.role = authUser.role;
        token.nik = authUser.nik;
        token.departemenId = authUser.departemenId;
        token.departemenNama = authUser.departemenNama;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.nik = token.nik;
      session.user.departemenId = token.departemenId;
      session.user.departemenNama = token.departemenNama;
      return session;
    },
  },
};
