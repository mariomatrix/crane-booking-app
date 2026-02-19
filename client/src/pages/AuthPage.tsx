import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { Anchor, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function AuthPage() {
    const { t } = useLang();
    const [, setLocation] = useLocation();
    const [mode, setMode] = useState<"login" | "register">("login");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phone, setPhone] = useState("");

    const loginMutation = trpc.auth.login.useMutation({
        onSuccess: () => { window.location.href = "/"; },
        onError: (err) => toast.error(err.message),
    });

    const registerMutation = trpc.auth.register.useMutation({
        onSuccess: () => { window.location.href = "/"; },
        onError: (err) => toast.error(err.message),
    });

    const isPending = loginMutation.isPending || registerMutation.isPending;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (mode === "login") {
            loginMutation.mutate({ email, password });
        } else {
            registerMutation.mutate({ email, password, firstName, lastName, phone: phone || undefined });
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-2">
                    <div className="flex items-center justify-center mb-2">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <Anchor className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                    <CardTitle>{mode === "login" ? t.auth.login : t.auth.register}</CardTitle>
                    <CardDescription>Marina Crane Booking</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === "register" && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{t.auth.firstName} *</Label>
                                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t.auth.lastName} *</Label>
                                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>{t.auth.email} *</Label>
                            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                        </div>
                        <div className="space-y-2">
                            <Label>{t.auth.password} *</Label>
                            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} />
                        </div>
                        {mode === "register" && (
                            <div className="space-y-2">
                                <Label>{t.auth.phone}</Label>
                                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+385 91 234 5678" />
                            </div>
                        )}
                        <Button type="submit" className="w-full" disabled={isPending}>
                            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {mode === "login" ? t.auth.loginButton : t.auth.registerButton}
                        </Button>
                    </form>
                    <div className="mt-4 text-center">
                        <Button
                            variant="link"
                            className="text-sm"
                            onClick={() => setMode(mode === "login" ? "register" : "login")}
                        >
                            {mode === "login" ? t.auth.switchToRegister : t.auth.switchToLogin}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
