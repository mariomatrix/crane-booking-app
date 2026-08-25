import { useState, useMemo } from "react";
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
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    oib?: string | null;
    phone?: string | null;
    isLegalEntity?: boolean | null;
    vessels?: Array<{ registration?: string | null; name?: string | null }>;
}

interface UserSearchComboboxProps {
    users: UserOption[];
    value: string;          // "all" or a user ID
    onChange: (id: string) => void;
    initialUser?: UserOption | null;
    placeholder?: string;
    emptyLabel?: string;
    allLabel?: string;
    showAllOption?: boolean;
    className?: string;
}

export function UserSearchCombobox({
    users,
    value,
    onChange,
    initialUser,
    placeholder = "Traži po imenu, prezimenu, tvrtki, OIB-u ili registraciji...",
    emptyLabel = "Nema rezultata.",
    allLabel = "Svi korisnici",
    showAllOption = true,
    className,
}: UserSearchComboboxProps) {
    const [open, setOpen] = useState(false);
    const [searchValue, setSearchValue] = useState("");

    // Find selected user from users array or fallback to initialUser
    const selectedUser = useMemo(() => {
        if (!value || value === "all") return null;
        return users.find((u) => u.id === value) || (initialUser?.id === value ? initialUser : null);
    }, [users, value, initialUser]);

    const selectedVessels = selectedUser?.vessels?.map(v => v.registration).filter(Boolean).join(", ");
    const displayLabel = selectedUser
        ? (selectedUser.name || `${selectedUser.firstName || ""} ${selectedUser.lastName || ""}`.trim() || "Korisnik") +
          (selectedUser.oib ? ` (${selectedUser.oib})` : "") +
          (selectedVessels ? ` · [${selectedVessels}]` : "")
        : (showAllOption ? allLabel : "Odaberite korisnika...");

    // Filter users using word-boundary prefix match for all typed tokens
    const filteredUsers = useMemo(() => {
        const query = searchValue.trim().toLowerCase();
        if (!query) return users;

        const tokens = query.split(/\s+/).filter(Boolean);

        return users.filter((user) => {
            const vesselRegs = user.vessels?.map(v => v.registration || "").join(" ") || "";
            const vesselNames = user.vessels?.map(v => v.name || "").join(" ") || "";
            const combined = `${user.name || ""} ${user.firstName || ""} ${user.lastName || ""} ${user.oib || ""} ${user.email || ""} ${vesselRegs} ${vesselNames}`.toLowerCase();
            const words = combined.split(/[\s,.-]+/).filter(Boolean);

            // Every token must match the beginning of at least one word
            return tokens.every(token => words.some(word => word.startsWith(token)));
        });
    }, [users, searchValue]);

    return (
        <div className={cn("flex items-center gap-1.5", className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full h-9 justify-between text-sm font-normal bg-background"
                    >
                        <span className="flex items-center gap-2 truncate">
                            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{displayLabel}</span>
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[340px] p-0" align="start">
                    <Command shouldFilter={false}>
                        <CommandInput
                            value={searchValue}
                            onValueChange={setSearchValue}
                            placeholder={placeholder}
                        />
                        <CommandList>
                            {filteredUsers.length === 0 && <CommandEmpty>{emptyLabel}</CommandEmpty>}
                            <CommandGroup>
                                {showAllOption && (
                                    <CommandItem
                                        value="__all__"
                                        onSelect={() => {
                                            onChange("all");
                                            setOpen(false);
                                            setSearchValue("");
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
                                )}
                                {filteredUsers.map((user) => {
                                    const vesselRegs = user.vessels?.map(v => v.registration).filter(Boolean) as string[] || [];
                                    const userName = user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "—";

                                    return (
                                        <CommandItem
                                            key={user.id}
                                            value={user.id}
                                            onSelect={() => {
                                                onChange(user.id);
                                                setOpen(false);
                                                setSearchValue("");
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4 shrink-0",
                                                    value === user.id ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            <div className="flex flex-col min-w-0">
                                                <span className="truncate text-sm font-medium">
                                                    {userName}
                                                </span>
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {user.oib ? `OIB: ${user.oib}` : ""}
                                                    {user.oib && vesselRegs.length > 0 ? " · " : ""}
                                                    {vesselRegs.length > 0 ? `Reg: ${vesselRegs.join(", ")}` : ""}
                                                </span>
                                            </div>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {value !== "all" && value !== "" && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onChange(showAllOption ? "all" : "")}
                    title="Poništi odabir"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    );
}
