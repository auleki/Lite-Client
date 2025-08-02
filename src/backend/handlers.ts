import { dialog } from 'electron';

import { IpcChannel } from './../events';
import {
  loadOllama,
  stopOllama,
  getAllLocalModels,
  askOllama,
  getOrPullModel,
  getAvailableModelsFromRegistry,
  clearRegistryCache,
  getRegistryCacheStatus,
  checkDiskSpaceForModel,
  getDiskSpaceInfo,
  getCurrentModel,
  deleteModel,
  pullAndReplaceModel,
} from './services/ollama';
import { getInferenceManager } from './services/inference-manager';
import { OllamaQuestion, InferenceMode, MorpheusAPIConfig } from './types';
import {
  saveModelPathToStorage,
  getModelPathFromStorage,
  saveLastUsedLocalModelToStorage,
  getLastUsedLocalModelFromStorage,
} from './storage';
import { logger } from './services/logger';

export const initOllama = async (_: Electron.IpcMainEvent) => {
  try {
    const ollamaLoaded = await loadOllama();

    return ollamaLoaded;
  } catch (err) {
    handleError(err);

    return false;
  }
};

export const stopOllamaServe = async () => {
  await stopOllama();
};

export const getAllModels = async (_: Electron.IpcMainEvent) => {
  try {
    const models = await getAllLocalModels();

    return models;
    // event.reply(OllamaChannel.OllamaGetAllModels, models);
  } catch (err) {
    handleError(err);
  }
};

export const getModel = async (_: Electron.IpcMainEvent, model: string) => {
  try {
    const response = await getOrPullModel(model);

    return response;
  } catch (err) {
    handleError(err);
  }
};

export const askOlama = async (_: Electron.IpcMainEvent, { model, query }: OllamaQuestion) => {
  try {
    const response = await askOllama(model, query);

    return response;
  } catch (err) {
    handleError(err);
  }
};

export const getModelsFolderPath = async (_: Electron.IpcMainEvent) => {
  return getModelPathFromStorage();
};

export const setModelFolderPath = async (_: Electron.IpcMainEvent) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.filePaths) {
    saveModelPathToStorage(result.filePaths[0]);
  }

  return true;
};

// New handler for registry models
export const getAvailableModelsFromRegistryHandler = async (_: Electron.IpcMainEvent) => {
  try {
    const models = await getAvailableModelsFromRegistry();
    return models;
  } catch (err) {
    handleError(err);
    return [];
  }
};

// New handler for force refresh (bypasses cache)
export const forceRefreshRegistryHandler = async (_: Electron.IpcMainEvent) => {
  try {
    console.log('Force refresh registry handler called');
    const models = await getAvailableModelsFromRegistry(true);
    console.log(`Force refresh returned ${models.length} models`);
    return models;
  } catch (err) {
    console.error('Force refresh error:', err);
    handleError(err);
    return [];
  }
};

// New handler for cache management
export const clearRegistryCacheHandler = async (_: Electron.IpcMainEvent) => {
  try {
    clearRegistryCache();
    return true;
  } catch (err) {
    handleError(err);
    return false;
  }
};

// New handler for cache status
export const getRegistryCacheStatusHandler = async (_: Electron.IpcMainEvent) => {
  try {
    return getRegistryCacheStatus();
  } catch (err) {
    handleError(err);
    return { hasCache: false, age: null, isExpired: true };
  }
};

export const checkDiskSpaceForModelHandler = async (_: any, modelSize: number) => {
  try {
    return await checkDiskSpaceForModel(modelSize);
  } catch (error) {
    logger.error('Error checking disk space for model:', error);
    throw error;
  }
};

export const getDiskSpaceInfoHandler = async () => {
  try {
    return await getDiskSpaceInfo();
  } catch (error) {
    logger.error('Error getting disk space info:', error);
    throw error;
  }
};

export const getCurrentModelHandler = async () => {
  try {
    return await getCurrentModel();
  } catch (error) {
    logger.error('Error getting current model:', error);
    throw error;
  }
};

export const saveLastUsedLocalModelHandler = async (_: Electron.IpcMainEvent, model: string) => {
  try {
    saveLastUsedLocalModelToStorage(model);
    logger.info(`Saved last used local model: ${model}`);
  } catch (error) {
    logger.error('Error saving last used local model:', error);
    throw error;
  }
};

export const getLastUsedLocalModelHandler = async (_: Electron.IpcMainEvent) => {
  try {
    return getLastUsedLocalModelFromStorage();
  } catch (error) {
    logger.error('Error getting last used local model:', error);
    throw error;
  }
};

export const deleteModelHandler = async (_: any, modelName: string) => {
  try {
    return await deleteModel(modelName);
  } catch (error) {
    logger.error('Error deleting model:', error);
    throw error;
  }
};

export const pullAndReplaceModelHandler = async (_: any, modelName: string) => {
  try {
    return await pullAndReplaceModel(modelName);
  } catch (error) {
    logger.error('Error pulling and replacing model:', error);
    throw error;
  }
};

const handleError = (err: Error) => {
  console.error(err);

  // log with winston here
};

// =====================================
// Inference Management Handlers
// =====================================

export const getInferenceModeHandler = async (_: Electron.IpcMainEvent) => {
  try {
    const manager = getInferenceManager();
    return manager.getInferenceMode();
  } catch (err) {
    handleError(err);
    return 'local'; // Default fallback
  }
};

export const setInferenceModeHandler = async (_: Electron.IpcMainEvent, mode: InferenceMode) => {
  try {
    const manager = getInferenceManager();
    await manager.setInferenceMode(mode);
    return true;
  } catch (err) {
    handleError(err);
    return false;
  }
};

export const getMorpheusConfigHandler = async (_: Electron.IpcMainEvent) => {
  try {
    const manager = getInferenceManager();
    return manager.getMorpheusConfig();
  } catch (err) {
    handleError(err);
    return null;
  }
};

export const setMorpheusConfigHandler = async (
  _: Electron.IpcMainEvent,
  config: MorpheusAPIConfig,
) => {
  try {
    const manager = getInferenceManager();
    await manager.setMorpheusConfig(config);
    return true;
  } catch (err) {
    handleError(err);
    return false;
  }
};

export const testMorpheusConnectionHandler = async (_: Electron.IpcMainEvent) => {
  try {
    const manager = getInferenceManager();
    return await manager.testMorpheusConnection();
  } catch (err) {
    handleError(err);
    return false;
  }
};

// =====================================
// Morpheus API Handlers
// =====================================

export const getMorpheusModelsHandler = async (_: Electron.IpcMainEvent) => {
  try {
    const manager = getInferenceManager();
    return await manager.getRemoteModels();
  } catch (err) {
    handleError(err);
    return [];
  }
};

export const askMorpheusHandler = async (
  _: Electron.IpcMainEvent,
  query: string,
  model?: string,
) => {
  try {
    const manager = getInferenceManager();
    const result = await manager.askWithSource(query, 'remote', model);
    return result.response;
  } catch (err) {
    handleError(err);
    throw err;
  }
};

// =====================================
// Unified Inference Handler
// =====================================

export const askAIHandler = async (
  _: Electron.IpcMainEvent,
  query: string,
  model?: string,
  forceSource?: 'local' | 'remote',
) => {
  try {
    const manager = getInferenceManager();

    let result;
    if (forceSource) {
      result = await manager.askWithSource(query, forceSource, model);
    } else {
      result = await manager.ask(query, model);
    }

    return {
      response: result.response,
      source: result.source,
      model: result.model,
    };
  } catch (err) {
    handleError(err);
    throw err;
  }
};

export const getAvailableInferenceModelsHandler = async (_: Electron.IpcMainEvent) => {
  try {
    const manager = getInferenceManager();
    return await manager.getAvailableModels();
  } catch (err) {
    handleError(err);
    return [];
  }
};
