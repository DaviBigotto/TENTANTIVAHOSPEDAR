import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL não encontrada no process.env! Verifique o arquivo .env");
}

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
