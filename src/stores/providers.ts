import { generateText } from "ai";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { getPreset, PRESETS, sessionHeaders } from "@/lib/providers/presets";
import { discoverModels, explainNetworkError, resolveModel } from "@/lib/providers/resolve";
import { loadProviders, saveProviders } from "@/lib/storage";
import type { ModelRef, ProviderConfig } from "@/lib/types";
import { uid } from "@/lib/utils";

export interface DiscoveryState {
  loading: boolean;
  error: string | null;
}

export const useProvidersStore = defineStore("providers", () => {
  const providers = ref<ProviderConfig[]>(loadProviders());
  const discovery = ref<Record<string, DiscoveryState>>({});

  watch(providers, (value) => saveProviders(value), { deep: true });

  /** Providers usable for a request: enabled, with a base URL and any needed key. */
  const ready = computed(() =>
    providers.value.filter((provider) => {
      if (!provider.enabled || !provider.baseUrl.trim()) return false;
      const preset = getPreset(provider.presetId);
      return !preset?.requiresKey || provider.apiKey.trim().length > 0;
    }),
  );

  /** Flattened provider×model list backing every model picker in the app. */
  const availableModels = computed(() =>
    ready.value.flatMap((provider) =>
      provider.cachedModels.map((modelId) => ({
        providerId: provider.id,
        modelId,
        providerLabel: provider.label,
      })),
    ),
  );

  function byId(id: string): ProviderConfig | undefined {
    return providers.value.find((provider) => provider.id === id);
  }

  function createFromPreset(presetId: string): ProviderConfig {
    const preset = getPreset(presetId) ?? PRESETS[PRESETS.length - 1];
    const config: ProviderConfig = {
      id: uid(),
      presetId: preset.id,
      label: preset.label,
      protocol: preset.protocol,
      baseUrl: preset.baseUrl,
      apiKey: "",
      headers: { ...preset.defaultHeaders },
      enabled: true,
      cachedModels: preset.suggestedModels ? [...preset.suggestedModels] : [],
      cachedModelsAt: null,
      createdAt: Date.now(),
    };
    providers.value.push(config);
    return config;
  }

  function update(id: string, patch: Partial<ProviderConfig>) {
    const index = providers.value.findIndex((provider) => provider.id === id);
    if (index === -1) return;
    providers.value[index] = { ...providers.value[index], ...patch };
  }

  function remove(id: string) {
    providers.value = providers.value.filter((provider) => provider.id !== id);
    delete discovery.value[id];
  }

  /** Fetches the model list and caches it on the config. */
  async function refreshModels(id: string): Promise<void> {
    const provider = byId(id);
    if (!provider) return;

    discovery.value[id] = { loading: true, error: null };
    try {
      const models = await discoverModels(provider);
      update(id, {
        cachedModels: models,
        cachedModelsAt: Date.now(),
      });
      discovery.value[id] = { loading: false, error: null };
    } catch (error) {
      discovery.value[id] = {
        loading: false,
        error: explainNetworkError(error, provider.baseUrl),
      };
    }
  }

  /**
   * Round-trips a one-token generation so the user finds out about CORS,
   * a bad key, or a wrong model id here rather than mid-conversation.
   */
  async function testConnection(
    id: string,
    modelId: string,
  ): Promise<{ ok: boolean; message: string }> {
    const provider = byId(id);
    if (!provider) return { ok: false, message: "Provider not found." };

    try {
      await generateText({
        model: resolveModel(provider, modelId),
        prompt: "Reply with the single word: ok",
        maxOutputTokens: 8,
        headers: sessionHeaders(provider.presetId, provider.id),
      });
      return { ok: true, message: `Reached ${provider.label} using ${modelId}.` };
    } catch (error) {
      return {
        ok: false,
        message: explainNetworkError(error, provider.baseUrl),
      };
    }
  }

  function resolve(ref: ModelRef) {
    const provider = byId(ref.providerId);
    if (!provider) {
      throw new Error("That chat's provider no longer exists. Pick another model.");
    }
    return resolveModel(provider, ref.modelId);
  }

  function labelFor(ref: ModelRef | null): string {
    if (!ref) return "No model";
    const provider = byId(ref.providerId);
    return provider ? `${provider.label} · ${ref.modelId}` : ref.modelId;
  }

  function replaceAll(next: ProviderConfig[]) {
    providers.value = next;
  }

  return {
    providers,
    discovery,
    ready,
    availableModels,
    byId,
    createFromPreset,
    update,
    remove,
    refreshModels,
    testConnection,
    resolve,
    labelFor,
    replaceAll,
  };
});
