import { createContext, useContext, useState, type ReactNode } from "react";
import { hr } from "@/i18n/hr";
import { en } from "@/i18n/en";
import type { Translations } from "@/i18n/hr";

type Lang = "hr" | "en";

interface LangContextValue {
    lang: Lang;
    setLang: (lang: Lang) => void;
    t: Translations;
}

const LangContext = createContext<LangContextValue>({
    lang: "hr",
    setLang: () => { },
    t: hr,
});

export function LangProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>(() => {
        const stored = localStorage.getItem("lang");
        return (stored === "en" || stored === "hr") ? stored : "hr";
    });

    const setLang = (newLang: Lang) => {
        setLangState(newLang);
        localStorage.setItem("lang", newLang);
    };

    const t: Translations = lang === "hr" ? hr : en;

    return (
        <LangContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LangContext.Provider>
    );
}

export function useLang() {
    return useContext(LangContext);
}
