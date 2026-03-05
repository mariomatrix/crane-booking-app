import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function PrivacyPolicy() {
    return (
        <div className="container max-w-4xl mx-auto py-12 px-4">
            <h1 className="text-3xl font-bold mb-8">Politika Privatnosti</h1>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>1. Prikupljanje podataka</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Marina app prikuplja samo podatke nužne za operativno izvršavanje usluge (rezervacije dizalice), što uključuje vaše ime, email adresu te kontakt broj, kao i specifikacije vaših registriranih plovila.
                    </p>
                </CardContent>
            </Card>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>2. Korištenje i obrada podataka</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Prikupljeni podaci koriste se isključivo u svrhe koordinacije, verifikacije identiteta i kontaktiranja vezano za zatražene usluge unutar Marine. Podaci se ne dijele s trećim stranama u marketinške svrhe, već ostaju isključivo unutar sigurnog sustava.
                    </p>
                </CardContent>
            </Card>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>3. Vaša prava i brisanje (GDPR)</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Praćenjem GDPR regulative, imate pravo zatražiti trajno uklanjanje vaših osobnih podataka iz našeg sustava ("Pravo na zaborav"). Vaš korisnički profil možete zatražiti da se potpuno anonimizira preko administratora marine. Također, uvijek možete preuzeti kopiju svojih vezanih osobnih podataka iz vlastitog Korisničkog profila (opcija "Preuzmi moje podatke").
                    </p>
                </CardContent>
            </Card>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>4. Sigurnost</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Vaši podaci čuvaju se uz najviši stupanj sigurnosti i zaštite, koristeći suvremenu enkripciju i sigurnosne standarde prilikom prijenosa i pohrane u bazi.
                    </p>
                </CardContent>
            </Card>

            <div className="flex justify-center mt-12">
                <Link href="/">
                    <a className="text-primary hover:underline">← Natrag na početnu stranicu</a>
                </Link>
            </div>
        </div>
    );
}
