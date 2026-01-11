import { storage } from "./storage";
import bcrypt from "bcrypt";

type LibraryVisibility = "internal" | "case_team" | "beneficiary";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Create demo staff users
    const adminPassword = await bcrypt.hash("admin123", 10);
    const lawyerPassword = await bcrypt.hash("lawyer123", 10);
    const expertPassword = await bcrypt.hash("expert123", 10);


    // Idempotent user creation
    let admin = await storage.getUserByUsername("admin");
    if (!admin) {
      admin = await storage.createUser({
        username: "admin",
        email: "admin@adala.org",
        password: adminPassword,
        fullName: "Sarah Ahmed",
        role: "admin",
        userType: "staff",
        emailVerified: true,
      });
    }

    let lawyer = await storage.getUserByUsername("lawyer");
    if (!lawyer) {
      lawyer = await storage.createUser({
        username: "lawyer",
        email: "lawyer@adala.org",
        password: lawyerPassword,
        fullName: "Omar Khalid",
        role: "lawyer",
        userType: "staff",
        emailVerified: true,
      });
    }

    let expert = await storage.getUserByUsername("expert");
    if (!expert) {
      expert = await storage.createUser({
        username: "expert",
        email: "expert@adala.org",
        password: expertPassword,
        fullName: "Dr. Layla Hassan",
        role: "expert",
        userType: "staff",
        emailVerified: true,
      });
    }

    console.log("✅ Created staff users");

    // Create expert profile

    // Idempotent expert profile
    const existingProfile = await storage.getExpertProfile(expert.id);
    if (!existingProfile) {
      await storage.createExpertProfile({
        userId: expert.id,
        bio: "Legal consultant with 15+ years of experience in family law and asylum cases. Fluent in Arabic and English.",
        specialties: ["Family Law", "Asylum & Refugee", "Civil Rights"],
        languages: ["Arabic", "English", "French"],
        isAvailableForBooking: true,
      });
    }

    console.log("✅ Created expert profile");

    // Create demo beneficiaries (idempotent)
    let beneficiary1 = await storage.getBeneficiaryByIdNumber("987654321");
    if (!beneficiary1) {
      beneficiary1 = await storage.createBeneficiary({
        fullName: "Ahmed Salem",
        idNumber: "987654321",
        phone: "+962 79 123 4567",
        email: "ahmed.salem@example.com",
        address: "Amman, Jordan",
        dateOfBirth: new Date("1985-05-15T00:00:00Z"),
        nationality: "Jordanian",
        gender: "male",
        status: "active",
      });
    }

    let beneficiary2 = await storage.getBeneficiaryByIdNumber("123456789");
    if (!beneficiary2) {
      beneficiary2 = await storage.createBeneficiary({
        fullName: "Layla Mahmoud",
        idNumber: "123456789",
        phone: "+962 78 987 6543",
        email: "layla.mahmoud@example.com",
        address: "Zarqa, Jordan",
        dateOfBirth: new Date("1990-03-22T00:00:00Z"),
        nationality: "Syrian",
        gender: "female",
        status: "active",
      });
    }

    let beneficiary3 = await storage.getBeneficiaryByIdNumber("456789123");
    if (!beneficiary3) {
      beneficiary3 = await storage.createBeneficiary({
        fullName: "Fatima Hassan",
        idNumber: "456789123",
        phone: "+962 77 654 3210",
        email: "fatima.hassan@example.com",
        address: "Irbid, Jordan",
        dateOfBirth: new Date("1988-11-08T00:00:00Z"),
        nationality: "Jordanian",
        gender: "female",
        status: "active",
      });
    }

    console.log("✅ Created beneficiaries");

    // Create beneficiary user accounts
    const beneficiary1Password = await bcrypt.hash("beneficiary123", 10);

    // Idempotent beneficiary user creation for beneficiary1
    let beneficiary1User = await storage.getUserByUsername("ahmed.salem");
    if (!beneficiary1User) {
      beneficiary1User = await storage.createUser({
        username: "ahmed.salem",
        email: "ahmed.salem@example.com",
        password: beneficiary1Password,
        fullName: "Ahmed Salem",
        role: "beneficiary",
        userType: "beneficiary",
        emailVerified: true,
      });
    }
    await storage.updateBeneficiary(beneficiary1.id, { userId: beneficiary1User.id } as any);

    // Idempotent beneficiary user creation for beneficiary2
    let beneficiary2User = await storage.getUserByUsername("layla.mahmoud");
    if (!beneficiary2User) {
      beneficiary2User = await storage.createUser({
        username: "layla.mahmoud",
        email: "layla.mahmoud@example.com",
        password: beneficiary1Password,
        fullName: "Layla Mahmoud",
        role: "beneficiary",
        userType: "beneficiary",
        emailVerified: true,
      });
    }
    await storage.updateBeneficiary(beneficiary2.id, { userId: beneficiary2User.id } as any);

    console.log("✅ Created beneficiary user accounts");

    // Create intake requests (idempotent-ish; no unique key, so we de-dupe by (beneficiaryId, caseType, description))
    const existingIntakes = await storage.getAllIntakeRequests();
    const getOrCreateIntake = async (input: any) => {
      const found = (existingIntakes as any[]).find(
        (r) =>
          String((r as any).beneficiaryId) === String(input.beneficiaryId) &&
          String((r as any).caseType) === String(input.caseType) &&
          String((r as any).description) === String(input.description),
      );
      if (found) return found;
      const created = await storage.createIntakeRequest(input);
      (existingIntakes as any[]).push(created);
      return created;
    };

    await getOrCreateIntake({
      beneficiaryId: beneficiary1.id,
      caseType: "labor",
      description: "Unpaid wages for 3 months. Employer refuses to pay.",
      status: "approved",
      reviewedBy: admin.id,
      reviewNotes: "Approved for case creation. Strong evidence of wage theft.",
      documents: ["wage_slips.pdf", "employment_contract.pdf"],
    });

    await getOrCreateIntake({
      beneficiaryId: beneficiary2.id,
      caseType: "asylum",
      description: "Residency permit appeal. Previous application was rejected.",
      status: "pending",
      documents: ["id_copy.pdf", "previous_rejection.pdf"],
    });

    await getOrCreateIntake({
      beneficiaryId: beneficiary3.id,
      caseType: "family",
      description: "Custody dispute. Need legal representation for upcoming hearing.",
      status: "under_review",
      reviewedBy: lawyer.id,
      documents: ["custody_documents.pdf"],
    });

    console.log("✅ Created intake requests");

    // Create cases (idempotent by caseNumber)
    const existingCases = await storage.getAllCases();
    const getOrCreateCase = async (input: any) => {
      const found = (existingCases as any[]).find((c) => String((c as any).caseNumber) === String(input.caseNumber));
      if (found) return found;
      const created = await storage.createCase(input);
      (existingCases as any[]).push(created);
      return created;
    };

    await getOrCreateCase({
      caseNumber: "CASE-2024-001",
      title: "Labor Dispute - Unpaid Wages",
      beneficiaryId: beneficiary1.id,
      caseType: "labor",
      description:
        "Client worked for 3 months without receiving payment. Employer claims business financial difficulties but has not provided documentation.",
      status: "in_progress",
      priority: "high",
      assignedLawyerId: lawyer.id,
      internalNotes: "Follow up with employer's legal counsel. Prepare for labor court filing.",
    });

    await getOrCreateCase({
      caseNumber: "CASE-2024-002",
      title: "Residency Permit Appeal",
      beneficiaryId: beneficiary2.id,
      caseType: "asylum",
      description:
        "Previous residency application rejected due to incomplete documentation. Gathering additional evidence for appeal.",
      status: "open",
      priority: "medium",
      internalNotes: "Need to obtain additional documentation from Syrian authorities.",
    });

    await getOrCreateCase({
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


    // ===== Documents Library Folders and Documents =====

    // Idempotent document folders
    const getOrCreateFolder = async (name: string, parentId: string | null, description: string) => {
      const folders = await storage.listDocumentFolders();
      let folder = folders.find(f => f.name === name && f.parentId === parentId);
      if (!folder) {
        folder = await storage.createDocumentFolder({ name, parentId, description, isArchived: false });
      }
      return folder;
    };

    const rootFolder = await getOrCreateFolder("Root Documents", null, "Main library folder");
    const policiesFolder = await getOrCreateFolder("Policies", rootFolder.id, "Policy documents");
    const templatesFolder = await getOrCreateFolder("Templates", rootFolder.id, "Legal templates");
    const orphanFolder = await getOrCreateFolder("Orphan Folder", null, "No parent folder");

    console.log("✅ Created document folders");

    // Add sample library documents

    // Idempotent library documents
    const getOrCreateLibraryDoc = async (doc: {
      folderId: string | null;
      title: string;
      docType: string;
      fileName: string;
      mimeType: string;
      size: number;
      storageKey: string;
      description: string;
      documentDate: Date;
      tags: string[];
      visibility: LibraryVisibility;
      beneficiaryId: string | null;
      caseId: string | null;
      isArchived: boolean;
      createdBy: string;
    }) => {
      const docs = await storage.listLibraryDocuments({ limit: 200 });
      let found = docs.find(d => d.title === doc.title && d.folderId === doc.folderId);
      if (!found) {
        found = await storage.createLibraryDocument(doc as any);
      }
      return found;
    };

    await getOrCreateLibraryDoc({
      folderId: policiesFolder.id,
      title: "Labor Rights Policy",
      docType: "policy",
      description: "Comprehensive labor rights policy document.",
      fileName: "labor_rights_policy.pdf",
      mimeType: "application/pdf",
      size: 123456,
      storageKey: "labor_rights_policy.pdf",
      documentDate: new Date(),
      tags: ["labor", "policy"],
      visibility: "internal",
      beneficiaryId: null,
      caseId: null,
      isArchived: false,
      createdBy: admin.id,
    });

    await getOrCreateLibraryDoc({
      folderId: templatesFolder.id,
      title: "Contract Template",
      docType: "template",
      description: "Standard contract template for civil cases.",
      fileName: "contract_template.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 45678,
      storageKey: "contract_template.docx",
      documentDate: new Date(),
      tags: ["template", "contract"],
      visibility: "case_team",
      beneficiaryId: null,
      caseId: null,
      isArchived: false,
      createdBy: admin.id,
    });

    await getOrCreateLibraryDoc({
      folderId: null,
      title: "General Info Sheet",
      docType: "info",
      description: "General information for all staff.",
      fileName: "info_sheet.pdf",
      mimeType: "application/pdf",
      size: 23456,
      storageKey: "info_sheet.pdf",
      documentDate: new Date(),
      tags: ["info"],
      visibility: "beneficiary",
      beneficiaryId: null,
      caseId: null,
      isArchived: false,
      createdBy: admin.id,
    });

    console.log("✅ Created library documents");

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
