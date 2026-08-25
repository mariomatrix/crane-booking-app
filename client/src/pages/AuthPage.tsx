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
import { getOibError } from "@shared/oib";

type AuthMode = "login" | "register" | "forgotPassword" | "resetPassword" | "verifyEmail";

export default function AuthPage() {
    const { t } = useLang();
    const [, setLocation] = useLocation();
    const [mode, setMode] = useState<AuthMode>("login");

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlMode = params.get("mode");
        if (urlMode === "register" || urlMode === "login") {
            setMode(urlMode);
        }
    }, []);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [username, setUsername] = useState("");
    const [phone, setPhone] = useState("");
    const [oib, setOib] = useState("");
    const [oibError, setOibError] = useState<string | null>(null);
    const [token, setToken] = useState("");
    const [verifyToken, setVerifyToken] = useState("");
    const [privacyAccepted, setPrivacyAccepted] = useState(false);

    const verifyEmailMutation = trpc.auth.verifyEmail.useMutation({
        onSuccess: () => {
            toast.success("Email je uspješno potvrđen. Sada se možete prijaviti.");
            setMode("login");
            window.history.replaceState({}, document.title, window.location.pathname);
        },
        onError: (err) => toast.error(err.message),
    });

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tkn = params.get("token");
        const vTkn = params.get("verifyToken");

        if (tkn) {
            setToken(tkn);
            setMode("resetPassword");
        } else if (vTkn) {
            setVerifyToken(vTkn);
            setMode("verifyEmail");
            verifyEmailMutation.mutate({ token: vTkn });
        }
    }, [verifyEmailMutation.mutate]);

    const loginMutation = trpc.auth.login.useMutation({
        onSuccess: () => { window.location.href = "/"; },
        onError: (err) => toast.error(err.message),
    });

    const registerMutation = trpc.auth.register.useMutation({
        onSuccess: () => {
            toast.success("Registracija uspješna. Molimo potvrdite email.");
            window.location.href = "/";
        },
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

    const isPending = loginMutation.isPending || registerMutation.isPending || forgotPasswordMutation.isPending || resetPasswordMutation.isPending || verifyEmailMutation.isPending;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (mode === "login") {
            loginMutation.mutate({ email, password });
        } else if (mode === "register") {
            if (!privacyAccepted) {
                toast.error("Morate prihvatiti Uvjete korištenja i Politiku privatnosti za registraciju.");
                return;
            }
            const err = getOibError(oib);
            if (err) {
                setOibError(err);
                return;
            }
            registerMutation.mutate({
                email,
                password,
                firstName,
                lastName,
                username: username || undefined,
                phone,
                oib,
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
        if (mode === "verifyEmail") return "Potvrda email adrese";
        return (t.auth as any).resetPasswordTitle;
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-2">
                    <div className="flex items-center justify-center mb-2">
                        <img src="/logo.png" alt="PŠD Špinut Logo" className="h-12 w-auto object-contain max-w-[200px]" />
                    </div>
                    <CardTitle>{getTitle()}</CardTitle>
                    <CardDescription>
                        {mode === "forgotPassword"
                            ? (t.auth as any).forgotPasswordSubtitle
                            : mode === "verifyEmail"
                                ? "Molimo pričekajte dok potvrdimo vašu email adresu..."
                                : "Marina Crane Booking"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {mode === "verifyEmail" ? (
                        <div className="flex flex-col items-center justify-center py-8 space-y-4">
                            {verifyEmailMutation.isPending ? (
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            ) : verifyEmailMutation.isError ? (
                                <div className="text-destructive text-center">
                                    <p>Došlo je do pogreške prilikom potvrde emaila.</p>
                                    <Button variant="link" onClick={() => setMode("login")}>Povratak na prijavu</Button>
                                </div>
                            ) : null}
                        </div>
                    ) : (
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
                                        minLength={mode === "login" ? undefined : 8}
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
                                        <Label>{t.auth.phone} *</Label>
                                        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+385 91 234 5678" required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>OIB *</Label>
                                        <Input
                                            value={oib}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                                                setOib(val);
                                                if (val.length === 11) {
                                                    setOibError(getOibError(val));
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
                                    <div className="flex items-center space-x-2 mt-4 text-sm">
                                        <Input
                                            type="checkbox"
                                            id="privacy-policy"
                                            className="w-4 h-4 cursor-pointer"
                                            checked={privacyAccepted}
                                            onChange={(e) => setPrivacyAccepted(e.target.checked)}
                                            required
                                        />
                                        <Label htmlFor="privacy-policy" className="cursor-pointer text-muted-foreground font-normal">
                                            {(t.auth as any).privacyLabel}
                                            <a href="/privacy" target="_blank" className="text-primary hover:underline">
                                                {(t.auth as any).privacyLink}
                                            </a> *
                                        </Label>
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
                    )}



                    {mode !== "verifyEmail" && (
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
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
