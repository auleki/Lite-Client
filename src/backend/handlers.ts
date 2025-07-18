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
} from './services/ollama';
import { OllamaQuestion } from './types';
import { saveModelPathToStorage, getModelPathFromStorage } from './storage';
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
    const models = await getAvailableModelsFromRegistry(true);
    return models;
  } catch (err) {
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

const handleError = (err: Error) => {
  console.error(err);

  // log with winston here
};
