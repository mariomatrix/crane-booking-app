import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { hr, enUS } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useLang } from "@/contexts/LangContext";
import { formatAppDate } from "@/lib/date-utils";

interface DatePickerProps {
    date?: Date;
    onChange?: (date: Date | undefined) => void;
    placeholder?: string;
    className?: string;
}

export function DatePicker({ date, onChange, placeholder, className }: DatePickerProps) {
    const { lang } = useLang();

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? formatAppDate(date, lang as any) : <span>{placeholder || "Odaberi datum"}</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={onChange}
                    initialFocus
                    locale={lang === "hr" ? hr : enUS}
                />
            </PopoverContent>
        </Popover>
    );
}
