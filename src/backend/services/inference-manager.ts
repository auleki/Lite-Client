import { logger } from './logger';
import { InferenceMode, MorpheusAPIConfig } from '../types';
import {
  initializeMorpheusAPI,
  getMorpheusAPI,
  destroyMorpheusAPI,
  MorpheusModel,
} from './morpheus-api';
import { askOllama, getAllLocalModels, getCurrentModel } from './ollama';

// Storage
import {
  getInferenceConfigFromStorage,
  saveInferenceConfigToStorage,
  getLastUsedLocalModelFromStorage,
} from '../storage';

export interface InferenceModel {
  id: string;
  name: string;
  source: 'local' | 'remote';
  size?: string;
  description?: string;
}

export interface InferenceResult {
  response: string;
  source: 'local' | 'remote';
  model: string;
}

class InferenceManager {
  private currentMode: InferenceMode = 'local';
  private morpheusConfig: MorpheusAPIConfig | null = null;

  constructor() {
    this.loadConfig();
  }

  /**
   * Load configuration from storage
   */
  private async loadConfig() {
    try {
      const config = await getInferenceConfigFromStorage();
      if (config) {
        this.currentMode = config.mode;
        this.morpheusConfig = config.morpheusConfig || null;

        // Initialize Morpheus API if config exists
        if (this.morpheusConfig && this.morpheusConfig.apiKey) {
          initializeMorpheusAPI(this.morpheusConfig);
        }
      }
    } catch (error) {
      logger.error('Failed to load inference config:', error);
    }
  }

  /**
   * Save configuration to storage
   */
  private async saveConfig() {
    try {
      await saveInferenceConfigToStorage({
        mode: this.currentMode,
        morpheusConfig: this.morpheusConfig || undefined,
      });
    } catch (error) {
      logger.error('Failed to save inference config:', error);
    }
  }

  /**
   * Get current inference mode
   */
  getInferenceMode(): InferenceMode {
    return this.currentMode;
  }

  /**
   * Set inference mode
   */
  async setInferenceMode(mode: InferenceMode): Promise<void> {
    this.currentMode = mode;
    await this.saveConfig();
    logger.info(`Inference mode set to: ${mode}`);
  }

  /**
   * Get Morpheus API configuration
   */
  getMorpheusConfig(): MorpheusAPIConfig | null {
    return this.morpheusConfig;
  }

  /**
   * Set Morpheus API configuration
   */
  async setMorpheusConfig(config: MorpheusAPIConfig): Promise<void> {
    this.morpheusConfig = config;

    // Destroy existing instance and create new one
    destroyMorpheusAPI();

    if (config.apiKey) {
      initializeMorpheusAPI(config);
    }

    await this.saveConfig();
    logger.info('Morpheus API configuration updated');
  }

  /**
   * Test Morpheus API connection
   */
  async testMorpheusConnection(): Promise<boolean> {
    const api = getMorpheusAPI();
    if (!api) {
      return false;
    }

    try {
      return await api.testConnection();
    } catch (error) {
      logger.error('Morpheus connection test failed:', error);
      return false;
    }
  }

  /**
   * Get available models from current source
   */
  async getAvailableModels(): Promise<InferenceModel[]> {
    const models: InferenceModel[] = [];

    // Always include local models
    try {
      const localModelsResponse = await getAllLocalModels();
      const localModelList =
        localModelsResponse.models?.map((model: any) => ({
          id: model.name,
          name: model.name,
          source: 'local' as const,
          size: model.size,
          description: 'Local Ollama model',
        })) || [];
      models.push(...localModelList);
    } catch (error) {
      logger.error('Failed to fetch local models:', error);
    }

    // Include remote models if API is configured
    const api = getMorpheusAPI();
    if (api) {
      try {
        const remoteModels = await api.getModels();
        const remoteModelList = remoteModels.map((model) => ({
          id: model.id,
          name: model.id,
          source: 'remote' as const,
          description: `Remote Morpheus model (${model.owned_by})`,
        }));
        models.push(...remoteModelList);
      } catch (error) {
        logger.error('Failed to fetch remote models:', error);
      }
    }

    return models;
  }

  /**
   * Ask a question using the current inference mode
   */
  async ask(query: string, model?: string): Promise<InferenceResult> {
    if (this.currentMode === 'remote') {
      return this.askRemote(query, model);
    } else {
      return this.askLocal(query, model);
    }
  }

  /**
   * Ask a question using local inference (Ollama)
   */
  private async askLocal(query: string, model?: string): Promise<InferenceResult> {
    try {
      // Use provided model or get stored preferred model or get current model or get first available model
      let targetModel = model;

      if (!targetModel) {
        // Check for stored last used local model
        targetModel = getLastUsedLocalModelFromStorage();

        // Verify the stored model actually exists
        if (targetModel && targetModel !== 'orca-mini:latest') {
          try {
            const localModelsResponse = await getAllLocalModels();
            const modelExists = localModelsResponse.models?.some((m) => m.name === targetModel);
            if (!modelExists) {
              logger.info(`Stored model ${targetModel} not found, falling back`);
              targetModel = undefined;
            }
          } catch (error) {
            logger.warn('Could not verify stored model exists:', error);
            targetModel = undefined;
          }
        }
      }

      if (!targetModel) {
        const currentModel = await getCurrentModel();
        targetModel = currentModel?.name;
      }

      // If still no model, get the first available local model
      if (!targetModel) {
        const localModelsResponse = await getAllLocalModels();
        const firstModel = localModelsResponse.models?.[0];
        targetModel = firstModel?.name;
      }

      // Final fallback - use orca-mini as default
      if (!targetModel) {
        targetModel = 'orca-mini:latest';
        logger.info('No models found, using default: orca-mini:latest');
      }

      // Double-check we have a valid model
      if (!targetModel || targetModel.trim() === '') {
        throw new Error(
          'No valid model available for local inference. Please ensure Ollama models are installed.',
        );
      }

      logger.info(`Using local model: ${targetModel}`);
      const chatResponse = await askOllama(targetModel, query);

      return {
        response: chatResponse.message.content,
        source: 'local',
        model: targetModel,
      };
    } catch (error) {
      logger.error('Local inference failed:', error);
      throw new Error('Local inference failed: ' + error.message);
    }
  }

  /**
   * Ask a question using remote inference (Morpheus API)
   */
  private async askRemote(query: string, model?: string): Promise<InferenceResult> {
    const api = getMorpheusAPI();
    if (!api) {
      throw new Error('Morpheus API not configured. Please set up your API key in settings.');
    }

    try {
      // Use provided model or default
      const targetModel = model || this.morpheusConfig?.defaultModel || 'llama-3.3-70b';

      const response = await api.ask(query, targetModel);

      return {
        response,
        source: 'remote',
        model: targetModel,
      };
    } catch (error) {
      logger.error('Remote inference failed:', error);
      throw new Error('Remote inference failed: ' + error.message);
    }
  }

  /**
   * Ask using a specific source (local or remote)
   */
  async askWithSource(
    query: string,
    source: 'local' | 'remote',
    model?: string,
  ): Promise<InferenceResult> {
    if (source === 'remote') {
      return this.askRemote(query, model);
    } else {
      return this.askLocal(query, model);
    }
  }

  /**
   * Get remote models only
   */
  async getRemoteModels(): Promise<MorpheusModel[]> {
    const api = getMorpheusAPI();
    if (!api) {
      return [];
    }

    try {
      return await api.getModels();
    } catch (error) {
      logger.error('Failed to fetch remote models:', error);
      return [];
    }
  }
}

// Global instance
let inferenceManagerInstance: InferenceManager | null = null;

export const getInferenceManager = (): InferenceManager => {
  if (!inferenceManagerInstance) {
    inferenceManagerInstance = new InferenceManager();
  }
  return inferenceManagerInstance;
};

export const destroyInferenceManager = (): void => {
  inferenceManagerInstance = null;
};
