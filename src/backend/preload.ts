import { contextBridge, ipcRenderer } from 'electron';
import { ChatResponse, GenerateResponse, ListResponse, ModelResponse } from 'ollama';
import { IpcChannel, OllamaChannel, InferenceChannel, MorpheusChannel } from '../events';
import { OllamaQuestion, InferenceMode, MorpheusAPIConfig } from './types';

contextBridge.exposeInMainWorld('backendBridge', {
  main: {
    init: () => invokeNoParam<boolean>(IpcChannel.AppInit),
    onInit: (callback: (result: boolean) => void) =>
      ipcRenderer.on(IpcChannel.AppInit, (_, value: boolean) => callback(value)),
    sendInit: () => ipcRenderer.send(IpcChannel.AppInit),
    getFolderPath: () => invokeNoParam<string>(IpcChannel.GetModelsPath),
    setFolderPath: () => invokeNoParam<boolean>(IpcChannel.SetFolderPath),
    close: () => ipcRenderer.send(IpcChannel.Close),
    minimize: () => ipcRenderer.send(IpcChannel.Minimize),
  },
  ollama: {
    init: () => ipcRenderer.invoke(OllamaChannel.OllamaInit) as Promise<boolean>,
    onStatusUpdate: (callback: (status: string) => void) =>
      ipcRenderer.on(OllamaChannel.OllamaStatusUpdate, (_, status) => callback(status)),
    question: ({ model, query }: OllamaQuestion) =>
      ipcRenderer.invoke(OllamaChannel.OllamaQuestion, {
        model,
        query,
      }) as Promise<ChatResponse>,
    onAnswer: (callback: (response: ChatResponse) => void) =>
      ipcRenderer.on(OllamaChannel.OllamaAnswer, (_, response) => callback(response)),
    getAllModels: () => invokeNoParam<ListResponse>(OllamaChannel.OllamaGetAllModels),
    getModel: (model: string) =>
      invoke<string[], ModelResponse>(OllamaChannel.OllamaGetModel, model),
    getAvailableModelsFromRegistry: () =>
      invokeNoParam<any[]>(OllamaChannel.OllamaGetAvailableModelsFromRegistry),
    forceRefreshRegistry: () => invokeNoParam<any[]>(OllamaChannel.OllamaForceRefreshRegistry),
    clearRegistryCache: () => invokeNoParam<boolean>(OllamaChannel.OllamaClearRegistryCache),
    getRegistryCacheStatus: () => invokeNoParam<any>(OllamaChannel.OllamaGetRegistryCacheStatus),
    checkDiskSpaceForModel: (modelSize: number) =>
      ipcRenderer.invoke(OllamaChannel.OllamaCheckDiskSpaceForModel, modelSize),
    getDiskSpaceInfo: () => ipcRenderer.invoke(OllamaChannel.OllamaGetDiskSpaceInfo),
    getCurrentModel: () => ipcRenderer.invoke(OllamaChannel.OllamaGetCurrentModel),
    saveLastUsedLocalModel: (model: string) =>
      ipcRenderer.invoke(OllamaChannel.OllamaSaveLastUsedLocalModel, model),
    getLastUsedLocalModel: () => ipcRenderer.invoke(OllamaChannel.OllamaGetLastUsedLocalModel),
    deleteModel: (modelName: string) =>
      ipcRenderer.invoke(OllamaChannel.OllamaDeleteModel, modelName),
    pullAndReplaceModel: (modelName: string) =>
      ipcRenderer.invoke(OllamaChannel.OllamaPullAndReplaceModel, modelName),
  },
  inference: {
    getMode: () => ipcRenderer.invoke(InferenceChannel.GetInferenceMode) as Promise<InferenceMode>,
    setMode: (mode: InferenceMode) =>
      ipcRenderer.invoke(InferenceChannel.SetInferenceMode, mode) as Promise<boolean>,
    getMorpheusConfig: () =>
      ipcRenderer.invoke(InferenceChannel.GetMorpheusConfig) as Promise<MorpheusAPIConfig | null>,
    setMorpheusConfig: (config: MorpheusAPIConfig) =>
      ipcRenderer.invoke(InferenceChannel.SetMorpheusConfig, config) as Promise<boolean>,
    testMorpheusConnection: () =>
      ipcRenderer.invoke(InferenceChannel.TestMorpheusConnection) as Promise<boolean>,
  },
  morpheus: {
    getModels: () => ipcRenderer.invoke(MorpheusChannel.MorpheusGetModels) as Promise<any[]>,
    question: (query: string, model?: string) =>
      ipcRenderer.invoke(MorpheusChannel.MorpheusQuestion, query, model) as Promise<string>,
  },
  ai: {
    ask: (query: string, model?: string, forceSource?: 'local' | 'remote') =>
      ipcRenderer.invoke('ai:ask', query, model, forceSource) as Promise<{
        response: string;
        source: 'local' | 'remote';
        model: string;
      }>,
    getModels: () => ipcRenderer.invoke('ai:getmodels') as Promise<any[]>,
  },
  removeAllListeners(channel: string) {
    ipcRenderer.removeAllListeners(channel);
  },
});

function invoke<P extends any[], R>(channel: string, ...args: P) {
  return ipcRenderer.invoke(channel, ...args) as Promise<R>;
}

function invokeNoParam<R>(channel: string, ...args: any[]) {
  return ipcRenderer.invoke(channel, ...args) as Promise<R>;
}
