export enum IpcChannel {
  AppInit = 'app:init',
  GetModelsPath = 'app:getfolder',
  SetFolderPath = 'app:setfolder',
  Close = 'app:close',
  Minimize = 'app:minimize',
}

export enum OllamaChannel {
  OllamaInit = 'ollama:init',
  OllamaStatusUpdate = 'ollama:status',
  OllamaGetAllModels = 'ollama:getallmodels',
  OllamaQuestion = 'ollama:question',
  OllamaAnswer = 'ollama:answer',
  OllamaGetModel = 'ollama:getmodel',
  OllamaGetAvailableModelsFromRegistry = 'ollama:getavailablemodelsfromregistry',
  OllamaForceRefreshRegistry = 'ollama:forcerefreshregistry',
  OllamaClearRegistryCache = 'ollama:clearregistrycache',
  OllamaGetRegistryCacheStatus = 'ollama:getregistrycachestatus',
}

export enum IpcMainChannel {
  Error = 'main:error',
  CommandOuput = 'command:output',
}
