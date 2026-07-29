import { useState } from "react";
import { useLang } from "@/contexts/LangContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
    Loader2,
    Search,
    Shield,
    UserCheck,
    UserPlus,
    KeyRound,
    Trash2,
    Copy,
    CheckCircle2,
    UserX,
} from "lucide-react";
import { format } from "date-fns";
import { hr } from "date-fns/locale";

export default function AdminStaff() {
    const { t } = useLang();
    const utils = trpc.useUtils();

    // Filters & Pagination
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState<string>("staff"); // "staff", "admin", "operator"

    // Dialog states
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);

    // Form state for creating staff
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [role, setRole] = useState<"operator" | "admin">("operator");

    // Action dialog states
    const [resetUser, setResetUser] = useState<any | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [deleteUser, setDeleteUser] = useState<any | null>(null);

    // Fetch staff users
    const staffQuery = trpc.user.list.useQuery({
        page,
        pageSize: 50,
        search: search || undefined,
        role: roleFilter,
    });

    const createStaffMutation = trpc.user.createStaff.useMutation({
        onSuccess: (data) => {
            toast.success("Korisnički račun osoblja uspješno kreiran!");
            setCreatedTempPassword(data.tempPassword || null);
            setShowCreateDialog(false);
            resetForm();
            utils.user.list.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message || "Greška pri kreiranju korisnika.");
        },
    });

    const setRoleMutation = trpc.user.setRole.useMutation({
        onSuccess: () => {
            toast.success("Uloga korisnika uspješno promijenjena.");
            utils.user.list.invalidate();
        },
        onError: (err) => {
            toast.error(err.message || "Greška pri promjeni role.");
        },
    });

    const adminResetPassword = trpc.user.resetPassword.useMutation({
        onSuccess: () => {
            toast.success("Lozinka je uspješno promijenjena.");
            setResetUser(null);
            setNewPassword("");
        },
        onError: (err) => {
            toast.error(err.message || "Greška pri promjeni lozinke.");
        },
    });

    const adminDeleteUser = trpc.user.delete.useMutation({
        onSuccess: () => {
            toast.success("Korisnik je uspješno obrisan.");
            setDeleteUser(null);
            utils.user.list.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message || "Greška pri brisanju korisnika.");
        },
    });

    const resetForm = () => {
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
        setRole("operator");
    };

    const handleCreateStaff = () => {
        if (!firstName.trim()) {
            toast.error("Unesite ime.");
            return;
        }
        if (!email.trim() || !email.includes("@")) {
            toast.error("Unesite ispravnu email adresu (korisničko ime).");
            return;
        }
        if (!phone.trim()) {
            toast.error("Unesite mobitel/telefon.");
            return;
        }

        createStaffMutation.mutate({
            firstName: firstName.trim(),
            lastName: lastName.trim() || undefined,
            email: email.trim(),
            phone: phone.trim(),
            role,
        });
    };

    const usersList = staffQuery.data?.data || [];
    const totalUsers = staffQuery.data?.total || 0;

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Shield className="h-6 w-6 text-primary" />
                        Operateri i administratori
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Evidencija i upravljanje pristupnim računima operatera dizalica i administratora sustava.
                    </p>
                </div>
                <Button
                    onClick={() => setShowCreateDialog(true)}
                    className="flex items-center gap-2 shadow-sm font-semibold"
                >
                    <UserPlus className="h-4 w-4" />
                    Dodaj operatera / administratora
                </Button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border">
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Pretraži po imenu, emailu ili telefonu..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        className="pl-9 h-9 text-xs bg-white dark:bg-card"
                    />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="w-44">
                        <Select
                            value={roleFilter}
                            onValueChange={(val) => {
                                setRoleFilter(val);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="h-9 text-xs bg-white dark:bg-card">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="staff">Svi</SelectItem>
                                <SelectItem value="operator">Operateri</SelectItem>
                                <SelectItem value="admin">Administratori</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Badge variant="outline" className="h-9 px-3 text-xs bg-white dark:bg-card font-medium">
                        Ukupno: {totalUsers}
                    </Badge>
                </div>
            </div>

            {/* Table */}
            <div className="border rounded-xl bg-white dark:bg-card shadow-sm overflow-hidden">
                {staffQuery.isLoading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead>Osoba / Ime i prezime</TableHead>
                                <TableHead>Korisničko ime (Email)</TableHead>
                                <TableHead>Mobitel / Telefon</TableHead>
                                <TableHead>Uloga</TableHead>
                                <TableHead>Zadnja prijava</TableHead>
                                <TableHead className="text-right">Upravljanje</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {usersList.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                        Nema pronađenih računa osoblja.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                usersList.map((u) => (
                                    <TableRow key={u.id}>
                                        <TableCell className="font-semibold text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                                    {(u.firstName?.[0] || u.name?.[0] || "O").toUpperCase()}
                                                </div>
                                                <span>{u.name || `${u.firstName || ""} ${u.lastName || ""}`}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs font-mono">
                                            {u.email}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {u.phone || "—"}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <Select
                                                value={u.role}
                                                onValueChange={(newRole) => {
                                                    setRoleMutation.mutate({ id: u.id, role: newRole as any });
                                                }}
                                            >
                                                <SelectTrigger className="h-7 w-32 text-[11px] font-semibold border-none bg-transparent">
                                                    {u.role === "admin" ? (
                                                        <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-300 gap-1 border-purple-300">
                                                            🛡️ Admin
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 gap-1 border-blue-300">
                                                            ⚙️ Operater
                                                        </Badge>
                                                    )}
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="operator">⚙️ Operater</SelectItem>
                                                    <SelectItem value="admin">🛡️ Administrator</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {u.lastSignedIn
                                                ? format(new Date(u.lastSignedIn), "d. MMMM yyyy. HH:mm", { locale: hr })
                                                : "Nikada"}
                                        </TableCell>
                                        <TableCell className="text-right space-x-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => setResetUser(u)}
                                                title="Promijeni lozinku"
                                            >
                                                <KeyRound className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                                                onClick={() => setDeleteUser(u)}
                                                title="Obriši račun"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Create Staff Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5 text-primary" />
                            Dodaj operatera ili administratora
                        </DialogTitle>
                        <DialogDescription>
                            Unesite podatke za novog člana osoblja. Član osoblja dobit će email s pristupnom lozinkom.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="staffFirstName" className="text-xs font-semibold">Ime *</Label>
                                <Input
                                    id="staffFirstName"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="npr. Marko"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="staffLastName" className="text-xs font-semibold">Prezime</Label>
                                <Input
                                    id="staffLastName"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="npr. Marulić"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="staffEmail" className="text-xs font-semibold">Email (Korisničko ime) *</Label>
                            <Input
                                id="staffEmail"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="operater@lucicaspinut.hr"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="staffPhone" className="text-xs font-semibold">Mobitel / Telefon *</Label>
                            <Input
                                id="staffPhone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="091 234 5678"
                            />
                        </div>

                        <div className="space-y-1 pt-1">
                            <Label className="text-xs font-semibold">Uloga u sustavu *</Label>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <button
                                    type="button"
                                    className={`p-2.5 rounded-xl border text-left text-xs transition-all ${role === "operator"
                                            ? "border-primary bg-primary/5 text-primary font-bold shadow-sm"
                                            : "border-gray-200 hover:bg-muted/50"
                                        }`}
                                    onClick={() => setRole("operator")}
                                >
                                    <div className="font-bold flex items-center gap-1.5">⚙️ Operater</div>
                                    <p className="text-[10px] text-muted-foreground font-normal mt-0.5">
                                        Upravljanje kalendarom, dizalicama i rezervacijama
                                    </p>
                                </button>
                                <button
                                    type="button"
                                    className={`p-2.5 rounded-xl border text-left text-xs transition-all ${role === "admin"
                                            ? "border-purple-600 bg-purple-50 text-purple-900 font-bold shadow-sm"
                                            : "border-gray-200 hover:bg-muted/50"
                                        }`}
                                    onClick={() => setRole("admin")}
                                >
                                    <div className="font-bold flex items-center gap-1.5">🛡️ Administrator</div>
                                    <p className="text-[10px] text-muted-foreground font-normal mt-0.5">
                                        Pun pristup postavkama i upravljanju osobljem
                                    </p>
                                </button>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="pt-2 border-t">
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t.admin.cancel}</Button>
                        <Button
                            disabled={!firstName.trim() || !email.trim() || !phone.trim() || createStaffMutation.isPending}
                            onClick={handleCreateStaff}
                        >
                            {createStaffMutation.isPending ? t.admin.creating : "Kreiraj račun osoblja"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reset Password Dialog */}
            <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Promjena lozinke: {resetUser?.name}</DialogTitle>
                        <DialogDescription>
                            Unesite novu lozinku za korisnika.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 space-y-2">
                        <Label htmlFor="newStaffPass" className="text-xs">Nova lozinka</Label>
                        <Input
                            id="newStaffPass"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Minimalno 6 znakova"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResetUser(null)}>{t.admin.cancel}</Button>
                        <Button
                            disabled={!newPassword || newPassword.length < 6 || adminResetPassword.isPending}
                            onClick={() => adminResetPassword.mutate({ id: resetUser.id, password: newPassword })}
                        >
                            {adminResetPassword.isPending ? t.admin.saving : "Spremi lozinku"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Brisanje računa</DialogTitle>
                        <DialogDescription className="text-destructive font-medium">
                            Jeste li sigurni da želite obrisati račun {deleteUser?.name}?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteUser(null)}>{t.admin.cancel}</Button>
                        <Button
                            variant="destructive"
                            disabled={adminDeleteUser.isPending}
                            onClick={() => adminDeleteUser.mutate({ id: deleteUser.id })}
                        >
                            {adminDeleteUser.isPending ? t.admin.saving : t.admin.confirmDeletion}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Success Password Dialog */}
            <Dialog open={!!createdTempPassword} onOpenChange={(open) => !open && setCreatedTempPassword(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-green-700">
                            <CheckCircle2 className="h-5 w-5" />
                            Račun uspješno kreiran
                        </DialogTitle>
                        <DialogDescription>
                            Sljedeća privremena lozinka dodijeljena je novom korisniku:
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-3">
                        <div className="flex items-center justify-between p-3 bg-muted rounded-lg font-mono text-base font-bold">
                            <span>{createdTempPassword}</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    navigator.clipboard.writeText(createdTempPassword || "");
                                    toast.success("Lozinka kopirana!");
                                }}
                            >
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setCreatedTempPassword(null)}>Zatvori</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
