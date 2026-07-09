import { Document, Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";
import { format } from "date-fns";

// Register custom font to support Latin diacritics in PDF
Font.register({
    family: "Roboto",
    src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf"
});
Font.register({
    family: "Roboto-Bold",
    src: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf"
});

// Stylesheet for A4 documents in PDF
const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontSize: 9,
        fontFamily: "Roboto",
        color: "#333333",
        lineHeight: 1.4,
    },
    headerContainer: {
        borderBottom: "1px solid #CCCCCC",
        paddingBottom: 15,
        marginBottom: 20,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
    },
    logo: {
        height: 35,
        width: 100,
        objectFit: "contain",
        marginBottom: 5,
    },
    headerLeft: {
        flexDirection: "column",
    },
    headerRight: {
        flexDirection: "column",
        alignItems: "flex-end",
    },
    title: {
        fontSize: 16,
        fontFamily: "Roboto-Bold",
        color: "#0f172a",
        marginBottom: 5,
    },
    subtitle: {
        fontSize: 9,
        color: "#64748b",
    },
    metaTitle: {
        fontSize: 9,
        fontFamily: "Roboto-Bold",
        color: "#334155",
        marginBottom: 3,
    },
    metaText: {
        fontSize: 8,
        color: "#64748b",
    },
    summaryContainer: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 15,
        padding: 10,
        backgroundColor: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 4,
        marginBottom: 15,
    },
    summaryItem: {
        flexDirection: "row",
        gap: 4,
    },
    summaryLabel: {
        fontFamily: "Roboto-Bold",
        color: "#334155",
    },
    summaryValue: {
        color: "#0284c7",
        fontFamily: "Roboto-Bold",
    },
    table: {
        width: "auto",
        borderStyle: "solid",
        borderWidth: 0,
        marginBottom: 15,
    },
    tableRow: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: "#e2e8f0",
        minHeight: 22,
        alignItems: "center",
    },
    tableHeaderRow: {
        flexDirection: "row",
        backgroundColor: "#f1f5f9",
        borderBottomWidth: 1,
        borderBottomColor: "#94a3b8",
        minHeight: 22,
        alignItems: "center",
    },
    tableCellHeader: {
        fontFamily: "Roboto-Bold",
        color: "#1e293b",
        padding: 4,
    },
    tableCell: {
        padding: 4,
        color: "#334155",
    },
    boldCell: {
        fontFamily: "Roboto-Bold",
    },
    footerContainer: {
        position: "absolute",
        bottom: 30,
        left: 40,
        right: 40,
        borderTop: "1px solid #e2e8f0",
        paddingTop: 10,
        flexDirection: "row",
        justifyContent: "space-between",
        fontSize: 7,
        color: "#94a3b8",
    },
});

// Common PDF Shell Layout
interface PdfShellProps {
    title: string;
    dateFrom?: string;
    dateTo?: string;
    marinaName: string;
    marinaLogo?: string;
    summaryItems?: { label: string; value: string | number }[];
    children: React.ReactNode;
}

export function PdfShell({ title, dateFrom, dateTo, marinaName, marinaLogo, summaryItems = [], children }: PdfShellProps) {
    return (
        <Document>
            <Page size="A4" orientation="portrait" style={styles.page}>
                {/* Header */}
                <View style={styles.headerContainer} fixed>
                    <View style={styles.headerLeft}>
                        {marinaLogo ? (
                            <Image src={marinaLogo} style={styles.logo} />
                        ) : (
                            <Text style={[styles.title, { fontSize: 13, color: "#0284c7" }]}>⚓ {marinaName}</Text>
                        )}
                        <Text style={styles.title}>{title}</Text>
                        {(dateFrom || dateTo) && (
                            <Text style={styles.subtitle}>
                                Razdoblje: {dateFrom ? format(new Date(dateFrom), "dd.MM.yyyy") : ""} 
                                {dateTo ? ` – ${format(new Date(dateTo), "dd.MM.yyyy")}` : ""}
                            </Text>
                        )}
                    </View>
                    <View style={styles.headerRight}>
                        <Text style={styles.metaTitle}>{marinaName}</Text>
                        <Text style={styles.metaText}>Izrađeno: {format(new Date(), "dd.MM.yyyy HH:mm")}</Text>
                    </View>
                </View>

                {/* Summary */}
                {summaryItems.length > 0 && (
                    <View style={styles.summaryContainer}>
                        {summaryItems.map((item, idx) => (
                            <View key={idx} style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>{item.label}:</Text>
                                <Text style={styles.summaryValue}>{item.value}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Main data content */}
                {children}

                {/* Footer */}
                <View style={styles.footerContainer} fixed>
                    <Text>{marinaName} — Sustav Izvještaja</Text>
                    <Text render={({ pageNumber, totalPages }) => `Stranica ${pageNumber} od ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}

// 📋 REP-01 PDF Document template
export function CraneSchedulePdf({ data, dateFrom, dateTo, marinaName, marinaLogo }: { data: any[]; dateFrom?: string; dateTo?: string; marinaName: string; marinaLogo?: string }) {
    return (
        <PdfShell
            title="Plan rada dizalica"
            dateFrom={dateFrom}
            dateTo={dateTo}
            marinaName={marinaName}
            marinaLogo={marinaLogo}
            summaryItems={[
                { label: "Ukupno rezervacija", value: data.length },
                { label: "Planirano sati", value: (data.reduce((acc, curr) => acc + (curr.durationMin || 0), 0) / 60).toFixed(1) + " h" }
            ]}
        >
            <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableCellHeader, { width: "10%" }]}>Datum</Text>
                    <Text style={[styles.tableCellHeader, { width: "10%" }]}>Vrijeme</Text>
                    <Text style={[styles.tableCellHeader, { width: "22%" }]}>Klijent (OIB)</Text>
                    <Text style={[styles.tableCellHeader, { width: "23%" }]}>Plovilo (Reg)</Text>
                    <Text style={[styles.tableCellHeader, { width: "15%" }]}>Radnja</Text>
                    <Text style={[styles.tableCellHeader, { width: "12%" }]}>Dizalica</Text>
                    <Text style={[styles.tableCellHeader, { width: "8%" }]}>Status</Text>
                </View>
                {data.map((item, idx) => (
                    <View key={idx} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: "10%" }]}>
                            {item.scheduledStart ? format(new Date(item.scheduledStart), "dd.MM.yy") : "-"}
                        </Text>
                        <Text style={[styles.tableCell, { width: "10%" }]}>
                            {item.scheduledStart ? format(new Date(item.scheduledStart), "HH:mm") : "-"}
                        </Text>
                        <Text style={[styles.tableCell, { width: "22%" }]}>
                            {item.clientName || "—"}{"\n"}
                            <Text style={{ fontSize: 7, color: "#64748b" }}>OIB: {item.userOib || "—"}</Text>
                        </Text>
                        <Text style={[styles.tableCell, { width: "23%" }]}>
                            {item.vesselName || "—"}{"\n"}
                            <Text style={{ fontSize: 7, color: "#64748b" }}>Reg: {item.vesselRegistration || "—"}</Text>
                        </Text>
                        <Text style={[styles.tableCell, { width: "15%" }]}>{item.serviceTypeName || item.operationType || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "12%" }]}>{item.craneName || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "8%", textTransform: "capitalize" }]}>{item.status}</Text>
                    </View>
                ))}
            </View>
        </PdfShell>
    );
}

// 📊 REP-02 PDF Document template
export function CraneUtilizationPdf({ data, summaries, dateFrom, dateTo, marinaName, marinaLogo }: { data: any[]; summaries: any[]; dateFrom?: string; dateTo?: string; marinaName: string; marinaLogo?: string }) {
    return (
        <PdfShell
            title="Korištenje dizalica"
            dateFrom={dateFrom}
            dateTo={dateTo}
            marinaName={marinaName}
            marinaLogo={marinaLogo}
            summaryItems={[
                { label: "Ukupno dovršenih operacija", value: data.length },
                { label: "Sveukupno radnih sati", value: (data.reduce((acc, curr) => acc + (curr.durationMin || 0), 0) / 60).toFixed(1) + " h" }
            ]}
        >
            {/* Summaries by Crane */}
            <Text style={[styles.metaTitle, { marginTop: 10, marginBottom: 5, fontSize: 11 }]}>Sažetak rada po dizalicama</Text>
            <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableCellHeader, { width: "40%" }]}>Naziv dizalice</Text>
                    <Text style={[styles.tableCellHeader, { width: "20%" }]}>Broj operacija</Text>
                    <Text style={[styles.tableCellHeader, { width: "20%" }]}>Ukupno sati</Text>
                    <Text style={[styles.tableCellHeader, { width: "20%" }]}>Prosj. trajanje</Text>
                </View>
                {summaries.map((s, idx) => (
                    <View key={idx} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: "40%", fontFamily: "Roboto-Bold" }]}>{s.craneName || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "20%" }]}>{s.totalOperations}</Text>
                        <Text style={[styles.tableCell, { width: "20%" }]}>{(s.totalMinutes / 60).toFixed(1)} h</Text>
                        <Text style={[styles.tableCell, { width: "20%" }]}>{s.avgMinutes} min</Text>
                    </View>
                ))}
            </View>

            {/* Details */}
            <Text style={[styles.metaTitle, { marginTop: 15, marginBottom: 5, fontSize: 11 }]}>Popis odrađenih operacija</Text>
            <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableCellHeader, { width: "12%" }]}>Datum</Text>
                    <Text style={[styles.tableCellHeader, { width: "12%" }]}>Dizalica</Text>
                    <Text style={[styles.tableCellHeader, { width: "23%" }]}>Klijent (OIB)</Text>
                    <Text style={[styles.tableCellHeader, { width: "23%" }]}>Plovilo (Reg)</Text>
                    <Text style={[styles.tableCellHeader, { width: "20%" }]}>Radnja</Text>
                    <Text style={[styles.tableCellHeader, { width: "10%" }]}>Trajanje</Text>
                </View>
                {data.map((item, idx) => (
                    <View key={idx} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: "12%" }]}>
                            {item.scheduledStart ? format(new Date(item.scheduledStart), "dd.MM.yyyy") : "-"}
                        </Text>
                        <Text style={[styles.tableCell, { width: "12%" }]}>{item.craneName || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "23%" }]}>
                            {item.clientName || "—"}{"\n"}
                            <Text style={{ fontSize: 7, color: "#64748b" }}>OIB: {item.userOib || "—"}</Text>
                        </Text>
                        <Text style={[styles.tableCell, { width: "23%" }]}>
                            <Text style={{ fontSize: 7, color: "#64748b" }}>Reg: {item.vesselRegistration || "—"}</Text>
                        </Text>
                        <Text style={[styles.tableCell, { width: "20%" }]}>{item.serviceTypeName || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "10%" }]}>{item.durationMin} min</Text>
                    </View>
                ))}
            </View>
        </PdfShell>
    );
}

// 👥 REP-03 PDF Document template
export function UserActivityPdf({ data, summaries, dateFrom, dateTo, marinaName, marinaLogo }: { data: any[]; summaries: any[]; dateFrom?: string; dateTo?: string; marinaName: string; marinaLogo?: string }) {
    return (
        <PdfShell
            title="Aktivnost korisnika"
            dateFrom={dateFrom}
            dateTo={dateTo}
            marinaName={marinaName}
            marinaLogo={marinaLogo}
            summaryItems={[
                { label: "Ukupno aktivnih klijenata", value: summaries.length },
                { label: "Ukupno zahtjeva", value: summaries.reduce((acc, curr) => acc + (curr.totalRequests || 0), 0) }
            ]}
        >
            <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableCellHeader, { width: "15%" }]}>OIB</Text>
                    <Text style={[styles.tableCellHeader, { width: "25%" }]}>Ime i prezime</Text>
                    <Text style={[styles.tableCellHeader, { width: "25%" }]}>Email adresa</Text>
                    <Text style={[styles.tableCellHeader, { width: "10%" }]}>Zahtjevi</Text>
                    <Text style={[styles.tableCellHeader, { width: "15%" }]}>Dovršeno / Otkaz</Text>
                    <Text style={[styles.tableCellHeader, { width: "10%" }]}>Sati rada</Text>
                </View>
                {summaries.map((s, idx) => (
                    <View key={idx} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: "15%", fontFamily: "Roboto-Bold" }]}>{s.oib || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "25%" }]}>{s.clientName || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "25%" }]}>{s.email || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "10%" }]}>{s.totalRequests}</Text>
                        <Text style={[styles.tableCell, { width: "15%" }]}>{s.completedRequests} / {s.cancelledRequests}</Text>
                        <Text style={[styles.tableCell, { width: "10%" }]}>{(s.totalMinutes / 60).toFixed(1)} h</Text>
                    </View>
                ))}
            </View>
        </PdfShell>
    );
}

// 🔧 REP-04 PDF Document template
export function OperationTypesPdf({ data, summaries, dateFrom, dateTo, marinaName, marinaLogo }: { data: any[]; summaries: any[]; dateFrom?: string; dateTo?: string; marinaName: string; marinaLogo?: string }) {
    return (
        <PdfShell
            title="Analitika tipova operacija"
            dateFrom={dateFrom}
            dateTo={dateTo}
            marinaName={marinaName}
            marinaLogo={marinaLogo}
            summaryItems={[
                { label: "Ukupno odrađeno", value: data.length },
                { label: "Ukupno sati rada", value: (data.reduce((acc, curr) => acc + (curr.durationMin || 0), 0) / 60).toFixed(1) + " h" }
            ]}
        >
            {/* Summaries by Operation Type */}
            <Text style={[styles.metaTitle, { marginTop: 10, marginBottom: 5, fontSize: 11 }]}>Sažetak po tipu operacije</Text>
            <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableCellHeader, { width: "40%" }]}>Tip operacije</Text>
                    <Text style={[styles.tableCellHeader, { width: "20%" }]}>Broj operacija</Text>
                    <Text style={[styles.tableCellHeader, { width: "20%" }]}>Ukupno sati</Text>
                    <Text style={[styles.tableCellHeader, { width: "20%" }]}>Prosj. trajanje</Text>
                </View>
                {summaries.map((s, idx) => (
                    <View key={idx} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: "40%", fontFamily: "Roboto-Bold" }]}>{s.serviceTypeName || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "20%" }]}>{s.count}</Text>
                        <Text style={[styles.tableCell, { width: "20%" }]}>{(s.totalMinutes / 60).toFixed(1)} h</Text>
                        <Text style={[styles.tableCell, { width: "20%" }]}>{s.avgMinutes} min</Text>
                    </View>
                ))}
            </View>
        </PdfShell>
    );
}

// 🏗️ REP-05 PDF Document template
export function LandOccupancyPdf({ data, statusLabel, marinaName, marinaLogo }: { data: any[]; statusLabel: string; marinaName: string; marinaLogo?: string }) {
    return (
        <PdfShell
            title={`Izvještaj o plovilima na kopnu (${statusLabel})`}
            marinaName={marinaName}
            marinaLogo={marinaLogo}
            summaryItems={[
                { label: "Ukupno plovila na popisu", value: data.length }
            ]}
        >
            <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableCellHeader, { width: "12%" }]}>OIB</Text>
                    <Text style={[styles.tableCellHeader, { width: "20%" }]}>Klijent</Text>
                    <Text style={[styles.tableCellHeader, { width: "22%" }]}>Plovilo (Reg)</Text>
                    <Text style={[styles.tableCellHeader, { width: "12%" }]}>Zona (Mjestо)</Text>
                    <Text style={[styles.tableCellHeader, { width: "12%" }]}>Dizano</Text>
                    <Text style={[styles.tableCellHeader, { width: "12%" }]}>Spušteno</Text>
                    <Text style={[styles.tableCellHeader, { width: "10%" }]}>Dani</Text>
                </View>
                {data.map((item, idx) => {
                    const days = item.returnedAt 
                        ? Math.ceil((new Date(item.returnedAt).getTime() - new Date(item.liftedAt).getTime()) / (1000 * 60 * 60 * 24))
                        : Math.ceil((new Date().getTime() - new Date(item.liftedAt).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                        <View key={idx} style={styles.tableRow}>
                            <Text style={[styles.tableCell, { width: "12%" }]}>{item.clientOib || "—"}</Text>
                            <Text style={[styles.tableCell, { width: "20%" }]}>{item.clientName || "—"}</Text>
                            <Text style={[styles.tableCell, { width: "22%" }]}>
                                {item.vesselName || "—"}{"\n"}
                                <Text style={{ fontSize: 7, color: "#64748b" }}>Reg: {item.vesselRegistration || "—"}</Text>
                            </Text>
                            <Text style={[styles.tableCell, { width: "12%" }]}>{item.zoneName || "—"} ({item.spotNumber || "—"})</Text>
                            <Text style={[styles.tableCell, { width: "12%" }]}>{format(new Date(item.liftedAt), "dd.MM.yy")}</Text>
                            <Text style={[styles.tableCell, { width: "12%" }]}>{item.returnedAt ? format(new Date(item.returnedAt), "dd.MM.yy") : item.hasLaunchReservation ? "Najava spuštanja" : "Na kopnu"}</Text>
                            <Text style={[styles.tableCell, { width: "10%", fontFamily: "Roboto-Bold" }]}>{days} d</Text>
                        </View>
                    );
                })}
            </View>
        </PdfShell>
    );
}

// 📑 REP-06 PDF Document template
export function WaitingListPdf({ data, statusLabel, marinaName, marinaLogo }: { data: any[]; statusLabel: string; marinaName: string; marinaLogo?: string }) {
    return (
        <PdfShell
            title={`Pregled liste čekanja (${statusLabel})`}
            marinaName={marinaName}
            marinaLogo={marinaLogo}
            summaryItems={[
                { label: "Broj klijenata u redu", value: data.length }
            ]}
        >
            <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableCellHeader, { width: "8%" }]}>Poz.</Text>
                    <Text style={[styles.tableCellHeader, { width: "14%" }]}>OIB</Text>
                    <Text style={[styles.tableCellHeader, { width: "22%" }]}>Klijent</Text>
                    <Text style={[styles.tableCellHeader, { width: "22%" }]}>Plovilo (Reg)</Text>
                    <Text style={[styles.tableCellHeader, { width: "18%" }]}>Radnja</Text>
                    <Text style={[styles.tableCellHeader, { width: "16%" }]}>Željeni datum</Text>
                </View>
                {data.map((item, idx) => (
                    <View key={idx} style={styles.tableRow}>
                        <Text style={[styles.tableCell, { width: "8%", fontFamily: "Roboto-Bold", color: "#0284c7" }]}>#{item.position}</Text>
                        <Text style={[styles.tableCell, { width: "14%" }]}>{item.clientOib || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "22%" }]}>{item.clientName || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "22%" }]}>
                            {item.vesselName || "—"}{"\n"}
                            <Text style={{ fontSize: 7, color: "#64748b" }}>Reg: {item.vesselRegistration || "—"}</Text>
                        </Text>
                        <Text style={[styles.tableCell, { width: "18%" }]}>{item.serviceTypeName || "—"}</Text>
                        <Text style={[styles.tableCell, { width: "16%" }]}>{item.requestedDate ? format(new Date(item.requestedDate), "dd.MM.yyyy") : "—"}</Text>
                    </View>
                ))}
            </View>
        </PdfShell>
    );
}
