import { PrismaClient, CallStatus } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const company = await db.company.findFirst();

  if (!company) {
    console.error("❌ No company found. First register a user/company through the app.");
    process.exit(1);
  }

  const manager = await db.manager.findFirst({
    where: { companyId: company.id },
  });

  console.log("Using company:", company.id, company.name);
  if (manager) {
    console.log("Using manager:", manager.id, manager.name);
  } else {
    console.log("No manager found for this company. Call will be created without managerId.");
  }

  const call = await db.call.create({
    data: {
      companyId: company.id,
      managerId: manager ? manager.id : null,
      externalId: "real-test-" + Date.now().toString(),
      audioUrl: "https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba-online-audio-converter.com_-1.wav",
      duration: 60,
      status: CallStatus.NEW,
      meta: {
        source: "test-script-real",
      },
    },
  });

  console.log(" Created REAL test call:");
  console.log(call);
}

main()
  .catch((err) => {
    console.error(" Error in create-test-call:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
