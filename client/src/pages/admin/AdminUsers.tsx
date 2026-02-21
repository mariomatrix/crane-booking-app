
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
import { LOADER_STYLE } from "@/const";
import { useLang } from "@/contexts/LangContext";
import { Loader2, Shield, ShieldAlert, Key, Trash2, Edit2 } from "lucide-react";
import { useState } from "react";

export default function AdminUsers() {
    const { t } = useLang();
    const users = trpc.user.list.useQuery();
    const utils = trpc.useUtils();

    const [resetUser, setResetUser] = useState<{ id: number; name: string } | null>(null);
    const [deleteUser, setDeleteUser] = useState<{ id: number; name: string } | null>(null);
    const [editUser, setEditUser] = useState<any | null>(null);
    const [newPassword, setNewPassword] = useState("");

    // Edit form state
    const [editFirstName, setEditFirstName] = useState("");
    const [editLastName, setEditLastName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editRole, setEditRole] = useState<"user" | "admin">("user");

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

    const openEdit = (user: any) => {
        setEditUser(user);
        setEditFirstName(user.firstName || "");
        setEditLastName(user.lastName || "");
        setEditPhone(user.phone || "");
        setEditRole(user.role);
    };

    const handleUpdate = () => {
        if (!editUser) return;
        adminUpdateUser.mutate({
            id: editUser.id,
            firstName: editFirstName,
            lastName: editLastName,
            phone: editPhone,
            role: editRole,
        });
    };

    if (users.isLoading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Upravljanje Korisnicima</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Ime</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Telefon</TableHead>
                                <TableHead>Uloga</TableHead>
                                <TableHead>Posljednja Prijava</TableHead>
                                <TableHead className="text-right">Akcije</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.data?.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">{user.name}</TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>{user.phone || "-"}</TableCell>
                                    <TableCell>
                                        <Select
                                            defaultValue={user.role}
                                            onValueChange={(val) =>
                                                setRole.mutate({ id: user.id, role: val as "user" | "admin" })
                                            }
                                            disabled={setRole.isPending}
                                        >
                                            <SelectTrigger className="w-[130px]">
                                                <div className="flex items-center gap-2">
                                                    {user.role === "admin" ? (
                                                        <ShieldAlert className="h-4 w-4 text-red-500" />
                                                    ) : (
                                                        <Shield className="h-4 w-4 text-gray-500" />
                                                    )}
                                                    <SelectValue />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="user">Korisnik</SelectItem>
                                                <SelectItem value="admin">Administrator</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        {new Date(user.lastSignedIn).toLocaleString("hr-HR")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openEdit(user)}
                                                title="Uredi korisnika"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setResetUser({ id: user.id, name: user.name || user.email || "Korisnik" })}
                                                title="Reset lozinke"
                                            >
                                                <Key className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => setDeleteUser({ id: user.id, name: user.name || user.email || "Korisnik" })}
                                                title="Obriši korisnika"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {users.data?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-4">
                                        Nema registriranih korisnika.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Reset Password Dialog */}
            <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reset lozinke za: {resetUser?.name}</DialogTitle>
                        <DialogDescription>
                            Unesite novu lozinku za korisnika. Korisnik će se moći prijaviti novom lozinkom odmah.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">Nova lozinka</Label>
                            <Input
                                id="password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Min. 8 znakova"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResetUser(null)}>Odustani</Button>
                        <Button
                            disabled={!newPassword || newPassword.length < 8 || adminResetPassword.isPending}
                            onClick={() => adminResetPassword.mutate({ id: resetUser!.id, password: newPassword })}
                        >
                            {adminResetPassword.isPending ? "Spremanje..." : "Postavi lozinku"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.admin.editUser}: {editUser?.email}</DialogTitle>
                        <DialogDescription>
                            Ažurirajte podatke za ovog korisnika.
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
                            <Label htmlFor="editRole">{t.admin.userRole}</Label>
                            <Select
                                value={editRole}
                                onValueChange={(val) => setEditRole(val as "user" | "admin")}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">Korisnik</SelectItem>
                                    <SelectItem value="admin">Administrator</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditUser(null)}>Odustani</Button>
                        <Button
                            disabled={adminUpdateUser.isPending}
                            onClick={handleUpdate}
                        >
                            {adminUpdateUser.isPending ? "Spremanje..." : "Spremi promjene"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete User Confirmation */}
            <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Obriši korisnika: {deleteUser?.name}</DialogTitle>
                        <DialogDescription className="text-red-500">
                            Pažnja: Ovom akcijom ćete deaktivirati korisnički račun. Korisnik se više neće moći prijaviti, ali će njegovi povijesni podaci (rezervacije) ostati sačuvani u bazi podataka.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteUser(null)}>Odustani</Button>
                        <Button
                            variant="destructive"
                            disabled={adminDeleteUser.isPending}
                            onClick={() => adminDeleteUser.mutate({ id: deleteUser!.id })}
                        >
                            {adminDeleteUser.isPending ? t.vessels.delete : "Potvrdi Brisanje"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
