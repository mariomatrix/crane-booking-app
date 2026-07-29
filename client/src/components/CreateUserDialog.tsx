import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { isValidOib } from "@shared/oib";

interface CreateUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: (newUser: { id: string; name: string; email: string; phone?: string; oib?: string }) => void;
}

export function CreateUserDialog({ open, onOpenChange, onSuccess }: CreateUserDialogProps) {
    const { t } = useLang();

    const [email, setEmail] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phone, setPhone] = useState("");
    const [oib, setOib] = useState("");
    const [oibError, setOibError] = useState<string | null>(null);
    const [role, setRole] = useState<"user" | "admin" | "operator">("user");

    const utils = trpc.useUtils();

    const createMutation = trpc.user.create.useMutation({
        onSuccess: (data) => {
            toast.success("Korisnik uspješno kreiran.");
            
            // Calculate name for local display
            const fullName = `${firstName} ${lastName}`.trim();
            
            onSuccess?.({
                id: (data as any).userId || "", // or whatever is returned, wait we can invalidate or inspect what is returned
                name: fullName,
                email,
                phone,
                oib
            });
            
            // Reset form
            setEmail("");
            setFirstName("");
            setLastName("");
            setPhone("");
            setOib("");
            setOibError(null);
            setRole("user");
            
            utils.user.list.invalidate();
            onOpenChange(false);
        },
        onError: (err: any) => {
            toast.error(err.message || "Greška pri kreiranju korisnika.");
        },
    });

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmailValid(email)) {
            toast.error("Unesite ispravnu email adresu.");
            return;
        }
        if (!firstName.trim() || !lastName.trim()) {
            toast.error("Ime i prezime su obavezni.");
            return;
        }
        if (!oib || oib.length !== 11 || !isValidOib(oib)) {
            setOibError("Unesite ispravan OIB (11 znamenki).");
            return;
        }

        createMutation.mutate({
            email,
            firstName,
            lastName,
            phone: phone || undefined,
            oib,
            role,
        });
    };

    const newEmailValid = (emailStr: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t.admin.addNewUser}</DialogTitle>
                    <DialogDescription>
                        Ispunite podatke za novog korisnika marine. Lozinka će mu biti automatski generirana i poslana na email.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate}>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">{t.auth.email} *</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="korisnik@example.com"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="firstName">{t.auth.firstName} *</Label>
                                <Input
                                    id="firstName"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lastName">{t.auth.lastName} *</Label>
                                <Input
                                    id="lastName"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">{t.auth.phone}</Label>
                            <Input
                                id="phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="+385 91 234 5678"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="oib">OIB *</Label>
                            <Input
                                id="oib"
                                value={oib}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                                    setOib(val);
                                    if (val.length === 11) {
                                        setOibError(isValidOib(val) ? null : "OIB nije ispravan (pogrešna kontrolna znamenka).");
                                    } else {
                                        setOibError(null);
                                    }
                                }}
                                placeholder="12345678901"
                                maxLength={11}
                                inputMode="numeric"
                                required
                            />
                            {oibError && <p className="text-xs text-destructive">{oibError}</p>}
                            {oib.length === 11 && !oibError && <p className="text-xs text-green-600">OIB je ispravan ✓</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="role">{t.admin.userRole} *</Label>
                            <Select
                                value={role}
                                onValueChange={(val) => setRole(val as "user" | "admin" | "operator")}
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
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.admin.cancel}</Button>
                        <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Dodaj korisnika
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
