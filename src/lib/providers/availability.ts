import type { ProviderConfig } from "@/lib/types";
import { getPreset } from "./presets";

/**
 * Why the model picker has nothing in it.
 *
 * A composer that is disabled without saying why is indistinguishable from an
 * app that is broken: the message goes nowhere, no error appears, and no
 * request reaches the network log. This turns each way a provider can fall
 * short of usable into a sentence naming the provider and the missing piece.
 */
export function describeNoModels(providers: ProviderConfig[]): string {
  if (!providers.length) {
    return "No providers configured yet.";
  }

  const enabled = providers.filter((provider) => provider.enabled);
  if (!enabled.length) {
    return "Every provider is switched off.";
  }

  const needsKey = enabled.filter(
    (provider) => getPreset(provider.presetId)?.requiresKey && !provider.apiKey.trim(),
  );
  const needsUrl = enabled.filter((provider) => !provider.baseUrl.trim());
  const usable = enabled.filter(
    (provider) => !needsKey.includes(provider) && !needsUrl.includes(provider),
  );

  if (!usable.length) {
    return needsKey.length
      ? `${nameList(needsKey)} still needs an API key.`
      : `${nameList(needsUrl)} still needs a base URL.`;
  }

  // Configured and reachable, but discovery has never run and the preset had no
  // suggestions to seed the list with.
  return `${nameList(usable)} has no models yet — open Settings and choose Fetch models.`;
}

function nameList(providers: ProviderConfig[]): string {
  const labels = providers.map((provider) => provider.label);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
