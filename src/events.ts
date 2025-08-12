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
  OllamaCheckDiskSpaceForModel = 'ollama:check-disk-space-for-model',
  OllamaGetDiskSpaceInfo = 'ollama:get-disk-space-info',
  OllamaGetCurrentModel = 'ollama:get-current-model',
  OllamaSaveLastUsedLocalModel = 'ollama:save-last-used-local-model',
  OllamaGetLastUsedLocalModel = 'ollama:get-last-used-local-model',
  OllamaDeleteModel = 'ollama:delete-model',
  OllamaPullAndReplaceModel = 'ollama:pull-and-replace-model',
  OllamaGetModelDetails = 'ollama:get-model-details',
  OllamaOpenModelInfoModal = 'ollama:open-model-info-modal',
}

export enum InferenceChannel {
  SetInferenceMode = 'inference:setmode',
  GetInferenceMode = 'inference:getmode',
  SetMorpheusConfig = 'inference:setmorpheusconfig',
  GetMorpheusConfig = 'inference:getmorpheusconfig',
  TestMorpheusConnection = 'inference:testmorpheusconnection',
}

export enum MorpheusChannel {
  MorpheusGetModels = 'morpheus:getmodels',
  MorpheusQuestion = 'morpheus:question',
  MorpheusAnswer = 'morpheus:answer',
  MorpheusInit = 'morpheus:init',
}

export enum ChatChannel {
  CreateChat = 'chat:create',
  GetChats = 'chat:getall',
  GetChat = 'chat:get',
  GetCurrentChat = 'chat:getcurrent',
  SwitchToChat = 'chat:switch',
  DeleteChat = 'chat:delete',
  SendMessage = 'chat:sendmessage',
  UpdateTitle = 'chat:updatetitle',
  MigrateChat = 'chat:migrate',
}

export enum IpcMainChannel {
  Error = 'main:error',
  CommandOuput = 'command:output',
}
