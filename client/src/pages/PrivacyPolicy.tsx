import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { useLang } from "@/contexts/LangContext";

export default function PrivacyPolicy() {
    const { lang } = useLang();
    const isHr = lang === 'hr';

    return (
        <div className="container max-w-4xl mx-auto py-12 px-4">
            <h1 className="text-3xl font-bold mb-8">
                {isHr ? "Politika Privatnosti" : "Privacy Policy"}
            </h1>

            <div className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>{isHr ? "1. Prikupljanje podataka" : "1. Data Collection"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-muted-foreground">
                            {isHr
                                ? "Marina app prikuplja samo podatke nužne za operativno izvršavanje usluge (rezervacije dizalice), što uključuje vaše ime, email adresu te kontakt broj, kao i specifikacije vaših registriranih plovila."
                                : "The Marina app collects only the data necessary for the operational execution of the service (crane reservations), which includes your name, email address, contact number, and the specifications of your registered vessels."}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{isHr ? "2. Svrha obrade" : "2. Purpose of Processing"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-muted-foreground">
                            {isHr
                                ? "Prikupljeni podaci koriste se isključivo u svrhe koordinacije rezervacija, verifikacije identiteta i komunikacije vezane uz usluge marine. Podaci se obrađuju na temelju nužnosti za izvršenje usluge (ugovora)."
                                : "The collected data is used exclusively for reservation coordination, identity verification, and communication related to marina services. Data is processed based on the necessity for the execution of the service (contract)."}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{isHr ? "3. Vaša prava (GDPR)" : "3. Your Rights (GDPR)"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-muted-foreground">
                        <p>
                            {isHr
                                ? "U skladu s GDPR-om, imate sljedeća prava:"
                                : "In accordance with GDPR, you have the following rights:"}
                        </p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>{isHr ? "Pravo na pristup i kopiju podataka" : "Right of access and a copy of the data"}</li>
                            <li>{isHr ? "Pravo na ispravak netočnih podataka" : "Right to rectification of inaccurate data"}</li>
                            <li>{isHr ? "Pravo na brisanje (pravo na zaborav)" : "Right to erasure (right to be forgotten)"}</li>
                            <li>{isHr ? "Pravo na ograničenje obrade i prenosivost podataka" : "Right to restriction of processing and data portability"}</li>
                        </ul>
                        <p>
                            {isHr
                                ? "Ova prava možete ostvariti kontaktiranjem administratora marine ili putem vašeg korisničkog profila."
                                : "You can exercise these rights by contacting the marina administrator or through your user profile."}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{isHr ? "4. Sigurnost i čuvanje" : "4. Security and Retention"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-muted-foreground">
                            {isHr
                                ? "Vaši podaci čuvaju se uz primjenu suvremenih sigurnosnih standarda. Podaci se čuvaju dokle god je vaš korisnički račun aktivan ili dok je to nužno za pružanje usluga i ispunjavanje zakonskih obveza."
                                : "Your data is stored using modern security standards. Data is retained as long as your user account is active or as necessary to provide services and fulfill legal obligations."}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-center mt-12">
                <Link href="/">
                    <a className="text-primary hover:underline">
                        {isHr ? "← Natrag na početnu stranicu" : "← Back to Home"}
                    </a>
                </Link>
            </div>
        </div>
    );
}

