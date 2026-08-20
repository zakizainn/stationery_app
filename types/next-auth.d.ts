import { Role } from "@/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      nik: string;
      role: Role;
      departemenId: number;
      departemenNama: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    nik: string;
    departemenId: number;
    departemenNama: string;
  }
}

