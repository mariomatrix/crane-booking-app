import { useState, useMemo, useEffect } from "react";
import { Check, ChevronsUpDown, X, Users, Loader2 } from "lucide-react";
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
import { trpc } from "@/lib/trpc";

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
    users?: UserOption[];
    value: string;          // "all" or a user ID
    onChange: (id: string, user?: UserOption) => void;
    initialUser?: UserOption | null;
    placeholder?: string;
    emptyLabel?: string;
    allLabel?: string;
    showAllOption?: boolean;
    className?: string;
    disabled?: boolean;
}

export function UserSearchCombobox({
    users = [],
    value,
    onChange,
    initialUser,
    placeholder = "Traži po imenu, prezimenu, tvrtki ili OIB-u...",
    emptyLabel = "Nema rezultata.",
    allLabel = "Svi korisnici",
    showAllOption = true,
    className,
    disabled = false,
}: UserSearchComboboxProps) {
    const [open, setOpen] = useState(false);
    const [searchValue, setSearchValue] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [cachedUsers, setCachedUsers] = useState<Record<string, UserOption>>({});

    // Debounce search query to reduce server load
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchValue.trim());
        }, 250);
        return () => clearTimeout(timer);
    }, [searchValue]);

    // Cache initialUser if provided
    useEffect(() => {
        if (initialUser?.id) {
            setCachedUsers((prev) => ({ ...prev, [initialUser.id]: initialUser }));
        }
    }, [initialUser]);

    // Live search query when user types in search input
    const isSearching = debouncedSearch.length > 0;
    const searchQuery = trpc.user.list.useQuery(
        { search: debouncedSearch, pageSize: 50 },
        { enabled: open && isSearching }
    );

    // Fallback default query if users prop is empty
    const shouldFetchDefault = open && !isSearching && users.length === 0;
    const defaultUsersQuery = trpc.user.list.useQuery(
        { pageSize: 50 },
        { enabled: shouldFetchDefault }
    );

    // Resolve user by ID if value is set but user object is not yet loaded
    const isValueInProvidedUsers = users.some((u) => u.id === value);
    const shouldFetchById =
        !!value &&
        value !== "all" &&
        !cachedUsers[value] &&
        !isValueInProvidedUsers;

    const userByIdQuery = trpc.user.getById.useQuery(
        { id: value },
        { enabled: shouldFetchById }
    );

    useEffect(() => {
        if (userByIdQuery.data) {
            const fetched = userByIdQuery.data as any;
            if (fetched?.id) {
                setCachedUsers((prev) => ({ ...prev, [fetched.id]: fetched }));
            }
        }
    }, [userByIdQuery.data]);

    // Determine current active list of candidate users
    const candidateUsers = useMemo(() => {
        if (isSearching) {
            return (searchQuery.data?.data as UserOption[] | undefined) || [];
        }
        if (users.length > 0) {
            return users;
        }
        return (defaultUsersQuery.data?.data as UserOption[] | undefined) || [];
    }, [isSearching, searchQuery.data?.data, users, defaultUsersQuery.data?.data]);

    // Cache any newly seen candidates
    useEffect(() => {
        if (candidateUsers.length > 0) {
            setCachedUsers((prev) => {
                let updated = false;
                const next = { ...prev };
                for (const u of candidateUsers) {
                    if (!next[u.id]) {
                        next[u.id] = u;
                        updated = true;
                    }
                }
                return updated ? next : prev;
            });
        }
    }, [candidateUsers]);

    // Find selected user
    const selectedUser = useMemo(() => {
        if (!value || value === "all") return null;
        return (
            candidateUsers.find((u) => u.id === value) ||
            cachedUsers[value] ||
            users.find((u) => u.id === value) ||
            (initialUser?.id === value ? initialUser : null)
        );
    }, [candidateUsers, cachedUsers, users, initialUser, value]);

    // Ensure selectedUser is always visible in the list even if not in current search results
    const displayedUsers = useMemo(() => {
        let list = [...candidateUsers];
        if (selectedUser && !list.some((u) => u.id === selectedUser.id)) {
            list = [selectedUser, ...list];
        }
        return list;
    }, [candidateUsers, selectedUser]);

    const displayLabel = selectedUser
        ? (selectedUser.name || `${selectedUser.firstName || ""} ${selectedUser.lastName || ""}`.trim() || "Korisnik") +
          (selectedUser.oib ? ` (${selectedUser.oib})` : "")
        : (showAllOption ? allLabel : "Odaberite korisnika...");

    const handleSelect = (user: UserOption) => {
        setCachedUsers((prev) => ({ ...prev, [user.id]: user }));
        onChange(user.id, user);
        setOpen(false);
        setSearchValue("");
    };

    const isFetchingUsers = isSearching && (searchQuery.isFetching || searchQuery.isLoading);

    return (
        <div className={cn("flex items-center gap-1.5", className)}>
            <Popover open={disabled ? false : open} onOpenChange={(val) => !disabled && setOpen(val)}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled}
                        className={cn(
                            "w-full h-9 justify-between text-sm font-normal bg-background",
                            disabled && "opacity-80 bg-muted/40 cursor-not-allowed border-dashed"
                        )}
                    >
                        <span className="flex items-center gap-2 truncate">
                            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{displayLabel}</span>
                        </span>
                        {!disabled ? (
                            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        ) : (
                            <span className="text-xs text-muted-foreground shrink-0">🔒</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                    <Command shouldFilter={false}>
                        <div className="relative flex items-center">
                            <CommandInput
                                value={searchValue}
                                onValueChange={setSearchValue}
                                placeholder={placeholder}
                                className="pr-8"
                            />
                            {isFetchingUsers && (
                                <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />
                            )}
                        </div>
                        <CommandList>
                            {displayedUsers.length === 0 && (
                                <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                                    {isFetchingUsers ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                            <span>Pretraživanje baze...</span>
                                        </div>
                                    ) : (
                                        emptyLabel
                                    )}
                                </CommandEmpty>
                            )}
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
                                {displayedUsers.map((user) => {
                                    const userName =
                                        user.name ||
                                        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
                                        "—";
                                    const subInfo = [
                                        user.oib ? `OIB: ${user.oib}` : null,
                                        user.phone || user.email || null,
                                    ]
                                        .filter(Boolean)
                                        .join(" · ");

                                    const isSelected = value === user.id;

                                    return (
                                        <CommandItem
                                            key={user.id}
                                            value={user.id}
                                            onSelect={() => handleSelect(user)}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4 shrink-0",
                                                    isSelected ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            <div className="flex flex-col min-w-0">
                                                <span className="truncate text-sm font-medium">
                                                    {userName}
                                                </span>
                                                {subInfo && (
                                                    <span className="truncate text-xs text-muted-foreground">
                                                        {subInfo}
                                                    </span>
                                                )}
                                            </div>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {value !== "all" && value !== "" && !disabled && (
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
