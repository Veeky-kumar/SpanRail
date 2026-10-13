import { prisma } from "../src/server/db";
import { generateApiKeyPair, hashSecretKey, secretKeyPreview } from "../src/server/apiKey";
import { hashPassword } from "../src/server/password";

const DEMO_EMAIL = "demo@tracewell.local";
const DEMO_PASSWORD = "tracewell-demo-password";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash: hashPassword(DEMO_PASSWORD), name: "Demo User" },
  });

  const project = await prisma.project.create({
    data: { name: "Demo Project" },
  });

  await prisma.projectMember.create({
    data: { projectId: project.id, userId: user.id, role: "OWNER" },
  });

  const { publicKey, secretKey } = generateApiKeyPair();

  await prisma.apiKey.create({
    data: {
      projectId: project.id,
      publicKey,
      hashedSecretKey: hashSecretKey(secretKey),
      secretKeyPreview: secretKeyPreview(secretKey),
    },
  });

  console.log("Seeded demo user:", DEMO_EMAIL, "/ password:", DEMO_PASSWORD);
  console.log("Seeded demo project:", project.id);
  console.log("TRACEWELL_PUBLIC_KEY=" + publicKey);
  console.log("TRACEWELL_SECRET_KEY=" + secretKey);
  console.log("(save the secret key now — it is not stored in plaintext and cannot be retrieved again)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
