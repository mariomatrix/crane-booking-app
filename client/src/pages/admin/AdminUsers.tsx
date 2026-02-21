
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
import { Loader2, Shield, ShieldAlert, Key, Trash2 } from "lucide-react";
import { useState } from "react";

export default function AdminUsers() {
    const users = trpc.user.list.useQuery();
    const utils = trpc.useContext();

    const [resetUser, setResetUser] = useState<{ id: number; name: string } | null>(null);
    const [deleteUser, setDeleteUser] = useState<{ id: number; name: string } | null>(null);
    const [newPassword, setNewPassword] = useState("");

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
        onError: (err) => {
            toast.error(err.message || "Greška pri brisanju korisnika.");
        },
    });

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
                            {adminDeleteUser.isPending ? "Brisanje..." : "Potvrdi Brisanje"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
