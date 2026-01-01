import { storage } from "./storage";
import bcrypt from "bcrypt";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Create demo users
    const adminPassword = await bcrypt.hash("admin123", 10);
    const lawyerPassword = await bcrypt.hash("lawyer123", 10);

    const admin = await storage.createUser({
      username: "admin",
      email: "admin@adala.org",
      password: adminPassword,
      fullName: "Sarah Ahmed",
      role: "admin",
    });

    const lawyer = await storage.createUser({
      username: "lawyer",
      email: "lawyer@adala.org",
      password: lawyerPassword,
      fullName: "Omar Khalid",
      role: "lawyer",
    });

    console.log("✅ Created users");

    // Create demo beneficiaries
    const beneficiary1 = await storage.createBeneficiary({
      fullName: "Ahmed Salem",
      idNumber: "987654321",
      phone: "+962 79 123 4567",
      email: "ahmed.salem@example.com",
      address: "Amman, Jordan",
      status: "active",
    });

    const beneficiary2 = await storage.createBeneficiary({
      fullName: "Layla Mahmoud",
      idNumber: "123456789",
      phone: "+962 78 987 6543",
      email: "layla.mahmoud@example.com",
      address: "Zarqa, Jordan",
      status: "pending",
    });

    const beneficiary3 = await storage.createBeneficiary({
      fullName: "Fatima Hassan",
      idNumber: "456789123",
      phone: "+962 77 654 3210",
      email: "fatima.hassan@example.com",
      address: "Irbid, Jordan",
      status: "active",
    });

    console.log("✅ Created beneficiaries");

    // Create intake requests
    const intake1 = await storage.createIntakeRequest({
      beneficiaryId: beneficiary1.id,
      caseType: "labor",
      description: "Unpaid wages for 3 months. Employer refuses to pay.",
      status: "approved",
      reviewedBy: admin.id,
      reviewNotes: "Approved for case creation. Strong evidence of wage theft.",
    });

    const intake2 = await storage.createIntakeRequest({
      beneficiaryId: beneficiary2.id,
      caseType: "asylum",
      description: "Residency permit appeal. Previous application was rejected.",
      status: "pending",
    });

    const intake3 = await storage.createIntakeRequest({
      beneficiaryId: beneficiary3.id,
      caseType: "family",
      description: "Custody dispute. Need legal representation for upcoming hearing.",
      status: "under_review",
      reviewedBy: lawyer.id,
    });

    console.log("✅ Created intake requests");

    // Create cases
    const case1 = await storage.createCase({
      caseNumber: "CASE-2024-001",
      title: "Labor Dispute - Unpaid Wages",
      beneficiaryId: beneficiary1.id,
      caseType: "labor",
      description: "Client worked for 3 months without receiving payment. Employer claims business financial difficulties but has not provided documentation.",
      status: "in_progress",
      priority: "high",
      assignedLawyerId: lawyer.id,
    });

    const case2 = await storage.createCase({
      caseNumber: "CASE-2024-002",
      title: "Residency Permit Appeal",
      beneficiaryId: beneficiary2.id,
      caseType: "asylum",
      description: "Previous residency application rejected due to incomplete documentation. Gathering additional evidence for appeal.",
      status: "open",
      priority: "medium",
    });

    const case3 = await storage.createCase({
      caseNumber: "CASE-2024-003",
      title: "Custody Hearing Preparation",
      beneficiaryId: beneficiary3.id,
      caseType: "family",
      description: "Client seeking custody of two children. Need to prepare for upcoming court hearing.",
      status: "urgent",
      priority: "urgent",
      assignedLawyerId: lawyer.id,
    });

    console.log("✅ Created cases");

    // Create hearings
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(14, 0, 0, 0);

    await storage.createHearing({
      caseId: case1.id,
      title: "Initial Labor Court Hearing",
      scheduledDate: tomorrow,
      location: "Amman Labor Court, Room 3A",
      notes: "Bring all wage receipts and employment contract. Client testimony required.",
    });

    await storage.createHearing({
      caseId: case3.id,
      title: "Custody Evaluation Session",
      scheduledDate: nextWeek,
      location: "Family Court, Building B",
      notes: "Social worker evaluation. Prepare character references and home environment documentation.",
    });

    console.log("✅ Created hearings");

    // Create audit logs
    await storage.createAuditLog({
      userId: admin.id,
      action: "system_seed",
      entity: "system",
      details: "Database seeded with demo data",
      ipAddress: "127.0.0.1",
    });

    console.log("✅ Created audit logs");
    console.log("\n🎉 Seeding completed successfully!\n");
    console.log("Demo credentials:");
    console.log("  Admin: username=admin, password=admin123");
    console.log("  Lawyer: username=lawyer, password=lawyer123\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();
