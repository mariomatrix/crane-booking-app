import * as fs from "fs";
import * as path from "path";

const WORKSPACE_ROOT = process.cwd();
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, "transfer_gpt");

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Grupe datoteka organizirane u logičke batch-eve
const BATCHES = [
    {
        name: "batch_01_config_and_schema.txt",
        title: "Konfiguracija projekta, Baza podataka & Drizzle Schema",
        files: [
            "package.json",
            "tsconfig.json",
            "vite.config.ts",
            "drizzle.config.js",
            ".env.example",
            "components.json",
            "shared/const.ts",
            "shared/oib.ts",
            "drizzle/schema.ts",
        ]
    },
    {
        name: "batch_02_server_core_and_services.txt",
        title: "Server Core, Autentikacija, DB konekcija, Migracije & e-računi servis",
        files: [
            "server/_core/index.ts",
            "server/_core/trpc.ts",
            "server/_core/context.ts",
            "server/_core/cookies.ts",
            "server/_core/systemRouter.ts",
            "server/db.ts",
            "server/migrate.ts",
            "server/storage.ts",
            "server/services/eRacuniService.ts",
        ]
    },
    {
        name: "batch_03_server_routers.txt",
        title: "Glavni tRPC Ruteri i Poslovna logika",
        files: [
            "server/routers.ts",
            "server/berths.router.ts",
            "server/invoices.router.ts",
            "server/workOrders.router.ts",
            "server/userCard.router.ts",
            "server/priceList.router.ts",
            "server/reports.router.ts",
        ]
    },
    {
        name: "batch_04_client_core_and_layout.txt",
        title: "Client Core, Routing, Layout, Konteksti i Pomoćne komponente",
        files: [
            "client/index.html",
            "client/src/main.tsx",
            "client/src/App.tsx",
            "client/src/index.css",
            "client/src/const.ts",
            "client/src/lib/trpc.ts",
            "client/src/lib/utils.ts",
            "client/src/contexts/ThemeContext.tsx",
            "client/src/contexts/LangContext.tsx",
            "client/src/components/DashboardLayout.tsx",
            "client/src/components/DashboardLayoutSkeleton.tsx",
            "client/src/components/ErrorBoundary.tsx",
            "client/src/components/Footer.tsx",
            "client/src/components/LanguageSelector.tsx",
            "client/src/components/NewMessageToast.tsx",
        ]
    },
    {
        name: "batch_05_client_user_pages.txt",
        title: "Korisničke stranice & Mobilna aplikacija za operatere",
        files: [
            "client/src/pages/Home.tsx",
            "client/src/pages/AuthPage.tsx",
            "client/src/pages/Profile.tsx",
            "client/src/pages/MyCard.tsx",
            "client/src/pages/MyReservations.tsx",
            "client/src/pages/MyVessels.tsx",
            "client/src/pages/NewReservation.tsx",
            "client/src/pages/PrivacyPolicy.tsx",
            "client/src/pages/NotFound.tsx",
            "client/src/pages/mobile/MobileOperatorApp.tsx",
        ]
    },
    {
        name: "batch_06_admin_pages_part1.txt",
        title: "Admin Panel 1: Akvatorij & Mapa vezova, Računi & e-Računi, Radni nalozi, Karton člana",
        files: [
            "client/src/pages/admin/AdminLayout.tsx",
            "client/src/pages/admin/AdminDashboard.tsx",
            "client/src/pages/admin/AdminAkvatorijMap.tsx",
            "client/src/pages/admin/AdminInvoices.tsx",
            "client/src/pages/admin/AdminWorkOrders.tsx",
            "client/src/pages/admin/AdminUserCard.tsx",
        ]
    },
    {
        name: "batch_07_admin_pages_part2.txt",
        title: "Admin Panel 2: Kalendar, Korisnici, Dnevnik dizalice, Suhi vezovi, Cjenici i Postavke",
        files: [
            "client/src/pages/admin/AdminCalendar.tsx",
            "client/src/pages/admin/AdminReservations.tsx",
            "client/src/pages/admin/AdminUsers.tsx",
            "client/src/pages/admin/AdminStaff.tsx",
            "client/src/pages/admin/AdminCraneOps.tsx",
            "client/src/pages/admin/AdminLandZones.tsx",
            "client/src/pages/admin/AdminLandWaiting.tsx",
            "client/src/pages/admin/AdminPriceList.tsx",
            "client/src/pages/admin/AdminServiceTypes.tsx",
            "client/src/pages/admin/AdminCranes.tsx",
            "client/src/pages/admin/AdminSettings.tsx",
            "client/src/pages/admin/AdminAnalytics.tsx",
            "client/src/pages/admin/AdminSeasons.tsx",
            "client/src/pages/admin/AdminHolidays.tsx",
            "client/src/pages/admin/AdminAuditLog.tsx",
        ]
    },
    {
        name: "batch_08_reports.txt",
        title: "Izvještaji i Analitika",
        files: [
            "client/src/pages/admin/reports/ReportHub.tsx",
            "client/src/pages/admin/reports/ReportSchedule.tsx",
            "client/src/pages/admin/reports/ReportUtilization.tsx",
            "client/src/pages/admin/reports/ReportCraneLog.tsx",
            "client/src/pages/admin/reports/ReportMemberFeeAdjustments.tsx",
        ]
    },
    {
        name: "batch_09_ui_primitives.txt",
        title: "UI Primitives (Radix UI / shadcn komponente)",
        files: [
            "client/src/components/ui/button.tsx",
            "client/src/components/ui/input.tsx",
            "client/src/components/ui/card.tsx",
            "client/src/components/ui/dialog.tsx",
            "client/src/components/ui/badge.tsx",
            "client/src/components/ui/select.tsx",
            "client/src/components/ui/tabs.tsx",
            "client/src/components/ui/dropdown-menu.tsx",
            "client/src/components/ui/sidebar.tsx",
            "client/src/components/ui/sonner.tsx",
            "client/src/components/ui/tooltip.tsx",
            "client/src/components/ui/avatar.tsx",
            "client/src/components/ui/table.tsx",
            "client/src/components/ui/popover.tsx",
            "client/src/components/ui/calendar.tsx",
            "client/src/components/ui/switch.tsx",
            "client/src/components/ui/scroll-area.tsx",
        ]
    }
];

function generateBatches() {
    console.log("=== Započinjem izvoz minimalne konfiguracije u /transfer_gpt ===");

    const indexContent: string[] = [
        "# Upute za prijenos koda (Transfer GPT)",
        "",
        "Ovaj direktorij sadrži cjelokupni minimalni i čisti izvorni kod aplikacije **crane-booking-app / marina-erp**, podijeljen u logičke pakete (batch-eve) za jednostavan prijenos u ChatGPT ili na drugi PC.",
        "",
        "## Format datoteka u svakom batchu:",
        "```text",
        "relative/file/path.tsx",
        "// file contents...",
        "```",
        "",
        "## Popis paketa (Batches):",
        ""
    ];

    for (let i = 0; i < BATCHES.length; i++) {
        const batch = BATCHES[i];
        const outFilePath = path.join(OUTPUT_DIR, batch.name);
        let batchText = `// ============================================================================\n`;
        batchText += `// BATCH ${i + 1}/${BATCHES.length}: ${batch.title}\n`;
        batchText += `// ============================================================================\n\n`;

        let includedCount = 0;

        for (const relPath of batch.files) {
            const fullPath = path.join(WORKSPACE_ROOT, relPath);
            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, "utf8");
                batchText += `${relPath}\n`;
                batchText += `${content}\n\n`;
                batchText += `// ----------------------------------------------------------------------------\n\n`;
                includedCount++;
            } else {
                console.warn(`[Preskočeno] Datoteka ne postoji: ${relPath}`);
            }
        }

        fs.writeFileSync(outFilePath, batchText, "utf8");
        const fileSizeKB = (fs.statSync(outFilePath).size / 1024).toFixed(1);
        console.log(`✓ Kreiran ${batch.name} (${fileSizeKB} KB, ${includedCount} datoteka)`);

        indexContent.push(`- **[\`${batch.name}\`](./${batch.name})** (${fileSizeKB} KB) — *${batch.title}* (${includedCount} datoteka)`);
    }

    // Dodatne upute za pokretanje na novom PC-ju
    indexContent.push(
        "",
        "## Kako pokrenuti projekt na novom PC-ju:",
        "1. Klonirajte ili rekreirajte datoteke iz ovih 9 paketa u prazan direktorij.",
        "2. Instalirajte Node.js (v20+) i pnpm.",
        "3. Pokrenite:",
        "   ```bash",
        "   pnpm install",
        "   ```",
        "4. Kopirajte `.env.example` u `.env` i postavite vaš PostgreSQL connection string.",
        "5. Pokrenite bazu i dev server:",
        "   ```bash",
        "   pnpm dev",
        "   ```"
    );

    fs.writeFileSync(path.join(OUTPUT_DIR, "INDEX.md"), indexContent.join("\n"), "utf8");
    console.log("✓ Kreiran transfer_gpt/INDEX.md");
    console.log("=== Izvoz uspješno dovršen! ===");
}

generateBatches();
