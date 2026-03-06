import { useState } from "react";
import { Check, ChevronsUpDown, X, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

export interface UserOption {
    id: string;
    name: string | null;
    email: string;
}

interface UserSearchComboboxProps {
    users: UserOption[];
    value: string;          // "all" or a user ID
    onChange: (id: string) => void;
    placeholder?: string;
    emptyLabel?: string;
    allLabel?: string;
    className?: string;
}

export function UserSearchCombobox({
    users,
    value,
    onChange,
    placeholder = "Traži korisnika...",
    emptyLabel = "Nema rezultata.",
    allLabel = "Svi korisnici",
    className,
}: UserSearchComboboxProps) {
    const [open, setOpen] = useState(false);

    const selectedUser = value !== "all" ? users.find((u) => u.id === value) : null;
    const displayLabel = selectedUser
        ? (selectedUser.name || selectedUser.email)
        : allLabel;

    return (
        <div className={cn("flex items-center gap-1.5", className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-[240px] h-9 justify-between text-sm font-normal"
                    >
                        <span className="flex items-center gap-2 truncate">
                            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{displayLabel}</span>
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0" align="start">
                    <Command>
                        <CommandInput placeholder={placeholder} />
                        <CommandList>
                            <CommandEmpty>{emptyLabel}</CommandEmpty>
                            <CommandGroup>
                                <CommandItem
                                    value="__all__"
                                    keywords={["svi", "all", "svi korisnici"]}
                                    onSelect={() => {
                                        onChange("all");
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === "all" ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {allLabel}
                                </CommandItem>
                                {users.map((user) => (
                                    <CommandItem
                                        key={user.id}
                                        value={user.id}
                                        keywords={[
                                            user.name || "",
                                            user.email,
                                        ]}
                                        onSelect={() => {
                                            onChange(user.id);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === user.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <div className="flex flex-col min-w-0">
                                            <span className="truncate text-sm font-medium">
                                                {user.name || "—"}
                                            </span>
                                            <span className="truncate text-xs text-muted-foreground">
                                                {user.email}
                                            </span>
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {value !== "all" && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onChange("all")}
                    title="Ukloni filtar"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    );
}
