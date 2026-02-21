import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import { Anchor, Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type AuthMode = "login" | "register" | "forgotPassword" | "resetPassword";

export default function AuthPage() {
    const { t } = useLang();
    const [, setLocation] = useLocation();
    const [mode, setMode] = useState<AuthMode>("login");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [username, setUsername] = useState("");
    const [phone, setPhone] = useState("");
    const [token, setToken] = useState("");

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tkn = params.get("token");
        if (tkn) {
            setToken(tkn);
            setMode("resetPassword");
        }
    }, []);

    const loginMutation = trpc.auth.login.useMutation({
        onSuccess: () => { window.location.href = "/"; },
        onError: (err) => toast.error(err.message),
    });

    const registerMutation = trpc.auth.register.useMutation({
        onSuccess: () => { window.location.href = "/"; },
        onError: (err) => toast.error(err.message),
    });

    const forgotPasswordMutation = trpc.auth.forgotPassword.useMutation({
        onSuccess: () => {
            toast.success("Link za resetiranje je poslan na vaš email.");
            setMode("login");
        },
        onError: (err) => toast.error(err.message),
    });

    const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
        onSuccess: () => {
            toast.success("Lozinka je uspješno promijenjena. Sada se možete prijaviti.");
            setMode("login");
            // Clear URL params without reloading
            window.history.replaceState({}, document.title, window.location.pathname);
        },
        onError: (err) => toast.error(err.message),
    });

    const isPending = loginMutation.isPending || registerMutation.isPending || forgotPasswordMutation.isPending || resetPasswordMutation.isPending;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (mode === "login") {
            loginMutation.mutate({ email, password });
        } else if (mode === "register") {
            registerMutation.mutate({
                email,
                password,
                firstName,
                lastName,
                username: username || undefined,
                phone: phone || undefined
            });
        } else if (mode === "forgotPassword") {
            forgotPasswordMutation.mutate({ email });
        } else if (mode === "resetPassword") {
            if (password !== confirmPassword) {
                toast.error("Lozinke se ne podudaraju.");
                return;
            }
            resetPasswordMutation.mutate({ token, password });
        }
    };

    const getTitle = () => {
        if (mode === "login") return t.auth.login;
        if (mode === "register") return t.auth.register;
        if (mode === "forgotPassword") return (t.auth as any).forgotPasswordTitle;
        return (t.auth as any).resetPasswordTitle;
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
                    <CardTitle>{getTitle()}</CardTitle>
                    <CardDescription>
                        {mode === "forgotPassword"
                            ? (t.auth as any).forgotPasswordSubtitle
                            : "Marina Crane Booking"}
                    </CardDescription>
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

                        {(mode === "login" || mode === "register" || mode === "forgotPassword") && (
                            <div className="space-y-2">
                                <Label>{t.auth.email} *</Label>
                                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                            </div>
                        )}

                        {(mode === "login" || mode === "register" || mode === "resetPassword") && (
                            <div className="space-y-2">
                                <Label>{mode === "resetPassword" ? "Nova lozinka" : t.auth.password + " *"}</Label>
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={8}
                                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                                />
                            </div>
                        )}

                        {mode === "resetPassword" && (
                            <div className="space-y-2">
                                <Label>Potvrdi novu lozinku *</Label>
                                <Input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={8}
                                />
                            </div>
                        )}

                        {mode === "register" && (
                            <>
                                <div className="space-y-2">
                                    <Label>{t.auth.username}</Label>
                                    <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="npr. mario123" />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t.auth.phone}</Label>
                                    <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+385 91 234 5678" />
                                </div>
                            </>
                        )}

                        <Button type="submit" className="w-full" disabled={isPending}>
                            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {mode === "login" && t.auth.loginButton}
                            {mode === "register" && t.auth.registerButton}
                            {mode === "forgotPassword" && (t.auth as any).sendResetLink}
                            {mode === "resetPassword" && (t.auth as any).setNewPassword}
                        </Button>
                    </form>

                    <div className="mt-4 flex flex-col items-center gap-2">
                        {mode === "login" && (
                            <Button
                                variant="link"
                                size="sm"
                                className="px-0 h-auto"
                                onClick={() => setMode("forgotPassword")}
                            >
                                {(t.auth as any).forgotPassword}
                            </Button>
                        )}

                        {mode === "forgotPassword" && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="flex items-center gap-2"
                                onClick={() => setMode("login")}
                            >
                                <ArrowLeft className="h-4 w-4" />
                                {(t.auth as any).backToLogin}
                            </Button>
                        )}

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
