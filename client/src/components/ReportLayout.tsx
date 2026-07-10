import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { FileSpreadsheet, FileText, Loader2, ArrowLeft } from "lucide-react";
import * as XLSX from "xlsx";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { toast } from "sonner";
import { useLocation } from "wouter";

// Shared Props
interface ReportHeaderProps {
    title: string;
    dateFrom?: string;
    dateTo?: string;
}

export function ReportHeader({ title, dateFrom, dateTo }: ReportHeaderProps) {
    const { data: settings } = trpc.settings.get.useQuery();
    const logo = settings?.marinaLogo || "";
    const name = settings?.marinaName || "PŠD Špinut";

    return (
        <div className="border-b pb-6 mb-6 flex items-start justify-between print-header">
            <div className="space-y-1">
                {logo ? (
                    <img
                        src={logo}
                        alt="Logo"
                        className="h-14 w-auto object-contain mb-3 max-w-[200px]"
                    />
                ) : (
                    <div className="text-xl font-bold tracking-tight text-primary mb-2">⚓ {name}</div>
                )}
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                {(dateFrom || dateTo) && (
                    <p className="text-sm text-muted-foreground">
                        Razdoblje: {dateFrom ? format(new Date(dateFrom), "dd.MM.yyyy") : ""}
                        {dateTo ? ` – ${format(new Date(dateTo), "dd.MM.yyyy")}` : ""}
                    </p>
                )}
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">{name}</p>
                <p>Generirano: {format(new Date(), "dd.MM.yyyy HH:mm")}</p>
                <p className="print-only">Format: A4 Portret</p>
            </div>
        </div>
    );
}

// Shared Footer
interface ReportFooterProps {
    summaryItems?: { label: string; value: string | number }[];
}

export function ReportFooter({ summaryItems = [] }: ReportFooterProps) {
    return (
        <div className="mt-8 border-t pt-6 flex flex-col md:flex-row md:items-center md:justify-between text-sm text-muted-foreground gap-4">
            {summaryItems.length > 0 && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 bg-slate-50 dark:bg-slate-900 border rounded-md p-3 w-fit">
                    {summaryItems.map((item, index) => (
                        <div key={index} className="flex gap-2">
                            <span className="font-medium text-foreground">{item.label}:</span>
                            <span className="font-mono text-primary font-bold">{item.value}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="text-xs self-end">
                Stranica 1 od 1
            </div>
        </div>
    );
}

// Reusable Export Actions Panel
interface ExportActionsProps {
    excelData: any[];
    excelFileName: string;
    pdfDocument?: any;
    pdfFileName?: string;
}

export function ExportActions({ excelData, excelFileName, pdfDocument, pdfFileName }: ExportActionsProps) {
    const handleExcelExport = () => {
        try {
            if (excelData.length === 0) {
                toast.warning("Nema podataka za izvoz.");
                return;
            }
            const worksheet = XLSX.utils.json_to_sheet(excelData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Izvještaj");
            XLSX.writeFile(workbook, `${excelFileName}_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
            toast.success("Excel tablica je uspješno preuzeta.");
        } catch (error: any) {
            toast.error("Greška pri izvozu u Excel: " + error.message);
        }
    };

    return (
        <div className="flex flex-wrap gap-2 mb-6 no-print justify-end items-center">
            <Button
                variant="outline"
                size="sm"
                onClick={handleExcelExport}
                className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
            >
                <FileSpreadsheet className="h-4 w-4" /> Izvoz u Excel
            </Button>

            {pdfDocument && (
                <PDFDownloadLink
                    document={pdfDocument}
                    fileName={`${pdfFileName || excelFileName}_${format(new Date(), "yyyy-MM-dd")}.pdf`}
                >
                    {({ loading }: { loading: boolean }) => (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={loading}
                            className="flex items-center gap-1.5 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <FileText className="h-4 w-4" />
                            )}
                            Preuzmi PDF
                        </Button>
                    )}
                </PDFDownloadLink>
            )}
        </div>
    );
}

// Back to hub navigation header
interface ReportPageNavProps {
    title: string;
}

export function ReportPageNav({ title }: ReportPageNavProps) {
    const [, setLocation] = useLocation();

    return (
        <div className="flex items-center gap-3 mb-6 no-print">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation("/admin/reports")}
                title="Povratak na izvještaje"
            >
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
                <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
                <p className="text-xs text-muted-foreground">Admin panel / Izvještaji</p>
            </div>
        </div>
    );
}
