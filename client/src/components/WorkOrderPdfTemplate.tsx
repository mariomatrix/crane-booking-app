import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

const styles = StyleSheet.create({
    page: {
        padding: 36,
        fontSize: 10,
        fontFamily: "Helvetica",
        color: "#1e293b",
        lineHeight: 1.4,
    },
    headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        borderBottomWidth: 2,
        borderBottomColor: "#0f172a",
        paddingBottom: 12,
        marginBottom: 16,
    },
    societyTitle: {
        fontSize: 14,
        fontWeight: "bold",
        color: "#0f172a",
        textTransform: "uppercase",
    },
    societySubtitle: {
        fontSize: 8,
        color: "#64748b",
        marginTop: 2,
    },
    docBadge: {
        backgroundColor: "#f1f5f9",
        padding: "6 12",
        borderRadius: 4,
        borderWidth: 1,
        borderColor: "#cbd5e1",
        alignItems: "flex-end",
    },
    docNumber: {
        fontSize: 14,
        fontWeight: "bold",
        color: "#0f172a",
    },
    docDate: {
        fontSize: 8,
        color: "#64748b",
        marginTop: 2,
    },
    sectionTitle: {
        fontSize: 10,
        fontWeight: "bold",
        color: "#0f172a",
        backgroundColor: "#f8fafc",
        padding: "4 8",
        borderLeftWidth: 3,
        borderLeftColor: "#2563eb",
        marginBottom: 8,
        marginTop: 10,
        textTransform: "uppercase",
    },
    grid2: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 8,
    },
    gridCol: {
        flex: 1,
        backgroundColor: "#ffffff",
        padding: 8,
        borderWidth: 1,
        borderColor: "#e2e8f0",
        borderRadius: 4,
    },
    rowItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 2,
        borderBottomWidth: 0.5,
        borderBottomColor: "#f1f5f9",
    },
    label: {
        color: "#64748b",
        fontSize: 9,
    },
    value: {
        fontWeight: "bold",
        fontSize: 9,
        color: "#0f172a",
    },
    table: {
        width: "100%",
        borderWidth: 1,
        borderColor: "#cbd5e1",
        borderRadius: 4,
        marginVertical: 10,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: "#f1f5f9",
        borderBottomWidth: 1,
        borderBottomColor: "#cbd5e1",
        padding: 6,
        fontWeight: "bold",
        fontSize: 8,
        color: "#475569",
    },
    tableRow: {
        flexDirection: "row",
        padding: 6,
        borderBottomWidth: 0.5,
        borderBottomColor: "#e2e8f0",
        fontSize: 9,
    },
    col1: { flex: 4 },
    col2: { flex: 2, textAlign: "right" },
    col3: { flex: 2, textAlign: "right" },
    col4: { flex: 2, textAlign: "right", fontWeight: "bold" },
    notesBox: {
        marginTop: 8,
        padding: 8,
        backgroundColor: "#f8fafc",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        borderRadius: 4,
        minHeight: 40,
    },
    signaturesRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 36,
        paddingTop: 12,
    },
    signBox: {
        width: 180,
        borderTopWidth: 1,
        borderTopColor: "#94a3b8",
        paddingTop: 4,
        alignItems: "center",
    },
    signLabel: {
        fontSize: 8,
        color: "#64748b",
    },
    footerNote: {
        position: "absolute",
        bottom: 24,
        left: 36,
        right: 36,
        fontSize: 7,
        color: "#94a3b8",
        textAlign: "center",
        borderTopWidth: 0.5,
        borderTopColor: "#e2e8f0",
        paddingTop: 6,
    },
});

interface WorkOrderPdfProps {
    order: {
        orderNumber: string;
        startedAt: string | Date;
        completedAt?: string | Date | null;
        actualDurationMin?: number | null;
        clientType: string;
        isStatutoryCovered: boolean;
        chargeItemCode?: string | null;
        chargeItemName?: string | null;
        vesselLengthM?: string | number | null;
        commercialTotal?: string | number | null;
        operatorNotes?: string | null;
        userName?: string | null;
        userOib?: string | null;
        userEmail?: string | null;
        userPhone?: string | null;
        vesselName?: string | null;
        vesselRegistration?: string | null;
        craneName?: string | null;
        operatorName?: string | null;
    };
}

export function WorkOrderPdf({ order }: WorkOrderPdfProps) {
    const isMember = order.clientType === "member";
    const startDateFormatted = order.startedAt ? new Date(order.startedAt).toLocaleString("hr-HR") : "—";
    const completedDateFormatted = order.completedAt ? new Date(order.completedAt).toLocaleString("hr-HR") : "U tijeku";

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.societyTitle}>Pomorsko športsko društvo "Špinut"</Text>
                        <Text style={styles.societySubtitle}>Lučica Špinut, Lučica 7, 21000 Split • OIB: 12345678901</Text>
                        <Text style={styles.societySubtitle}>Sustav evidencije rada dizalica i operativnih naloga</Text>
                    </View>
                    <View style={styles.docBadge}>
                        <Text style={styles.docNumber}>{order.orderNumber || "RN-2026-XXXXX"}</Text>
                        <Text style={styles.docDate}>Datum: {new Date(order.startedAt).toLocaleDateString("hr-HR")}</Text>
                    </View>
                </View>

                {/* Grid 1: Korisnik i Plovilo */}
                <View style={styles.grid2}>
                    <View style={styles.gridCol}>
                        <Text style={[styles.label, { fontWeight: "bold", color: "#0f172a", marginBottom: 4 }]}>PODACI O NARUČITELJU</Text>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Ime i prezime / Naziv:</Text>
                            <Text style={styles.value}>{order.userName || "—"}</Text>
                        </View>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>OIB:</Text>
                            <Text style={styles.value}>{order.userOib || "—"}</Text>
                        </View>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Status korisnika:</Text>
                            <Text style={[styles.value, { color: isMember ? "#059669" : "#2563eb" }]}>
                                {isMember ? "Član PŠD-a" : "Vanjski korisnik"}
                            </Text>
                        </View>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Kontakt telefon:</Text>
                            <Text style={styles.value}>{order.userPhone || "—"}</Text>
                        </View>
                    </View>

                    <View style={styles.gridCol}>
                        <Text style={[styles.label, { fontWeight: "bold", color: "#0f172a", marginBottom: 4 }]}>PODACI O PLOVILU I DIZALICI</Text>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Naziv plovila:</Text>
                            <Text style={styles.value}>{order.vesselName || "—"}</Text>
                        </View>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Registracija:</Text>
                            <Text style={styles.value}>{order.vesselRegistration || "—"}</Text>
                        </View>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Duljina plovila:</Text>
                            <Text style={styles.value}>{order.vesselLengthM ? `${order.vesselLengthM} m` : "—"}</Text>
                        </View>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Dizalica / Operator:</Text>
                            <Text style={styles.value}>{order.craneName || "Dizalica"} / {order.operatorName || "Operater"}</Text>
                        </View>
                    </View>
                </View>

                {/* Vremenski podaci */}
                <Text style={styles.sectionTitle}>Operativno vrijeme i trajanje</Text>
                <View style={styles.grid2}>
                    <View style={styles.gridCol}>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Početak rada:</Text>
                            <Text style={styles.value}>{startDateFormatted}</Text>
                        </View>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Završetak rada:</Text>
                            <Text style={styles.value}>{completedDateFormatted}</Text>
                        </View>
                    </View>
                    <View style={styles.gridCol}>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Stvarno trajanje:</Text>
                            <Text style={styles.value}>{order.actualDurationMin ? `${order.actualDurationMin} min` : "30 min"}</Text>
                        </View>
                        <View style={styles.rowItem}>
                            <Text style={styles.label}>Status naloga:</Text>
                            <Text style={styles.value}>ZAKLJUČENO</Text>
                        </View>
                    </View>
                </View>

                {/* Stavke i obračun */}
                <Text style={styles.sectionTitle}>Stavke i statutarni/financijski status</Text>
                <View style={styles.table}>
                    <View style={styles.tableHeader}>
                        <Text style={styles.col1}>OPIS USLUGE / OPERACIJE</Text>
                        <Text style={styles.col2}>VRSTA PRAVA</Text>
                        <Text style={styles.col3}>ŠIFRA ERP</Text>
                        <Text style={styles.col4}>STATUS OBRAČUNA</Text>
                    </View>

                    {order.isStatutoryCovered ? (
                        <View style={styles.tableRow}>
                            <Text style={styles.col1}>Statutarno pravo korištenja dizalice (vađenje/spuštanje)</Text>
                            <Text style={styles.col2}>Godišnja kvota</Text>
                            <Text style={styles.col3}>STAT-QUOTA</Text>
                            <Text style={[styles.col4, { color: "#059669" }]}>0,00 € (Članarina)</Text>
                        </View>
                    ) : isMember ? (
                        <View style={styles.tableRow}>
                            <Text style={styles.col1}>{order.chargeItemName || "Korištenje dizalice 9T"}</Text>
                            <Text style={styles.col2}>Doplata članarine</Text>
                            <Text style={styles.col3}>{order.chargeItemCode || "USL-D9T"}</Text>
                            <Text style={[styles.col4, { color: "#b91c1c" }]}>Zaduženje za ERP</Text>
                        </View>
                    ) : (
                        <View style={styles.tableRow}>
                            <Text style={styles.col1}>Komercijalno korištenje dizalice ({order.vesselLengthM || '8.0'} m)</Text>
                            <Text style={styles.col2}>Vanjski cjenik</Text>
                            <Text style={styles.col3}>USL-VANJSKI-M</Text>
                            <Text style={[styles.col4, { color: "#1d4ed8" }]}>{order.commercialTotal || '0.00'} EUR</Text>
                        </View>
                    )}
                </View>

                {/* Napomene */}
                <Text style={styles.sectionTitle}>Napomene operatera na terenu</Text>
                <View style={styles.notesBox}>
                    <Text style={{ fontSize: 8.5, color: "#334155" }}>
                        {order.operatorNotes || "Nema posebnih tehničkih zapažanja. Radnja izvršena sukladno sigurnosnim pravilima lučice."}
                    </Text>
                </View>

                {/* Potpisi */}
                <View style={styles.signaturesRow}>
                    <View style={styles.signBox}>
                        <Text style={styles.signLabel}>Potpis operatera dizalice</Text>
                    </View>
                    <View style={styles.signBox}>
                        <Text style={styles.signLabel}>Potpis vlasnika / preuzimatelja plovila</Text>
                    </View>
                </View>

                {/* Footer */}
                <Text style={styles.footerNote}>
                    Ovaj dokument je službena evidencija Pomorskog športskog društva "Špinut". Podaci se automatski arhiviraju u karton korisnika i prosljeđuju u sustav knjiženja članarina / fakturiranja.
                </Text>
            </Page>
        </Document>
    );
}
