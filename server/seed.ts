import { storage } from "./storage";
import bcrypt from "bcrypt";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Create demo staff users
    const adminPassword = await bcrypt.hash("admin123", 10);
    const lawyerPassword = await bcrypt.hash("lawyer123", 10);
    const expertPassword = await bcrypt.hash("expert123", 10);

    const admin = await storage.createUser({
      username: "admin",
      email: "admin@adala.org",
      password: adminPassword,
      fullName: "Sarah Ahmed",
      role: "admin",
      userType: "staff",
      emailVerified: true,
    });

    const lawyer = await storage.createUser({
      username: "lawyer",
      email: "lawyer@adala.org",
      password: lawyerPassword,
      fullName: "Omar Khalid",
      role: "lawyer",
      userType: "staff",
      emailVerified: true,
    });

    const expert = await storage.createUser({
      username: "expert",
      email: "expert@adala.org",
      password: expertPassword,
      fullName: "Dr. Layla Hassan",
      role: "expert",
      userType: "staff",
      emailVerified: true,
    });

    console.log("✅ Created staff users");

    // Create expert profile
    await storage.createExpertProfile({
      userId: expert.id,
      bio: "Legal consultant with 15+ years of experience in family law and asylum cases. Fluent in Arabic and English.",
      specialties: ["Family Law", "Asylum & Refugee", "Civil Rights"],
      languages: ["Arabic", "English", "French"],
      isAvailableForBooking: true,
    });

    console.log("✅ Created expert profile");

    // Create demo beneficiaries
    const beneficiary1 = await storage.createBeneficiary({
      fullName: "Ahmed Salem",
      idNumber: "987654321",
      phone: "+962 79 123 4567",
      email: "ahmed.salem@example.com",
      address: "Amman, Jordan",
      dateOfBirth: new Date("1985-05-15"),
      nationality: "Jordanian",
      gender: "male",
      status: "active",
    });

    const beneficiary2 = await storage.createBeneficiary({
      fullName: "Layla Mahmoud",
      idNumber: "123456789",
      phone: "+962 78 987 6543",
      email: "layla.mahmoud@example.com",
      address: "Zarqa, Jordan",
      dateOfBirth: new Date("1990-03-22"),
      nationality: "Syrian",
      gender: "female",
      status: "active",
    });

    const beneficiary3 = await storage.createBeneficiary({
      fullName: "Fatima Hassan",
      idNumber: "456789123",
      phone: "+962 77 654 3210",
      email: "fatima.hassan@example.com",
      address: "Irbid, Jordan",
      dateOfBirth: new Date("1988-11-08"),
      nationality: "Jordanian",
      gender: "female",
      status: "active",
    });

    console.log("✅ Created beneficiaries");

    // Create beneficiary user accounts
    const beneficiary1Password = await bcrypt.hash("beneficiary123", 10);
    
    const beneficiary1User = await storage.createUser({
      username: "ahmed.salem",
      email: "ahmed.salem@example.com",
      password: beneficiary1Password,
      fullName: "Ahmed Salem",
      role: "viewer",
      userType: "beneficiary",
      emailVerified: true,
      beneficiaryId: beneficiary1.id,
    });

    const beneficiary2User = await storage.createUser({
      username: "layla.mahmoud",
      email: "layla.mahmoud@example.com",
      password: beneficiary1Password,
      fullName: "Layla Mahmoud",
      role: "viewer",
      userType: "beneficiary",
      emailVerified: true,
      beneficiaryId: beneficiary2.id,
    });

    console.log("✅ Created beneficiary user accounts");

    // Create intake requests
    const intake1 = await storage.createIntakeRequest({
      beneficiaryId: beneficiary1.id,
      caseType: "labor",
      description: "Unpaid wages for 3 months. Employer refuses to pay.",
      status: "approved",
      reviewedBy: admin.id,
      reviewNotes: "Approved for case creation. Strong evidence of wage theft.",
      documents: ["wage_slips.pdf", "employment_contract.pdf"],
    });

    const intake2 = await storage.createIntakeRequest({
      beneficiaryId: beneficiary2.id,
      caseType: "asylum",
      description: "Residency permit appeal. Previous application was rejected.",
      status: "pending",
      documents: ["id_copy.pdf", "previous_rejection.pdf"],
    });

    const intake3 = await storage.createIntakeRequest({
      beneficiaryId: beneficiary3.id,
      caseType: "family",
      description: "Custody dispute. Need legal representation for upcoming hearing.",
      status: "under_review",
      reviewedBy: lawyer.id,
      documents: ["custody_documents.pdf"],
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
      internalNotes: "Follow up with employer's legal counsel. Prepare for labor court filing.",
    });

    const case2 = await storage.createCase({
      caseNumber: "CASE-2024-002",
      title: "Residency Permit Appeal",
      beneficiaryId: beneficiary2.id,
      caseType: "asylum",
      description: "Previous residency application rejected due to incomplete documentation. Gathering additional evidence for appeal.",
      status: "open",
      priority: "medium",
      internalNotes: "Need to obtain additional documentation from Syrian authorities.",
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
      internalNotes: "Character references received. Home study completed favorably.",
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

    // Create appointments
    const appt1Date = new Date();
    appt1Date.setDate(appt1Date.getDate() + 3);
    appt1Date.setHours(10, 0, 0, 0);

    const appt2Date = new Date();
    appt2Date.setDate(appt2Date.getDate() + 5);
    appt2Date.setHours(14, 30, 0, 0);

    await storage.createAppointment({
      beneficiaryId: beneficiary1.id,
      expertId: expert.id,
      appointmentType: "in_person",
      scheduledDate: appt1Date,
      duration: 60,
      topic: "Legal Consultation - Labor Rights",
      notes: "Initial consultation to discuss case strategy and next steps",
      location: "Adala Office, Amman",
      status: "confirmed",
    });

    await storage.createAppointment({
      beneficiaryId: beneficiary2.id,
      expertId: expert.id,
      appointmentType: "online",
      scheduledDate: appt2Date,
      duration: 45,
      topic: "Asylum Case Review",
      notes: "Review documentation requirements and timeline",
      meetingLink: "https://meet.adala.org/room/abc123",
      status: "pending",
    });

    console.log("✅ Created appointments");

    // Create notifications
    await storage.createNotification({
      userId: beneficiary1User.id,
      type: "appointment_confirmed",
      title: "Appointment Confirmed",
      message: "Your consultation appointment is confirmed for " + appt1Date.toLocaleDateString(),
      relatedEntityId: "appt1",
    });

    await storage.createNotification({
      userId: expert.id,
      type: "appointment_request",
      title: "New Appointment Request",
      message: "Layla Mahmoud has requested a consultation appointment",
      relatedEntityId: "appt2",
    });

    console.log("✅ Created notifications");

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
    console.log("  Staff Admin: username=admin, password=admin123");
    console.log("  Staff Lawyer: username=lawyer, password=lawyer123");
    console.log("  Staff Expert: username=expert, password=expert123");
    console.log("  Beneficiary: username=ahmed.salem, password=beneficiary123");
    console.log("  Beneficiary: username=layla.mahmoud, password=beneficiary123\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();
