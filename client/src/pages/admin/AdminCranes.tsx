import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CraneTypeBadge } from "@/components/CraneTypeBadge";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Construction, Loader2, MapPin, Pencil, Plus, Trash2, Weight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CRANE_TYPES = [
  { value: "tower", label: "Tower" },
  { value: "mobile", label: "Mobile" },
  { value: "crawler", label: "Crawler" },
  { value: "overhead", label: "Overhead" },
  { value: "telescopic", label: "Telescopic" },
  { value: "loader", label: "Loader" },
  { value: "other", label: "Other" },
];

type CraneForm = {
  name: string;
  type: string;
  capacity: string;
  capacityUnit: string;
  description: string;
  location: string;
  dailyRate: string;
  imageUrl: string;
};

const emptyForm: CraneForm = {
  name: "",
  type: "tower",
  capacity: "",
  capacityUnit: "tons",
  description: "",
  location: "",
  dailyRate: "",
  imageUrl: "",
};

export default function AdminCranes() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CraneForm>(emptyForm);
  const utils = trpc.useUtils();

  const { data: cranesList = [], isLoading } = trpc.crane.list.useQuery({ activeOnly: false });

  const createMutation = trpc.crane.create.useMutation({
    onSuccess: () => {
      toast.success("Crane added successfully.");
      utils.crane.list.invalidate();
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.crane.update.useMutation({
    onSuccess: () => {
      toast.success("Crane updated successfully.");
      utils.crane.list.invalidate();
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.crane.delete.useMutation({
    onSuccess: () => {
      toast.success("Crane deactivated.");
      utils.crane.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (crane: (typeof cranesList)[0]) => {
    setEditingId(crane.id);
    setForm({
      name: crane.name,
      type: crane.type,
      capacity: crane.capacity,
      capacityUnit: crane.capacityUnit,
      description: crane.description ?? "",
      location: crane.location ?? "",
      dailyRate: crane.dailyRate ?? "",
      imageUrl: crane.imageUrl ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.capacity) {
      toast.error("Name and capacity are required.");
      return;
    }
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name: form.name,
        type: form.type as any,
        capacity: form.capacity,
        capacityUnit: form.capacityUnit,
        description: form.description || undefined,
        location: form.location || undefined,
        dailyRate: form.dailyRate || undefined,
        imageUrl: form.imageUrl || undefined,
      });
    } else {
      createMutation.mutate({
        name: form.name,
        type: form.type as any,
        capacity: form.capacity,
        capacityUnit: form.capacityUnit,
        description: form.description || undefined,
        location: form.location || undefined,
        dailyRate: form.dailyRate || undefined,
        imageUrl: form.imageUrl || undefined,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Crane Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Manage your crane inventory.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Crane
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : cranesList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Construction className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No cranes yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first crane to get started.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Crane
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {cranesList.map((crane) => (
            <Card key={crane.id} className={!crane.isActive ? "opacity-60" : ""}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{crane.name}</span>
                      <CraneTypeBadge type={crane.type} />
                      {!crane.isActive && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Weight className="h-3.5 w-3.5" />
                      {crane.capacity} {crane.capacityUnit}
                      {crane.dailyRate && (
                        <span className="ml-3">€{crane.dailyRate}/day</span>
                      )}
                    </div>
                    {crane.location && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {crane.location}
                      </div>
                    )}
                    {crane.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {crane.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openEdit(crane)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    {crane.isActive && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive">
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Deactivate
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Deactivate Crane?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This crane will be hidden from the booking system. Existing reservations will not be affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate({ id: crane.id })}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Deactivate
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Crane" : "Add New Crane"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Liebherr LTM 1300"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRANE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Capacity *</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    placeholder="e.g., 300"
                    required
                  />
                  <Input
                    value={form.capacityUnit}
                    onChange={(e) => setForm({ ...form, capacityUnit: e.target.value })}
                    placeholder="tons"
                    className="w-20"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g., Zagreb"
                />
              </div>
              <div className="space-y-2">
                <Label>Daily Rate (€)</Label>
                <Input
                  value={form.dailyRate}
                  onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
                  placeholder="e.g., 1500"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the crane specifications..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Save Changes" : "Add Crane"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
