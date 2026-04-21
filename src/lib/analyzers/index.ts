import type { LanguageAdapter } from "./types";
import { jsTsAdapter } from "./jsTs";
import { phpAdapter } from "./php";
import { dotnetAdapter } from "./dotnet";

export const languageAdapters: LanguageAdapter[] = [jsTsAdapter, phpAdapter, dotnetAdapter];

