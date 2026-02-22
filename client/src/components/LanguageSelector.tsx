import { useLang } from "@/contexts/LangContext";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";

export function LanguageSelector({ variant = "ghost", showLabel = true }: { variant?: "ghost" | "outline" | "default", showLabel?: boolean }) {
    const { lang, setLang } = useLang();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant={variant} size="sm" className="gap-2">
                    <Languages className="h-4 w-4" />
                    {showLabel && (
                        <span className="uppercase text-xs font-medium">{lang}</span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem
                    onClick={() => setLang("hr")}
                    className={lang === "hr" ? "bg-accent text-accent-foreground" : "cursor-pointer"}
                >
                    Hrvatski (HR)
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => setLang("en")}
                    className={lang === "en" ? "bg-accent text-accent-foreground" : "cursor-pointer"}
                >
                    English (EN)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
