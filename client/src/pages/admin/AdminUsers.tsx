
import { trpc } from "@/lib/trpc";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { Loader2, Shield, ShieldAlert, Key, Trash2, Edit2, UserX, UserPlus, CalendarDays, Copy, Check, MailCheck, Upload } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { isValidOib } from "@shared/oib";

export default function AdminUsers() {
    const { t } = useLang();
    const [, setLocation] = useLocation();
    const [page, setPage] = useState(1);
    const pageSize = 50;

    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [roleFilter, setRoleFilter] = useState("user");
    const [statusFilter, setStatusFilter] = useState("all");
    const [vesselFilter, setVesselFilter] = useState("all");
    const [clientCategoryFilter, setClientCategoryFilter] = useState("all");

    useEffect(() => {
        const handler = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchInput]);

    const usersQuery = trpc.user.list.useQuery({
        page,
        pageSize,
        search: search.trim() !== "" ? search : undefined,
        role: roleFilter,
        status: statusFilter,
        vesselFilter: vesselFilter,
        clientCategory: clientCategoryFilter !== "all" ? clientCategoryFilter : undefined,
    }, {
        placeholderData: (prev) => prev
    });
    const users = usersQuery.data?.data || [];
    const totalUsers = usersQuery.data?.total || 0;
    const totalPages = Math.ceil(totalUsers / pageSize);
    const utils = trpc.useUtils();

    const [resetUser, setResetUser] = useState<{ id: string; name: string } | null>(null);
    const [deleteUser, setDeleteUser] = useState<{ id: string; name: string } | null>(null);
    const [anonymizeUser, setAnonymizeUser] = useState<{ id: string; name: string } | null>(null);
    const [editUser, setEditUser] = useState<any | null>(null);
    const [newPassword, setNewPassword] = useState("");

    // Edit form state
    const [editFirstName, setEditFirstName] = useState("");
    const [editLastName, setEditLastName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editOib, setEditOib] = useState("");
    const [editOibError, setEditOibError] = useState<string | null>(null);
    const [editRole, setEditRole] = useState<"user" | "admin" | "operator">("user");
    const [editClientCategory, setEditClientCategory] = useState<"member" | "commercial">("member");
    const [showCreateDialog, setShowCreateDialog] = useState(false);

    // Create form state
    const [newIsLegalEntity, setNewIsLegalEntity] = useState(false);
    const [newClientCategory, setNewClientCategory] = useState<"member" | "commercial">("member");
    const [newCompanyName, setNewCompanyName] = useState("");
    const [newContactPerson, setNewContactPerson] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newFirstName, setNewFirstName] = useState("");
    const [newLastName, setNewLastName] = useState("");
    const [newPhone, setNewPhone] = useState("");
    const [newOib, setNewOib] = useState("");
    const [newOibError, setNewOibError] = useState<string | null>(null);
    const [newAddress, setNewAddress] = useState("");
    const [newCity, setNewCity] = useState("Split");
    const [newPostalCode, setNewPostalCode] = useState("21000");
    const [newRole, setNewRole] = useState<"user" | "admin" | "operator">("user");

    type FormVesselItem = {
        id: string;
        name: string;
        registration: string;
        type: "jedrilica" | "motorni" | "katamaran" | "ostalo";
        lengthM?: number;
        beamM?: number;
        weightTons?: number;
    };
    const [newVessels, setNewVessels] = useState<FormVesselItem[]>([]);
    const [tempVesselName, setTempVesselName] = useState("");
    const [tempVesselReg, setTempVesselReg] = useState("");
    const [tempVesselType, setTempVesselType] = useState<"jedrilica" | "motorni" | "katamaran" | "ostalo">("jedrilica");
    const [tempVesselLength, setTempVesselLength] = useState("");
    const [tempVesselBeam, setTempVesselBeam] = useState("");
    const [tempVesselWeight, setTempVesselWeight] = useState("");

    const handleAddVesselToUser = () => {
        if (!tempVesselName.trim()) {
            toast.error("Unesite naziv plovila.");
            return;
        }
        setNewVessels(prev => [
            ...prev,
            {
                id: Math.random().toString(),
                name: tempVesselName.trim(),
                registration: tempVesselReg.trim(),
                type: tempVesselType,
                lengthM: tempVesselLength ? Number(tempVesselLength) : undefined,
                beamM: tempVesselBeam ? Number(tempVesselBeam) : undefined,
                weightTons: tempVesselWeight ? Number(tempVesselWeight) : undefined,
            }
        ]);
        setTempVesselName("");
        setTempVesselReg("");
        setTempVesselType("jedrilica");
        setTempVesselLength("");
        setTempVesselBeam("");
        setTempVesselWeight("");
    };

    const handleRemoveVesselFromUser = (id: string) => {
        setNewVessels(prev => prev.filter(v => v.id !== id));
    };

    const resetCreateForm = () => {
        setNewIsLegalEntity(false);
        setNewClientCategory("member");
        setNewCompanyName("");
        setNewContactPerson("");
        setNewFirstName("");
        setNewLastName("");
        setNewEmail("");
        setNewPhone("");
        setNewOib("");
        setNewOibError(null);
        setNewAddress("");
        setNewCity("Split");
        setNewPostalCode("21000");
        setNewRole("user");
        setNewVessels([]);
        setTempVesselName("");
        setTempVesselReg("");
        setTempVesselType("jedrilica");
        setTempVesselLength("");
        setTempVesselBeam("");
        setTempVesselWeight("");
    };

    const setRole = trpc.user.setRole.useMutation({
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

    const importCsvMutation = trpc.user.importCsv.useMutation({
        onSuccess: (data) => {
            toast.success(`Uvoz dovršen. Uspješno: ${data.successCount} korisnika, ${data.vesselCount} plovila. Preskočeno: ${data.skippedCount}, Greške: ${data.errorCount}.`);
            utils.user.list.invalidate();
        },
        onError: (err) => {
            toast.error(err.message || "Greška pri uvozu.");
        }
    });

    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            importCsvMutation.mutate({ csvContent: text });
            e.target.value = "";
        };
        reader.readAsText(file);
    };

    const adminAnonymizeUser = trpc.user.anonymize.useMutation({
        onSuccess: () => {
            toast.success("Korisnik je uspješno anonimiziran.");
            setAnonymizeUser(null);
            utils.user.list.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message || "Greška pri anonimizaciji korisnika.");
        },
    });

    const adminUpdateUser = trpc.user.update.useMutation({
        onSuccess: () => {
            toast.success("Korisnički podaci uspješno ažurirani.");
            setEditUser(null);
            utils.user.list.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message || "Greška pri ažuriranju korisnika.");
        },
    });

    const adminCreateUser = trpc.user.create.useMutation({
        onSuccess: () => {
            toast.success("Korisnik je uspješno kreiran.");
            setShowCreateDialog(false);
            resetCreateForm();
            utils.user.list.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message || "Greška pri kreiranju korisnika.");
        },
    });

    const adminVerifyEmail = trpc.user.verifyEmail.useMutation({
        onSuccess: () => {
            toast.success("Email korisnika je uspješno verificiran.");
            utils.user.list.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message || "Greška pri verifikaciji.");
        },
    });

    const openEdit = (user: any) => {
        setEditUser(user);
        setEditFirstName(user.firstName || "");
        setEditLastName(user.lastName || "");
        setEditPhone(user.phone || "");
        setEditOib(user.oib || "");
        setEditOibError(null);
        setEditRole(user.role);
        setEditClientCategory(user.clientCategory || "member");
    };

    const handleUpdate = () => {
        if (!editUser) return;
        if (editOib && editOib.length === 11 && !isValidOib(editOib)) {
            setEditOibError("OIB nije ispravan.");
            return;
        }
        adminUpdateUser.mutate({
            id: editUser.id,
            firstName: editFirstName,
            lastName: editLastName,
            phone: editPhone,
            clientCategory: editClientCategory,
            oib: editOib || undefined,
            role: editRole,
        });
    };

    const handleCreate = () => {
        if (newIsLegalEntity) {
            if (!newCompanyName.trim()) {
                toast.error("Naziv pravne osobe / tvrtke je obavezan.");
                return;
            }
        } else {
            if (!newFirstName.trim()) {
                toast.error("Ime korisnika je obavezno.");
                return;
            }
        }

        if (newOib && newOib.length === 11 && !isValidOib(newOib)) {
            setNewOibError("Unesite ispravan OIB (11 znamenki).");
            return;
        }

        adminCreateUser.mutate({
            isLegalEntity: newIsLegalEntity,
            clientCategory: newClientCategory,
            companyName: newIsLegalEntity ? newCompanyName.trim() : undefined,
            contactPerson: newIsLegalEntity ? newContactPerson.trim() : undefined,
            firstName: !newIsLegalEntity ? newFirstName.trim() : undefined,
            lastName: !newIsLegalEntity ? newLastName.trim() : undefined,
            email: newEmail.trim() || undefined,
            phone: newPhone.trim() || undefined,
            oib: newOib.trim() || undefined,
            address: newAddress.trim() || undefined,
            city: newCity.trim() || "Split",
            postalCode: newPostalCode.trim() || "21000",
            role: newRole,
            vessels: newVessels.map(v => ({
                name: v.name,
                registration: v.registration || undefined,
                type: v.type,
                lengthM: v.lengthM,
                beamM: v.beamM,
                weightTons: v.weightTons,
            })),
        });
    };

    // Reset to page 1 when count changes significantly or on invalidations if needed
    // But usually standard trpc invalidation is fine.

    if (usersQuery.isLoading && !usersQuery.data) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle>Korisnici i plovila</CardTitle>
                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            id="csv-file-input"
                            accept=".csv"
                            className="hidden"
                            onChange={handleCsvUpload}
                            disabled={importCsvMutation.isPending}
                        />
                        <Button
                            variant="outline"
                            onClick={() => document.getElementById("csv-file-input")?.click()}
                            disabled={importCsvMutation.isPending}
                            className="flex items-center gap-2"
                        >
                            {importCsvMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Upload className="h-4 w-4" />
                            )}
                            Uvezi CSV
                        </Button>
                        <Button onClick={() => setShowCreateDialog(true)} className="flex items-center gap-2">
                            <UserPlus className="h-4 w-4" />
                            {t.admin.addUser || "Novi Korisnik"}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Search and Filters Bar */}
                    <div className="flex flex-col md:flex-row gap-4 mb-6 items-end md:items-center">
                        <div className="flex-1 w-full">
                            <Label className="text-xs font-semibold mb-1 block">Pretraga</Label>
                            <div className="relative">
                                <Input
                                    placeholder="Pretraži po imenu, prezimenu, tvrtki, OIB-u ili registraciji plovila..."
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    className="pr-8"
                                />
                                {searchInput && (
                                    <button
                                        onClick={() => setSearchInput("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm"
                                        type="button"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="w-full md:w-[160px]">
                            <Label className="text-xs font-semibold mb-1 block">Kategorija</Label>
                            <Select
                                value={clientCategoryFilter}
                                onValueChange={(val) => {
                                    setClientCategoryFilter(val);
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Sve kategorije</SelectItem>
                                    <SelectItem value="member">Član društva</SelectItem>
                                    <SelectItem value="commercial">Komercijala</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-full md:w-[150px]">
                            <Label className="text-xs font-semibold mb-1 block">Verifikacija</Label>
                            <Select
                                value={statusFilter}
                                onValueChange={(val) => {
                                    setStatusFilter(val);
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Svi statusi</SelectItem>
                                    <SelectItem value="verified">Verificiran</SelectItem>
                                    <SelectItem value="unverified">Nije verificiran</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-full md:w-[150px]">
                            <Label className="text-xs font-semibold mb-1 block">Plovilo</Label>
                            <Select
                                value={vesselFilter}
                                onValueChange={(val) => {
                                    setVesselFilter(val);
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Svi korisnici</SelectItem>
                                    <SelectItem value="has_vessel">S plovilom</SelectItem>
                                    <SelectItem value="no_vessel">Bez plovila</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Table className={usersQuery.isFetching ? "opacity-60 transition-opacity duration-200" : "transition-opacity duration-200"}>
                        <TableHeader>
                            <TableRow>
                                <TableHead>OIB</TableHead>
                                <TableHead>{t.admin.userName}</TableHead>
                                <TableHead>Kategorija</TableHead>
                                <TableHead>{t.admin.userEmail}</TableHead>
                                <TableHead>{t.admin.userPhone}</TableHead>
                                <TableHead>Registracija plovila</TableHead>
                                <TableHead>Posljednja Prijava</TableHead>
                                <TableHead className="text-right">Akcije</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-mono text-sm">
                                        {(user as any).oib
                                            ? (user as any).oib
                                            : <span className="text-xs bg-yellow-100 text-yellow-700 px-1 py-0.5 rounded">Nije unesen</span>
                                        }
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        <button
                                            className="text-primary hover:underline text-left"
                                            onClick={() => setLocation(`/admin/users/${user.id}`)}
                                        >
                                            {user.name}
                                        </button>
                                    </TableCell>
                                    <TableCell>
                                        {(user as any).clientCategory === "commercial" ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                                💼 Komercijala
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                                ⚓ Član društva
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span>{user.email}</span>
                                            {(user as any).emailVerifiedAt ? (
                                                <span className="text-[10px] text-green-600 font-semibold">
                                                    Verificiran ✓
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-amber-600 font-semibold">
                                                    Nije verificiran ✗
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{user.phone || "-"}</TableCell>
                                    <TableCell>
                                        {(user as any).vessels && (user as any).vessels.length > 0 ? (
                                            <div className="flex flex-col gap-1">
                                                {(user as any).vessels.map((v: any) => (
                                                    <div key={v.id} className="flex items-center gap-1.5 text-xs font-mono">
                                                        <span className="font-bold text-primary">{v.registration || v.name}</span>
                                                        {v.registration && <span className="text-[10px] text-muted-foreground font-sans">({v.name})</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">Nema plovila</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {new Date(user.lastSignedIn).toLocaleString("hr-HR")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setLocation(`/admin/calendar?userId=${user.id}`)}
                                                title="Prikaži kalendar"
                                            >
                                                <CalendarDays className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openEdit(user)}
                                                title={t.admin.editUser}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            {!(user as any).emailVerifiedAt && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                    onClick={() => adminVerifyEmail.mutate({ id: user.id })}
                                                    disabled={adminVerifyEmail.isPending}
                                                    title="Verificiraj email klijenta"
                                                >
                                                    <MailCheck className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setResetUser({ id: user.id, name: user.name || user.email || t.admin.roleUser })}
                                                title={t.admin.resetPassword}
                                            >
                                                <Key className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                                                onClick={() => setAnonymizeUser({ id: user.id, name: user.name || user.email || t.admin.roleUser })}
                                                title={t.admin.anonymizeUser}
                                            >
                                                <UserX className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => setDeleteUser({ id: user.id, name: user.name || user.email || t.admin.roleUser })}
                                                title={t.admin.deleteUserTitle}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {users.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                                        Nema korisnika koji odgovaraju zadanim kriterijima pretrage i filtriranja.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>

                    {totalPages > 1 && (
                        <div className="flex justify-center py-6 border-t">
                            <Pagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                        />
                                    </PaginationItem>
                                    <div className="flex items-center px-4 text-sm font-medium">
                                        {page} / {totalPages} ({totalUsers} {t.admin.users.toLowerCase()})
                                    </div>
                                    <PaginationItem>
                                        <PaginationNext
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Reset Password Dialog */}
            <Dialog open={!!resetUser} onOpenChange={(open: boolean) => !open && setResetUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.admin.resetPasswordFor}: {resetUser?.name}</DialogTitle>
                        <DialogDescription>
                            {t.admin.enterNewPassword}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">{t.profile.newPassword}</Label>
                            <Input
                                id="password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder={t.admin.newPasswordPlaceholder}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResetUser(null)}>{t.admin.cancel}</Button>
                        <Button
                            disabled={!newPassword || newPassword.length < 8 || adminResetPassword.isPending}
                            onClick={() => adminResetPassword.mutate({ id: resetUser!.id, password: newPassword })}
                        >
                            {adminResetPassword.isPending ? t.admin.saving : t.admin.setPassword}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={!!editUser} onOpenChange={(open: boolean) => !open && setEditUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.admin.editUser}: {editUser?.email}</DialogTitle>
                        <DialogDescription>
                            {t.profile.subtitle}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="editFirstName">{t.auth.firstName}</Label>
                                <Input
                                    id="editFirstName"
                                    value={editFirstName}
                                    onChange={(e) => setEditFirstName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="editLastName">{t.auth.lastName}</Label>
                                <Input
                                    id="editLastName"
                                    value={editLastName}
                                    onChange={(e) => setEditLastName(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="editPhone">{t.auth.phone}</Label>
                            <Input
                                id="editPhone"
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="editOib">OIB <span className="text-xs text-muted-foreground">(samo admin može mijenjati)</span></Label>
                            <Input
                                id="editOib"
                                value={editOib}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                                    setEditOib(val);
                                    if (val.length === 11) {
                                        setEditOibError(isValidOib(val) ? null : "OIB nije ispravan.");
                                    } else {
                                        setEditOibError(null);
                                    }
                                }}
                                placeholder="12345678901"
                                maxLength={11}
                                inputMode="numeric"
                            />
                            {editOibError && <p className="text-xs text-destructive">{editOibError}</p>}
                            {editOib.length === 11 && !editOibError && <p className="text-xs text-green-600">OIB je ispravan ✓</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="editClientCategory">Kategorija korisnika / Status članstva *</Label>
                            <Select
                                value={editClientCategory}
                                onValueChange={(val) => setEditClientCategory(val as "member" | "commercial")}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="member">⚓ Član društva (Statutarna prava dizanja/spuštanja)</SelectItem>
                                    <SelectItem value="commercial">💼 Komercijala (Vanjski klijent - naplata po cjeniku)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="editRole">{t.admin.userRole}</Label>
                            <Select
                                value={editRole}
                                onValueChange={(val) => setEditRole(val as "user" | "admin" | "operator")}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">{t.admin.roleUser}</SelectItem>
                                    <SelectItem value="operator">{t.admin.roleOperator}</SelectItem>
                                    <SelectItem value="admin">{t.admin.roleAdmin}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditUser(null)}>{t.admin.cancel}</Button>
                        <Button
                            disabled={adminUpdateUser.isPending}
                            onClick={handleUpdate}
                        >
                            {adminUpdateUser.isPending ? t.admin.saving : t.admin.saveChanges}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete User Confirmation */}
            <Dialog open={!!deleteUser} onOpenChange={(open: boolean) => !open && setDeleteUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.admin.deleteUserTitle}: {deleteUser?.name}</DialogTitle>
                        <DialogDescription className="text-red-500">
                            {t.admin.deleteUserDesc}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteUser(null)}>{t.admin.cancel}</Button>
                        <Button
                            variant="destructive"
                            disabled={adminDeleteUser.isPending}
                            onClick={() => adminDeleteUser.mutate({ id: deleteUser!.id })}
                        >
                            {adminDeleteUser.isPending ? t.admin.saving : t.admin.confirmDeletion}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Anonymize User Confirmation */}
            <Dialog open={!!anonymizeUser} onOpenChange={(open: boolean) => !open && setAnonymizeUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.admin.anonymizeUser}: {anonymizeUser?.name}</DialogTitle>
                        <DialogDescription className="text-amber-600 font-medium pb-2">
                            {t.admin.anonymizeDesc}
                        </DialogDescription>
                        <div className="text-sm text-muted-foreground space-y-1">
                            <p>{t.admin.anonymizeLongDesc}</p>
                            <p className="font-bold underline pt-2">{t.admin.irreversibleAction}</p>
                        </div>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAnonymizeUser(null)}>{t.admin.cancel}</Button>
                        <Button
                            variant="destructive"
                            className="bg-amber-600 hover:bg-amber-700"
                            disabled={adminAnonymizeUser.isPending}
                            onClick={() => adminAnonymizeUser.mutate({ id: anonymizeUser!.id })}
                        >
                            {adminAnonymizeUser.isPending ? t.admin.anonymizing : t.admin.confirmAnonymization}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create User Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Dodaj novog člana marine</DialogTitle>
                        <DialogDescription>
                            Unesite podatke o novom članu marine. Jedino obavezno polje je Ime (ili Naziv tvrtke).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-2 space-y-4">
                        {/* Entity Type Toggle */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Tip korisnika</Label>
                            <div className="flex bg-muted/60 p-1 rounded-xl gap-1">
                                <button
                                    type="button"
                                    className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${!newIsLegalEntity ? "bg-white shadow text-primary border border-gray-200" : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    onClick={() => setNewIsLegalEntity(false)}
                                >
                                    <span>👤 Fizička osoba</span>
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${newIsLegalEntity ? "bg-white shadow text-primary border border-gray-200" : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    onClick={() => setNewIsLegalEntity(true)}
                                >
                                    <span>🏢 Pravna osoba / Tvrtka</span>
                                </button>
                            </div>
                        </div>

                        {/* Member Category Selector */}
                        <div className="space-y-1.5 p-2.5 bg-muted/40 rounded-xl border">
                            <Label className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                Kategorija korisnika / Status članstva *
                            </Label>
                            <Select
                                value={newClientCategory}
                                onValueChange={(val) => setNewClientCategory(val as "member" | "commercial")}
                            >
                                <SelectTrigger className="bg-white text-xs h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="member">
                                        <div className="text-left">
                                            <div className="font-semibold text-xs text-emerald-700 dark:text-emerald-400">⚓ Član društva</div>
                                            <div className="text-[11px] text-muted-foreground">Pravo na vađenje/spuštanje u sklopu članarine (0,00 €)</div>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="commercial">
                                        <div className="text-left">
                                            <div className="font-semibold text-xs text-amber-700 dark:text-amber-400">💼 Komercijala / Vanjski korisnik</div>
                                            <div className="text-[11px] text-muted-foreground">Nema besplatnih operacija (sve operacije se naplaćuju po cjeniku)</div>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Name / Company Details */}
                        {!newIsLegalEntity ? (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label htmlFor="newFirstName" className="text-xs font-semibold">Ime *</Label>
                                    <Input
                                        id="newFirstName"
                                        value={newFirstName}
                                        onChange={(e) => setNewFirstName(e.target.value)}
                                        placeholder="npr. Ivan"
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="newLastName" className="text-xs font-semibold">Prezime</Label>
                                    <Input
                                        id="newLastName"
                                        value={newLastName}
                                        onChange={(e) => setNewLastName(e.target.value)}
                                        placeholder="npr. Horvat"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <Label htmlFor="newCompanyName" className="text-xs font-semibold">Naziv tvrtke / pravne osobe *</Label>
                                    <Input
                                        id="newCompanyName"
                                        value={newCompanyName}
                                        onChange={(e) => setNewCompanyName(e.target.value)}
                                        placeholder="npr. Jadran d.o.o."
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="newContactPerson" className="text-xs font-semibold">Osoba za kontakt (opcionalno)</Label>
                                    <Input
                                        id="newContactPerson"
                                        value={newContactPerson}
                                        onChange={(e) => setNewContactPerson(e.target.value)}
                                        placeholder="npr. Marko Marković"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Contact & Identifiers */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="newOib" className="text-xs font-semibold">OIB (opcionalno)</Label>
                                <Input
                                    id="newOib"
                                    value={newOib}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                                        setNewOib(val);
                                        if (val.length === 11) {
                                            setNewOibError(isValidOib(val) ? null : "Neispravna kontrolna znamenka");
                                        } else {
                                            setNewOibError(null);
                                        }
                                    }}
                                    placeholder="11 znamenki"
                                    maxLength={11}
                                />
                                {newOibError && <p className="text-[10px] text-destructive">{newOibError}</p>}
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="newEmail" className="text-xs font-semibold">Email (opcionalno)</Label>
                                <Input
                                    id="newEmail"
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder="korisnik@example.com"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="newPhone" className="text-xs font-semibold">Telefon (opcionalno)</Label>
                                <Input
                                    id="newPhone"
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(e.target.value)}
                                    placeholder="091 234 5678"
                                />
                            </div>
                        </div>

                        {/* Address */}
                        <div className="border-t pt-3 space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground">Adresa i prebivalište / sjedište</Label>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1 col-span-1">
                                    <Label htmlFor="newAddress" className="text-xs">Ulica i broj</Label>
                                    <Input
                                        id="newAddress"
                                        value={newAddress}
                                        onChange={(e) => setNewAddress(e.target.value)}
                                        placeholder=""
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="newCity" className="text-xs">Grad</Label>
                                    <Input
                                        id="newCity"
                                        value={newCity}
                                        onChange={(e) => setNewCity(e.target.value)}
                                        placeholder="Split"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="newPostalCode" className="text-xs">Poštanski broj</Label>
                                    <Input
                                        id="newPostalCode"
                                        value={newPostalCode}
                                        onChange={(e) => setNewPostalCode(e.target.value)}
                                        placeholder="21000"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* User Vessels Section */}
                        <div className="border-t pt-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                    ⛵ Plovila korisnika (opcionalno)
                                </Label>
                                <span className="text-[10px] text-muted-foreground">
                                    {newVessels.length} {newVessels.length === 1 ? "dodano plovilo" : "dodanih plovila"}
                                </span>
                            </div>

                            {/* Added Vessels List */}
                            {newVessels.length > 0 && (
                                <div className="space-y-1.5 mb-2 max-h-32 overflow-y-auto">
                                    {newVessels.map(v => (
                                        <div key={v.id} className="flex items-center justify-between p-2 rounded-lg bg-muted text-xs border">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold">{v.name}</span>
                                                {v.registration && (
                                                    <span className="font-mono text-[10px] bg-background px-1.5 py-0.5 rounded border">
                                                        {v.registration}
                                                    </span>
                                                )}
                                                <span className="text-[10px] text-muted-foreground capitalize">({v.type})</span>
                                                {(v.lengthM || v.beamM || v.weightTons) && (
                                                    <span className="text-[10px] text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded">
                                                        {[
                                                            v.lengthM ? `L:${v.lengthM}m` : null,
                                                            v.beamM ? `B:${v.beamM}m` : null,
                                                            v.weightTons ? `W:${v.weightTons}t` : null,
                                                        ].filter(Boolean).join(" | ")}
                                                    </span>
                                                )}
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10 rounded-md"
                                                onClick={() => handleRemoveVesselFromUser(v.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Mini form row to add vessel */}
                            <div className="bg-muted/40 p-2.5 rounded-xl border space-y-2">
                                <p className="text-[11px] font-semibold text-muted-foreground">Dodaj novo plovilo uz korisnika:</p>
                                <div className="grid grid-cols-12 gap-2">
                                    <div className="col-span-5">
                                        <Input
                                            className="h-8 text-xs bg-white"
                                            placeholder="Naziv plovila *"
                                            value={tempVesselName}
                                            onChange={(e) => setTempVesselName(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <Input
                                            className="h-8 text-xs bg-white"
                                            placeholder="Registracija (npr. ST-123)"
                                            value={tempVesselReg}
                                            onChange={(e) => setTempVesselReg(e.target.value)}
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <Select value={tempVesselType} onValueChange={(val) => setTempVesselType(val as any)}>
                                            <SelectTrigger className="h-8 text-xs bg-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="jedrilica">Jedrilica</SelectItem>
                                                <SelectItem value="motorni">Motorni</SelectItem>
                                                <SelectItem value="katamaran">Katamaran</SelectItem>
                                                <SelectItem value="ostalo">Ostalo</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <Input
                                        type="number"
                                        step="0.1"
                                        className="h-8 text-xs bg-white"
                                        placeholder="Dužina (m)"
                                        value={tempVesselLength}
                                        onChange={(e) => setTempVesselLength(e.target.value)}
                                    />
                                    <Input
                                        type="number"
                                        step="0.1"
                                        className="h-8 text-xs bg-white"
                                        placeholder="Širina (m)"
                                        value={tempVesselBeam}
                                        onChange={(e) => setTempVesselBeam(e.target.value)}
                                    />
                                    <Input
                                        type="number"
                                        step="0.1"
                                        className="h-8 text-xs bg-white"
                                        placeholder="Težina (t)"
                                        value={tempVesselWeight}
                                        onChange={(e) => setTempVesselWeight(e.target.value)}
                                    />
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-7 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/5 rounded-lg"
                                    onClick={handleAddVesselToUser}
                                >
                                    + Dodaj plovilo na listu
                                </Button>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="pt-2 border-t">
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t.admin.cancel}</Button>
                        <Button
                            disabled={newIsLegalEntity ? !newCompanyName.trim() || adminCreateUser.isPending : !newFirstName.trim() || adminCreateUser.isPending}
                            onClick={handleCreate}
                        >
                            {adminCreateUser.isPending ? t.admin.creating : t.admin.addUser}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
