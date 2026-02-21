import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLang } from "@/contexts/LangContext";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { ReservationForm } from "@/components/ReservationForm";

export default function NewReservation() {
  const [, setLocation] = useLocation();
  const { t } = useLang();

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container py-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-2 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t.nav.calendar}
          </Button>
          <h1 className="text-xl font-semibold">{t.form.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.form.subtitle}</p>
        </div>
      </div>

      <div className="container py-6">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>{t.form.selectCrane}</CardTitle>
            <CardDescription>
              {t.form.subtitle}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReservationForm
              onSuccess={() => setLocation("/my-reservations")}
              onCancel={() => setLocation("/")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
