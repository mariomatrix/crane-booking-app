
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
import { toast } from "sonner";
import { Loader2, Shield, ShieldAlert } from "lucide-react";

export default function AdminUsers() {
    const settings = trpc.settings.get.useQuery();
    const users = trpc.user.list.useQuery();
    const utils = trpc.useContext();

    const setRole = trpc.user.setRole.useMutation({
        onSuccess: () => {
            toast.success("Uloga korisnika uspješno promijenjena.");
            utils.user.list.invalidate();
        },
        onError: (err) => {
            toast.error(err.message || "Greška pri promjeni role.");
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
                                </TableRow>
                            ))}
                            {users.data?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-4">
                                        Nema registriranih korisnika.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
