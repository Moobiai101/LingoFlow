import type { LanguageCapability, LanguageCode } from "../../contracts/src/index.js";

function normalizeLanguage(language: LanguageCode): string {
  const normalized = language.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) throw new Error("Language code must be non-empty");
  return normalized;
}

export class UnsupportedLanguageCapabilityError extends Error {
  public readonly code = "UNSUPPORTED_LANGUAGE_CAPABILITY";
  public readonly language: LanguageCode;
  public readonly capability: LanguageCapability;

  public constructor(language: LanguageCode, capability: LanguageCapability) {
    super(`Capability '${capability}' is not supported for language '${language}'`);
    this.name = "UnsupportedLanguageCapabilityError";
    this.language = language;
    this.capability = capability;
  }
}

export class LanguageCapabilityRegistry {
  private readonly entries = new Map<string, Set<LanguageCapability>>();

  public register(language: LanguageCode, capabilities: readonly LanguageCapability[]): this {
    const key = normalizeLanguage(language);
    this.entries.set(key, new Set(capabilities));
    return this;
  }

  public supports(language: LanguageCode, capability: LanguageCapability): boolean {
    const normalized = normalizeLanguage(language);
    const exact = this.entries.get(normalized);
    const base = this.entries.get(normalized.split("-")[0] ?? normalized);
    return Boolean(exact?.has(capability) || base?.has(capability));
  }

  public require(language: LanguageCode, capability: LanguageCapability): void {
    if (!this.supports(language, capability)) {
      throw new UnsupportedLanguageCapabilityError(language, capability);
    }
  }

  public capabilities(language: LanguageCode): readonly LanguageCapability[] {
    const normalized = normalizeLanguage(language);
    const exact = this.entries.get(normalized);
    const base = this.entries.get(normalized.split("-")[0] ?? normalized);
    return [...new Set([...(base ?? []), ...(exact ?? [])])].sort();
  }
}

export function createDefaultLanguageCapabilityRegistry(): LanguageCapabilityRegistry {
  return new LanguageCapabilityRegistry()
    .register("en", ["conversation", "pronunciation_assessment", "phrase_replay", "translation"])
    .register("hi", ["conversation", "phrase_replay", "translation", "transliteration"]);
}
