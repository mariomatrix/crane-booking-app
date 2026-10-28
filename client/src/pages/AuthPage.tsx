import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLang } from "@/contexts/LangContext";
import {
  Anchor,
  Loader2,
  ArrowLeft,
  Mail,
  KeyRound,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Building2,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { isValidOib } from "@shared/oib";

type AuthMode =
  | "login"
  | "register"
  | "forgotPassword"
  | "resetPassword"
  | "verifyEmail"
  | "verifyMagicLink"
  | "otpRequest"
  | "otpVerify"
  | "claimMember";

export default function AuthPage() {
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<AuthMode>("login");
  const [claimTab, setClaimTab] = useState<"member" | "commercial">("member");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [oib, setOib] = useState("");
  const [matBroj, setMatBroj] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isLegalEntity, setIsLegalEntity] = useState(false);
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

  const verifyMagicLinkMutation = trpc.auth.verifyMagicLink.useMutation({
    onSuccess: (res) => {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (res.needsMemberClaim) {
        toast.info(
          "Prijava uspješna! Povežite svoj račun s članskim profilom PŠD Špinut."
        );
        setMode("claimMember");
      } else {
        toast.success("Uspješna prijava!");
        window.location.href = "/";
      }
    },
    onError: (err) => {
      toast.error(err.message);
      setMode("login");
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("mode");
    const urlError = params.get("error");
    const tkn = params.get("token");
    const vTkn = params.get("verifyToken");
    const magicTkn = params.get("magicToken");

    if (urlError) {
      const errorMessages: Record<string, string> = {
        google_auth_failed: "Google prijava nije uspjela. Pokušajte ponovno.",
        google_invalid_state:
          "Sigurnosna provjera (CSRF state) nije uspjela. Pokušajte ponovno.",
        google_missing_info: "Google račun nema potvrđenu email adresu.",
      };
      toast.error(errorMessages[urlError] || "Prijava nije uspjela.");
    }

    if (urlMode === "register" || urlMode === "login" || urlMode === "claimMember") {
      setMode(urlMode);
    }

    if (tkn) {
      setToken(tkn);
      setMode("resetPassword");
    } else if (vTkn) {
      setVerifyToken(vTkn);
      setMode("verifyEmail");
      verifyEmailMutation.mutate({ token: vTkn });
    } else if (magicTkn) {
      setMode("verifyMagicLink");
      verifyMagicLinkMutation.mutate({ token: magicTkn });
    }
  }, []);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
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
      window.history.replaceState({}, document.title, window.location.pathname);
    },
    onError: (err) => toast.error(err.message),
  });

  const sendOtpMutation = trpc.auth.sendEmailOtp.useMutation({
    onSuccess: () => {
      toast.success("6-znamenkasti kod za prijavu je poslan na vaš email.");
      setMode("otpVerify");
    },
    onError: (err) => toast.error(err.message),
  });

  const verifyOtpMutation = trpc.auth.verifyEmailOtp.useMutation({
    onSuccess: (res) => {
      if (res.needsMemberClaim) {
        toast.info(
          "Email je potvrđen! Povežite račun sa svojim članskim profilom."
        );
        setMode("claimMember");
      } else {
        toast.success("Uspješna prijava!");
        window.location.href = "/";
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const sendMagicLinkMutation = trpc.auth.sendMagicLink.useMutation({
    onSuccess: () => {
      toast.success(
        "Poveznica za prijavu jednim klikom je poslana na vaš email!"
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const claimMemberMutation = trpc.auth.claimMemberProfile.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Članski profil (${res.memberName}, mat. br. ${res.legacyMatBroj}) je uspješno povezan!`
      );
      window.location.href = "/";
    },
    onError: (err) => toast.error(err.message),
  });

  const requestCommercialMutation = trpc.auth.requestCommercialAccess.useMutation(
    {
      onSuccess: () => {
        toast.success(
          "Podaci su spremljeni! Vaš komercijalni korisnički račun je aktivan."
        );
        window.location.href = "/";
      },
      onError: (err) => toast.error(err.message),
    }
  );

  const isPending =
    loginMutation.isPending ||
    registerMutation.isPending ||
    forgotPasswordMutation.isPending ||
    resetPasswordMutation.isPending ||
    verifyEmailMutation.isPending ||
    verifyMagicLinkMutation.isPending ||
    sendOtpMutation.isPending ||
    verifyOtpMutation.isPending ||
    sendMagicLinkMutation.isPending ||
    claimMemberMutation.isPending ||
    requestCommercialMutation.isPending;

  const validateOibInput = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 11);
    setOib(clean);
    if (clean.length > 0 && clean.length < 11) {
      setOibError("OIB mora imati 11 znamenki.");
    } else if (clean.length === 11) {
      setOibError(
        isValidOib(clean)
          ? null
          : "OIB nije ispravan (pogrešna kontrolna znamenka)."
      );
    } else {
      setOibError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else if (mode === "otpRequest") {
      sendOtpMutation.mutate({ email });
    } else if (mode === "otpVerify") {
      verifyOtpMutation.mutate({ email, otp: otpCode.trim() });
    } else if (mode === "claimMember") {
      if (claimTab === "member") {
        const cleanOib = oib.trim();
        if (cleanOib.length !== 11 || !isValidOib(cleanOib)) {
          setOibError("Unesite ispravan OIB (11 znamenki).");
          return;
        }
        claimMemberMutation.mutate({
          oib: cleanOib,
          matBroj: matBroj.trim(),
        });
      } else {
        const cleanOib = oib.trim();
        if (cleanOib && (cleanOib.length !== 11 || !isValidOib(cleanOib))) {
          setOibError("Unesite ispravan OIB (11 znamenki).");
          return;
        }
        requestCommercialMutation.mutate({
          firstName,
          lastName,
          phone,
          oib: cleanOib || null,
          isLegalEntity,
          companyName: companyName || null,
        });
      }
    } else if (mode === "register") {
      if (!privacyAccepted) {
        toast.error(
          "Morate prihvatiti Uvjete korištenja i Politiku privatnosti za registraciju."
        );
        return;
      }
      const cleanOib = oib.trim();
      if (cleanOib) {
        if (cleanOib.length !== 11 || !isValidOib(cleanOib)) {
          setOibError("Unesite ispravan OIB (11 znamenki).");
          return;
        }
      }
      registerMutation.mutate({
        email,
        password,
        firstName,
        lastName,
        username: username || undefined,
        phone,
        oib: cleanOib || undefined,
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
    if (mode === "otpRequest") return "Prijava bez lozinke (OTP / Magic Link)";
    if (mode === "otpVerify") return "Unesite jednokratni kod";
    if (mode === "claimMember") return "Aktivacija i povezivanje računa";
    if (mode === "forgotPassword") return (t.auth as any).forgotPasswordTitle;
    if (mode === "verifyEmail" || mode === "verifyMagicLink")
      return "Provjera vjerodajnica";
    return (t.auth as any).resetPasswordTitle;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center mb-2">
            <img
              src="/logo.png"
              alt="PŠD Špinut Logo"
              className="h-12 w-auto object-contain max-w-[200px]"
            />
          </div>
          <CardTitle>{getTitle()}</CardTitle>
          <CardDescription>
            {mode === "forgotPassword"
              ? (t.auth as any).forgotPasswordSubtitle
              : mode === "verifyEmail" || mode === "verifyMagicLink"
                ? "Molimo pričekajte dok potvrdimo vašu prijavu..."
                : mode === "claimMember"
                  ? "Povežite prijavu sa svojim članskim brojem i plovilima u PŠD Špinut"
                  : "Marina Crane Booking — PŠD Špinut"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "verifyEmail" || mode === "verifyMagicLink" ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : mode === "claimMember" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
                <Button
                  type="button"
                  variant={claimTab === "member" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setClaimTab("member")}
                  className="flex items-center gap-1.5"
                >
                  <UserCheck className="h-4 w-4" />
                  Član PŠD Špinut
                </Button>
                <Button
                  type="button"
                  variant={claimTab === "commercial" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setClaimTab("commercial")}
                  className="flex items-center gap-1.5"
                >
                  <Building2 className="h-4 w-4" />
                  Vanjski korisnik
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {claimTab === "member" ? (
                  <>
                    <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 p-3 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        Automatsko spajanje s članskom bazom
                      </p>
                      <p>
                        Unesite svoj <strong>OIB</strong> i{" "}
                        <strong>Matični broj člana</strong> kako bismo vaš račun
                        povezali s vašim plovilima i vezom u lučici.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>OIB člana (11 znamenki) *</Label>
                      <Input
                        value={oib}
                        onChange={(e) => validateOibInput(e.target.value)}
                        placeholder="12345678901"
                        maxLength={11}
                        inputMode="numeric"
                        required
                      />
                      {oibError && (
                        <p className="text-xs text-destructive">{oibError}</p>
                      )}
                      {oib.length === 11 && !oibError && (
                        <p className="text-xs text-green-600">
                          OIB je ispravan ✓
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Matični broj člana (s članske iskaznice) *</Label>
                      <Input
                        value={matBroj}
                        onChange={(e) => setMatBroj(e.target.value)}
                        placeholder="npr. 1245 ili 001245"
                        required
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={isPending}>
                      {isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Poveži članski profil i aktiviraj račun
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
                      Kao vanjski (komercijalni) korisnik možete odmah nakon
                      unosa podataka dodati svoje plovilo i podnositi zahtjeve
                      za dizalicu prema komercijalnom cjeniku.
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Ime *</Label>
                        <Input
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Prezime *</Label>
                        <Input
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Broj mobitela *</Label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+385 91 234 5678"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>OIB (opcionalno)</Label>
                      <Input
                        value={oib}
                        onChange={(e) => validateOibInput(e.target.value)}
                        placeholder="12345678901"
                        maxLength={11}
                        inputMode="numeric"
                      />
                      {oibError && (
                        <p className="text-xs text-destructive">{oibError}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label>Naziv tvrtke / obrta (opcionalno)</Label>
                      <Input
                        value={companyName}
                        onChange={(e) => {
                          setCompanyName(e.target.value);
                          setIsLegalEntity(Boolean(e.target.value.trim()));
                        }}
                        placeholder="Za pravne osobe"
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={isPending}>
                      {isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Spremi podatke i nastavi u aplikaciju
                    </Button>
                  </>
                )}
              </form>

              <div className="text-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    window.location.href = "/";
                  }}
                >
                  Nastavi na početnu stranicu
                </Button>
              </div>
            </div>
          ) : (
            <>
              {(mode === "login" || mode === "otpRequest") && (
                <div className="space-y-3 mb-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2 font-medium"
                    onClick={() => {
                      window.location.href = "/auth/google";
                    }}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Prijava putem Google računa
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full flex items-center justify-center gap-2 text-xs"
                    onClick={() =>
                      setMode(mode === "login" ? "otpRequest" : "login")
                    }
                  >
                    {mode === "login" ? (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Prijava bez lozinke (Email kod ili Magic Link)
                      </>
                    ) : (
                      <>
                        <KeyRound className="h-3.5 w-3.5" />
                        Klasična prijava s lozinkom
                      </>
                    )}
                  </Button>

                  <div className="relative my-2">
                    <Separator />
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "register" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t.auth.firstName} *</Label>
                      <Input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.auth.lastName} *</Label>
                      <Input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}

                {(mode === "login" ||
                  mode === "register" ||
                  mode === "forgotPassword" ||
                  mode === "otpRequest") && (
                  <div className="space-y-2">
                    <Label>{t.auth.email} *</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="ime.prezime@primjer.hr"
                    />
                  </div>
                )}

                {mode === "otpVerify" && (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground text-center">
                      Poslali smo 6-znamenkasti kod na <strong>{email}</strong>
                    </div>
                    <div className="space-y-2">
                      <Label>6-znamenkasti kod *</Label>
                      <Input
                        value={otpCode}
                        onChange={(e) =>
                          setOtpCode(
                            e.target.value.replace(/\D/g, "").slice(0, 6)
                          )
                        }
                        placeholder="123456"
                        maxLength={6}
                        inputMode="numeric"
                        className="text-center text-2xl tracking-widest font-mono"
                        required
                      />
                    </div>
                  </div>
                )}

                {(mode === "login" ||
                  mode === "register" ||
                  mode === "resetPassword") && (
                  <div className="space-y-2">
                    <Label>
                      {mode === "resetPassword"
                        ? "Nova lozinka"
                        : t.auth.password + " *"}
                    </Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={mode === "login" ? undefined : 8}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
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
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="npr. mario123"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.auth.phone} *</Label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+385 91 234 5678"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>OIB (opcionalno)</Label>
                      <Input
                        value={oib}
                        onChange={(e) => validateOibInput(e.target.value)}
                        placeholder="12345678901 (nije obavezno)"
                        maxLength={11}
                        inputMode="numeric"
                      />
                      {oibError && (
                        <p className="text-xs text-destructive">{oibError}</p>
                      )}
                      {oib.length === 11 && !oibError && (
                        <p className="text-xs text-green-600">
                          OIB je ispravan ✓
                        </p>
                      )}
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
                      <Label
                        htmlFor="privacy-policy"
                        className="cursor-pointer text-muted-foreground font-normal"
                      >
                        {(t.auth as any).privacyLabel}
                        <a
                          href="/privacy"
                          target="_blank"
                          className="text-primary hover:underline"
                        >
                          {(t.auth as any).privacyLink}
                        </a>{" "}
                        *
                      </Label>
                    </div>
                  </>
                )}

                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {mode === "login" && t.auth.loginButton}
                  {mode === "register" && t.auth.registerButton}
                  {mode === "forgotPassword" && (t.auth as any).sendResetLink}
                  {mode === "resetPassword" && (t.auth as any).setNewPassword}
                  {mode === "otpRequest" && "Pošalji 6-znamenkasti kod na email"}
                  {mode === "otpVerify" && "Potvrdi kod i prijavi se"}
                </Button>

                {mode === "otpRequest" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2"
                    disabled={isPending || !email.trim()}
                    onClick={() => {
                      if (!email.trim()) {
                        toast.error("Unesite svoju email adresu.");
                        return;
                      }
                      sendMagicLinkMutation.mutate({ email: email.trim() });
                    }}
                  >
                    <Mail className="h-4 w-4" />
                    Pošalji Magic Link (prijava jednim klikom)
                  </Button>
                )}
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

                {(mode === "forgotPassword" || mode === "otpVerify") && (
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
                  onClick={() =>
                    setMode(mode === "login" ? "register" : "login")
                  }
                >
                  {mode === "login"
                    ? t.auth.switchToRegister
                    : t.auth.switchToLogin}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
