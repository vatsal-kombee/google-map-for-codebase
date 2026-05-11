import type { LanguageAdapter } from "./types";
import { jsTsAdapter } from "./jsTs";
import { phpAdapter } from "./php";
import { dotnetAdapter } from "./dotnet";
import { pythonAdapter } from "./python";
import { goAdapter } from "./go";
import { javaAdapter } from "./java";
import { rustAdapter } from "./rust";
import { rubyAdapter } from "./ruby";
import { cppAdapter } from "./cpp";
import { markdownAdapter } from "./markdown";

export const languageAdapters: LanguageAdapter[] = [
    jsTsAdapter,
    phpAdapter,
    dotnetAdapter,
    pythonAdapter,
    goAdapter,
    javaAdapter,
    rustAdapter,
    rubyAdapter,
    cppAdapter,
    markdownAdapter
];
