import pdfMake from "../pdfmake";
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { hr } from "date-fns/locale";
import type { TDocumentDefinitions, Content, TableCell } from "pdfmake/interfaces";

export interface GeneratePdfOptions {
    reportType: "daily" | "weekly" | "monthly";
    selectedDate: Date;
    effectiveFrom: string;
    effectiveTo: string;
    cranes: any[];
    reservations: any[];
    workStart?: string;
    workEnd?: string;
    marinaName?: string;
}

const safeParseDate = (d: any): Date => {
    if (!d) return new Date(NaN);
    if (d instanceof Date) return d;
    if (typeof d === "string") return new Date(d.replace(" ", "T"));
    return new Date(d);
};

const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

export function exportSchedulePdf(options: GeneratePdfOptions) {
    const {
        reportType,
        selectedDate,
        effectiveFrom,
        effectiveTo,
        cranes,
        reservations,
        workStart = "08:00",
        workEnd = "16:00",
        marinaName = "PŠD Špinut",
    } = options;

    const fromDate = safeParseDate(effectiveFrom);
    const toDate = safeParseDate(effectiveTo);

    const totalOps = reservations.filter(r => !r.isMaintenance).length;
    const totalMaint = reservations.filter(r => r.isMaintenance).length;
    const totalHours = (reservations.reduce((acc, curr) => acc + (curr.durationMin || 60), 0) / 60).toFixed(1);

    // Period Banner String
    let periodText = "";
    let reportTitle = "";

    if (reportType === "daily") {
        reportTitle = "DNEVNI PLAN RADA DIZALICA";
        periodText = `Datum: ${format(selectedDate, "dd.MM.yyyy. (EEEE)", { locale: hr })}`;
    } else if (reportType === "weekly") {
        reportTitle = "TJEDNI PLAN RADA DIZALICA";
        periodText = `Razdoblje: ${format(fromDate, "dd.MM.yyyy.")} – ${format(toDate, "dd.MM.yyyy.")}`;
    } else {
        reportTitle = "MJESEČNI PLAN RADA DIZALICA";
        periodText = `Razdoblje: ${format(selectedDate, "LLLL yyyy.", { locale: hr })} (${format(fromDate, "dd.MM.yyyy.")} – ${format(toDate, "dd.MM.yyyy.")})`;
    }

    // Build Content elements
    const content: Content[] = [
        // Title Block
        {
            columns: [
                {
                    width: "*",
                    stack: [
                        { text: marinaName, fontSize: 13, bold: true, color: "#0284c7" },
                        { text: reportTitle, fontSize: 16, bold: true, color: "#0f172a", margin: [0, 2, 0, 2] },
                        { text: periodText, fontSize: 10, color: "#475569" },
                    ]
                },
                {
                    width: "auto",
                    stack: [
                        { text: `Izrađeno: ${format(new Date(), "dd.MM.yyyy. HH:mm")}`, fontSize: 8, color: "#64748b", alignment: "right" },
                        { text: `Ukupno stavki: ${reservations.length}`, fontSize: 9, bold: true, color: "#334155", alignment: "right", margin: [0, 4, 0, 0] },
                    ]
                }
            ],
            margin: [0, 0, 0, 12]
        },

        // Summary Bar Table
        {
            table: {
                widths: ["*", "*", "*"],
                body: [
                    [
                        { text: `Ukupno operacija: ${totalOps}`, bold: true, fontSize: 9, color: "#0369a1", alignment: "center" },
                        { text: `Održavanje / Blokade: ${totalMaint}`, bold: true, fontSize: 9, color: "#b45309", alignment: "center" },
                        { text: `Planirano sati: ${totalHours} h`, bold: true, fontSize: 9, color: "#047857", alignment: "center" },
                    ]
                ]
            },
            layout: {
                fillColor: () => "#f8fafc",
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => "#e2e8f0",
                vLineColor: () => "#e2e8f0",
            },
            margin: [0, 0, 0, 15]
        }
    ];

    // Main Table Construction based on reportType
    if (reportType === "daily") {
        const activeCranes = cranes.slice(0, 3);
        const startHour = parseInt(workStart.split(":")[0]) || 8;
        const endHour = parseInt(workEnd.split(":")[0]) || 16;
        const slots: { h: number; m: number }[] = [];
        for (let h = startHour; h < endHour; h++) {
            slots.push({ h, m: 0 });
            slots.push({ h, m: 30 });
        }

        const tableBody: any[][] = [];

        // Header row
        const headerRow: any[] = [
            { text: "Termin", bold: true, fontSize: 8, alignment: "center", fillColor: "#f1f5f9" }
        ];

        for (let i = 0; i < 3; i++) {
            const crane = activeCranes[i];
            headerRow.push({
                text: crane ? crane.name : `Dizalica ${i + 1}`,
                bold: true,
                fontSize: 8,
                alignment: "center",
                fillColor: "#f1f5f9"
            });
        }
        tableBody.push(headerRow);

        // 30-minute slot rows
        slots.forEach(({ h, m }) => {
            const nextM = m === 30 ? 0 : 30;
            const nextH = m === 30 ? h + 1 : h;
            const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} - ${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;

            const row: any[] = [
                { text: timeStr, bold: true, fontSize: 7, alignment: "center", margin: [0, 2, 0, 2] }
            ];

            for (let colIdx = 0; colIdx < 3; colIdx++) {
                const crane = activeCranes[colIdx];
                if (!crane) {
                    row.push({ text: "—", fontSize: 7, alignment: "center", color: "#94a3b8" });
                    continue;
                }

                const slotItems = reservations.filter((r: any) => {
                    if (r.craneId !== crane.id || !r.scheduledStart) return false;
                    const rDate = safeParseDate(r.scheduledStart);
                    const sH = rDate.getHours();
                    const sM = rDate.getMinutes();
                    return isSameDay(rDate, selectedDate) && sH === h && Math.floor(sM / 30) * 30 === m;
                });

                if (slotItems.length > 0) {
                    const stackContent: any[] = slotItems.map((item: any) => ({
                        stack: [
                            { text: `${item.clientName || "Klijent"}`, bold: true, fontSize: 7, color: item.isMaintenance ? "#9a3412" : "#0f172a" },
                            { text: `Plovilo: ${item.vesselName || "—"} (${item.vesselRegistration || "—"})${item.landZoneCode ? ` • Vez: ${item.landZoneCode}` : ""}`, fontSize: 6, color: "#475569" },
                            { text: item.serviceTypeName || "Radnja", bold: true, fontSize: 6, color: item.isMaintenance ? "#c2410c" : "#0284c7" },
                            ...(item.adminNote ? [{ text: `Napom: ${item.adminNote}`, fontSize: 5.5, italics: true, color: "#64748b" }] : [])
                        ],
                        margin: [0, 1, 0, 1]
                    }));
                    row.push({ stack: stackContent });
                } else {
                    row.push({ text: "—", fontSize: 7, color: "#cbd5e1", alignment: "center", margin: [0, 2, 0, 2] });
                }
            }

            tableBody.push(row);
        });

        content.push({
            table: {
                headerRows: 1,
                widths: ["14%", "28.6%", "28.6%", "28.6%"],
                body: tableBody
            },
            layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => "#cbd5e1",
                vLineColor: () => "#cbd5e1",
            }
        });

    } else if (reportType === "weekly") {
        const days = eachDayOfInterval({ start: fromDate, end: toDate });
        const tableBody: any[][] = [];

        // Header Row
        const headerRow: any[] = [
            { text: "Dizalica", bold: true, fontSize: 8, alignment: "left", fillColor: "#f1f5f9" }
        ];

        days.forEach(day => {
            headerRow.push({
                text: `${format(day, "EEEE", { locale: hr })}\n${format(day, "dd.MM.")}`,
                bold: true,
                fontSize: 7,
                alignment: "center",
                fillColor: "#f1f5f9"
            });
        });
        tableBody.push(headerRow);

        // Crane Rows
        cranes.forEach(crane => {
            const row: any[] = [
                { text: crane.name, bold: true, fontSize: 8, margin: [0, 4, 0, 4] }
            ];

            days.forEach(day => {
                const dayItems = reservations.filter((r: any) => {
                    if (r.craneId !== crane.id || !r.scheduledStart) return false;
                    return isSameDay(safeParseDate(r.scheduledStart), day);
                });

                if (dayItems.length > 0) {
                    const cellStack: any[] = dayItems.map((item: any) => {
                        const timeStr = item.scheduledStart ? format(safeParseDate(item.scheduledStart), "HH:mm") : "";
                        return {
                            stack: [
                                { text: `${timeStr} ${item.clientName || "Klijent"}`, bold: true, fontSize: 7, color: item.isMaintenance ? "#9a3412" : "#0f172a" },
                                { text: `${item.vesselName || ""} (${item.vesselRegistration || "—"})`, fontSize: 6, color: "#475569" },
                                { text: item.serviceTypeName || "", bold: true, fontSize: 6, color: item.isMaintenance ? "#c2410c" : "#0284c7" }
                            ],
                            margin: [0, 2, 0, 2]
                        };
                    });
                    row.push({ stack: cellStack });
                } else {
                    row.push({ text: "—", fontSize: 7, color: "#cbd5e1", alignment: "center", margin: [0, 4, 0, 4] });
                }
            });

            tableBody.push(row);
        });

        const dayColWidth = "12.4%";
        content.push({
            table: {
                headerRows: 1,
                widths: ["13%", dayColWidth, dayColWidth, dayColWidth, dayColWidth, dayColWidth, dayColWidth, dayColWidth],
                body: tableBody
            },
            layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => "#cbd5e1",
                vLineColor: () => "#cbd5e1",
            }
        });

    } else {
        // Monthly view table
        const tableBody: TableCell[][] = [];

        // Header
        tableBody.push([
            { text: "Datum", bold: true, fontSize: 8, fillColor: "#f1f5f9" },
            { text: "Vrijeme", bold: true, fontSize: 8, fillColor: "#f1f5f9" },
            { text: "Klijent (OIB)", bold: true, fontSize: 8, fillColor: "#f1f5f9" },
            { text: "Plovilo (Registracija)", bold: true, fontSize: 8, fillColor: "#f1f5f9" },
            { text: "Radnja", bold: true, fontSize: 8, fillColor: "#f1f5f9" },
            { text: "Dizalica", bold: true, fontSize: 8, fillColor: "#f1f5f9" },
            { text: "Status", bold: true, fontSize: 8, fillColor: "#f1f5f9" },
        ]);

        reservations.forEach((item: any) => {
            const startDateObj = item.scheduledStart ? safeParseDate(item.scheduledStart) : null;
            const dateStr = startDateObj ? format(startDateObj, "dd.MM.yyyy.") : "—";
            const timeStr = startDateObj ? format(startDateObj, "HH:mm") : "—";

            tableBody.push([
                { text: dateStr, fontSize: 8 },
                { text: timeStr, bold: true, fontSize: 8 },
                {
                    stack: [
                        { text: item.clientName || "—", bold: true, fontSize: 8 },
                        { text: `OIB: ${item.userOib || "—"}`, fontSize: 7, color: "#64748b" }
                    ]
                },
                {
                    stack: [
                        { text: item.vesselName || "—", fontSize: 8 },
                        { text: `Reg: ${item.vesselRegistration || "—"}`, fontSize: 7, color: "#64748b" }
                    ]
                },
                { text: item.serviceTypeName || "—", bold: true, fontSize: 8, color: item.isMaintenance ? "#c2410c" : "#0284c7" },
                { text: item.craneName || "—", fontSize: 8 },
                { text: item.status || "odobreno", fontSize: 8, color: "#334155" },
            ]);
        });

        if (reservations.length === 0) {
            tableBody.push([
                { text: "Nema zabilježenih operacija u odabranom razdoblju.", colSpan: 7, alignment: "center", fontSize: 9, color: "#64748b", margin: [0, 10, 0, 10] },
                {}, {}, {}, {}, {}, {}
            ]);
        }

        content.push({
            table: {
                headerRows: 1,
                widths: ["10%", "8%", "22%", "22%", "18%", "12%", "8%"],
                body: tableBody
            },
            layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => "#cbd5e1",
                vLineColor: () => "#cbd5e1",
            }
        });
    }

    // PDF Document definition
    const docDefinition: TDocumentDefinitions = {
        pageSize: "A4",
        pageOrientation: "landscape",
        pageMargins: [30, 35, 30, 35],

        footer: (currentPage, pageCount) => {
            return {
                columns: [
                    { text: `${marinaName} — Sustav Izvještaja`, fontSize: 8, color: "#64748b", margin: [30, 0, 0, 0] },
                    { text: `Stranica ${currentPage} od ${pageCount}`, fontSize: 8, color: "#64748b", alignment: "right", margin: [0, 0, 30, 0] }
                ]
            };
        },

        content,

        defaultStyle: {
            font: "Roboto"
        }
    };

    // Trigger pdfMake download
    const fileName = `Plan_rada_dizalica_${reportType}_${effectiveFrom}.pdf`;
    pdfMake.createPdf(docDefinition).download(fileName);
}
