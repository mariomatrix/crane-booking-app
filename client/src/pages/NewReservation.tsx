import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

export default function NewReservation() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [craneId, setCraneId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [notes, setNotes] = useState("");

  const { data: cranesList = [], isLoading: cranesLoading } = trpc.crane.list.useQuery();

  const createMutation = trpc.reservation.create.useMutation({
    onSuccess: () => {
      toast.success("Reservation request submitted successfully! An administrator will review it shortly.");
      setLocation("/my-reservations");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              You need to be signed in to request a crane reservation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => { window.location.href = getLoginUrl(); }}
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!craneId || !startDate || !endDate) {
      toast.error("Please fill in all required fields.");
      return;
    }
    createMutation.mutate({
      craneId: Number(craneId),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      projectLocation: projectLocation || undefined,
      projectDescription: projectDescription || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container py-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            className="mb-2 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Calendar
          </Button>
          <h1 className="text-xl font-semibold">New Reservation Request</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fill out the form below to request a crane reservation. An administrator will review your request.
          </p>
        </div>
      </div>

      <div className="container py-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Reservation Details</CardTitle>
            <CardDescription>
              Fields marked with * are required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Crane Selection */}
              <div className="space-y-2">
                <Label htmlFor="crane">Crane *</Label>
                <Select value={craneId} onValueChange={setCraneId}>
                  <SelectTrigger>
                    <SelectValue placeholder={cranesLoading ? "Loading cranes..." : "Select a crane"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cranesList.map((crane) => (
                      <SelectItem key={crane.id} value={String(crane.id)}>
                        {crane.name} — {crane.type} ({crane.capacity} {crane.capacityUnit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date *</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>
              </div>

              {/* Project Location */}
              <div className="space-y-2">
                <Label htmlFor="projectLocation">Project Location</Label>
                <Input
                  id="projectLocation"
                  placeholder="e.g., Zagreb, Slavonska avenija 42"
                  value={projectLocation}
                  onChange={(e) => setProjectLocation(e.target.value)}
                />
              </div>

              {/* Project Description */}
              <div className="space-y-2">
                <Label htmlFor="projectDescription">Project Description</Label>
                <Textarea
                  id="projectDescription"
                  placeholder="Describe the project and how the crane will be used..."
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Additional Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any special requirements or notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Reservation Request
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
