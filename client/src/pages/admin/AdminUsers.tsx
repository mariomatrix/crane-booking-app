
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
import { useLang } from "@/contexts/LangContext";
import { Loader2, Shield, ShieldAlert, Key, Trash2, Edit2, UserX, UserPlus, CalendarDays } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function AdminUsers() {
    const { t } = useLang();
    const [, setLocation] = useLocation();
    const users = trpc.user.list.useQuery();
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
    const [editRole, setEditRole] = useState<"user" | "admin" | "operator">("user");
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);

    // Create form state
    const [newEmail, setNewEmail] = useState("");
    const [newFirstName, setNewFirstName] = useState("");
    const [newLastName, setNewLastName] = useState("");
    const [newPhone, setNewPhone] = useState("");
    const [newRole, setNewRole] = useState<"user" | "admin" | "operator">("user");

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
        onSuccess: (data) => {
            toast.success("Korisnik uspješno kreiran i dobio je email s lozinkom.");
            setCreatedTempPassword(data.tempPassword || null);
            setShowCreateDialog(false);
            // Reset form
            setNewEmail("");
            setNewFirstName("");
            setNewLastName("");
            setNewPhone("");
            setNewRole("user");
            utils.user.list.invalidate();
        },
        onError: (err: any) => {
            toast.error(err.message || "Greška pri kreiranju korisnika.");
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

    const handleCreate = () => {
        adminCreateUser.mutate({
            email: newEmail,
            firstName: newFirstName,
            lastName: newLastName,
            phone: newPhone,
            role: newRole,
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
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle>{t.admin.users}</CardTitle>
                    <Button onClick={() => setShowCreateDialog(true)} className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        {t.admin.addUser || "Novi Korisnik"}
                    </Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t.admin.userName}</TableHead>
                                <TableHead>{t.admin.userEmail}</TableHead>
                                <TableHead>{t.admin.userPhone}</TableHead>
                                <TableHead>{t.admin.userRole}</TableHead>
                                <TableHead>Posljednja Prijava</TableHead>
                                <TableHead className="text-right">Akcije</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.data?.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">
                                        <button
                                            className="text-primary hover:underline text-left"
                                            onClick={() => setLocation(`/admin/users/${user.id}`)}
                                        >
                                            {user.name}
                                        </button>
                                    </TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>{user.phone || "-"}</TableCell>
                                    <TableCell>
                                        <Select
                                            defaultValue={user.role}
                                            onValueChange={(val: string) =>
                                                setRole.mutate({ id: user.id, role: val as "user" | "admin" | "operator" })
                                            }
                                            disabled={setRole.isPending}
                                        >
                                            <SelectTrigger className="w-[130px]">
                                                <div className="flex items-center gap-2">
                                                    {user.role === "admin" ? (
                                                        <ShieldAlert className="h-4 w-4 text-red-500" />
                                                    ) : user.role === "operator" ? (
                                                        <Shield className="h-4 w-4 text-blue-500" />
                                                    ) : (
                                                        <Shield className="h-4 w-4 text-gray-500" />
                                                    )}
                                                    <SelectValue />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="user">{t.admin.roleUser}</SelectItem>
                                                <SelectItem value="operator">{t.admin.roleOperator}</SelectItem>
                                                <SelectItem value="admin">{t.admin.roleAdmin}</SelectItem>
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.admin.addNewUser}</DialogTitle>
                        <DialogDescription>
                            {t.admin.newUserDesc}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="newEmail">{t.auth.email}</Label>
                            <Input
                                id="newEmail"
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="korisnik@example.com"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="newFirstName">{t.auth.firstName}</Label>
                                <Input
                                    id="newFirstName"
                                    value={newFirstName}
                                    onChange={(e) => setNewFirstName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="newLastName">{t.auth.lastName}</Label>
                                <Input
                                    id="newLastName"
                                    value={newLastName}
                                    onChange={(e) => setNewLastName(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPhone">{t.auth.phone}</Label>
                            <Input
                                id="newPhone"
                                value={newPhone}
                                onChange={(e) => setNewPhone(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newRole">{t.admin.userRole}</Label>
                            <Select
                                value={newRole}
                                onValueChange={(val) => setNewRole(val as "user" | "admin" | "operator")}
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
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t.admin.cancel}</Button>
                        <Button
                            disabled={!newEmail || !newFirstName || !newLastName || adminCreateUser.isPending}
                            onClick={handleCreate}
                        >
                            {adminCreateUser.isPending ? t.admin.creating : t.admin.addUser}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Success/Password Dialog */}
            <Dialog open={!!createdTempPassword} onOpenChange={(open) => !open && setCreatedTempPassword(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.admin.userCreatedTitle}</DialogTitle>
                        <DialogDescription>
                            {t.admin.userCreatedDesc}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 text-center space-y-4">
                        <p className="text-sm text-muted-foreground">{t.admin.tempPasswordLabel}</p>
                        <div className="bg-muted p-4 rounded-lg font-mono text-xl tracking-wider select-all">
                            {createdTempPassword}
                        </div>
                        <p className="text-xs text-amber-600 font-medium">
                            {t.admin.recordPasswordWarning}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setCreatedTempPassword(null)}>{t.admin.cancel === "Odustani" ? "Zatvori" : "Close"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
