import { ChatResponse, GenerateResponse, ListResponse, ModelResponse } from 'ollama';

export type InferenceMode = 'local' | 'remote';

export interface MorpheusAPIConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface InferenceResult {
  response: string;
  source: 'local' | 'remote';
  model: string;
}

export interface InferenceModel {
  id: string;
  name: string;
  source: 'local' | 'remote';
  size?: string;
  description?: string;
}

export interface DiskSpaceInfo {
  free: number;
  freeGB: string;
  total: number;
  totalGB: string;
  used: number;
  usedGB: string;
  error?: any;
}

export interface DiskSpaceForModel {
  hasEnoughSpace: boolean;
  freeSpace: number;
  freeSpaceGB: string;
  requiredSpaceGB: string;
  modelSize: number;
  error?: any;
}

export interface BackendBridge {
  main: {
    init: () => Promise<boolean>;
    onInit: (callback: (result: boolean) => void) => void;
    sendInit: () => void;
    getFolderPath: () => Promise<string>;
    setFolderPath: () => Promise<boolean>;
    close: () => void;
    minimize: () => void;
  };
  ollama: {
    init: () => Promise<boolean>;
    onStatusUpdate: (callback: (status: string) => void) => void;
    question: ({ model, query }: OllamaQuestion) => Promise<ChatResponse>;
    onAnswer: (callback: (response: ChatResponse) => void) => void;
    getAllModels: () => Promise<ListResponse>;
    getModel: (model: string) => Promise<ModelResponse>;
    getAvailableModelsFromRegistry: () => Promise<RegistryModel[]>;
    forceRefreshRegistry: () => Promise<RegistryModel[]>;
    clearRegistryCache: () => Promise<boolean>;
    getRegistryCacheStatus: () => Promise<CacheStatus>;
    checkDiskSpaceForModel: (modelSize: number) => Promise<DiskSpaceForModel>;
    getDiskSpaceInfo: () => Promise<DiskSpaceInfo>;
    getCurrentModel: () => Promise<any>;
    saveLastUsedLocalModel: (model: string) => Promise<void>;
    getLastUsedLocalModel: () => Promise<string>;
    deleteModel: (modelName: string) => Promise<boolean>;
    pullAndReplaceModel: (modelName: string) => Promise<boolean>;
  };
  inference: {
    getMode: () => Promise<InferenceMode>;
    setMode: (mode: InferenceMode) => Promise<boolean>;
    getMorpheusConfig: () => Promise<MorpheusAPIConfig | null>;
    setMorpheusConfig: (config: MorpheusAPIConfig) => Promise<boolean>;
    testMorpheusConnection: () => Promise<boolean>;
  };
  morpheus: {
    getModels: () => Promise<any[]>;
    question: (query: string, model?: string) => Promise<string>;
  };
  ai: {
    ask: (
      query: string,
      model?: string,
      forceSource?: 'local' | 'remote',
    ) => Promise<InferenceResult>;
    getModels: () => Promise<InferenceModel[]>;
  };
  removeAllListeners: (channel: string) => void;
}

// New type for registry models
export interface RegistryModel {
  name: string;
  description: string;
  size: number;
  modifiedAt: string;
  digest: string;
  tags: string[];
  url?: string;
  isInstalled: boolean;
  isDefault?: boolean;
}

// New type for cache status
export interface CacheStatus {
  hasCache: boolean;
  age: number | null;
  isExpired: boolean;
  cacheDuration?: number;
}

declare global {
  interface Window {
    backendBridge: BackendBridge;
  }
}
