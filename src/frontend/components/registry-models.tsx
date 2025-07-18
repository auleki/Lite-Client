import React, { useEffect, useState } from 'react';
import Styled from 'styled-components';
import { RegistryModel, CacheStatus, DiskSpaceInfo } from '../renderer.d';

interface RegistryModelsProps {
  onModelPull?: (modelName: string) => void;
}

const RegistryModels: React.FC<RegistryModelsProps> = ({ onModelPull }) => {
  const [registryModels, setRegistryModels] = useState<RegistryModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [diskSpaceInfo, setDiskSpaceInfo] = useState<DiskSpaceInfo | null>(null);
  const [currentModel, setCurrentModel] = useState<any>(null);
  const [isReplacing, setIsReplacing] = useState(false);

  const loadRegistryModels = async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const models = forceRefresh
        ? await window.backendBridge.ollama.forceRefreshRegistry()
        : await window.backendBridge.ollama.getAvailableModelsFromRegistry();
      setRegistryModels(models);

      // Update cache status
      const status = await window.backendBridge.ollama.getRegistryCacheStatus();
      setCacheStatus(status);

      // Load disk space info
      const diskInfo = await window.backendBridge.ollama.getDiskSpaceInfo();
      setDiskSpaceInfo(diskInfo);

      // Load current model
      const current = await window.backendBridge.ollama.getCurrentModel();
      setCurrentModel(current);
    } catch (err) {
      setError('Failed to load models from registry. Please check your internet connection.');
      console.error('Error loading registry models:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceRefresh = async () => {
    await loadRegistryModels(true);
  };

  const handleClearCache = async () => {
    try {
      await window.backendBridge.ollama.clearRegistryCache();
      setCacheStatus({ hasCache: false, age: null, isExpired: true });
    } catch (err) {
      console.error('Failed to clear cache:', err);
    }
  };

  useEffect(() => {
    loadRegistryModels();
  }, []);

  const handleModelPull = (modelName: string) => {
    if (onModelPull) {
      onModelPull(modelName);
    }
  };

  const handlePullAndReplace = async (modelName: string) => {
    setIsReplacing(true);
    try {
      const success = await window.backendBridge.ollama.pullAndReplaceModel(modelName);
      if (success) {
        // Reload data to reflect changes
        await loadRegistryModels();
      }
    } catch (err) {
      console.error('Failed to pull and replace model:', err);
    } finally {
      setIsReplacing(false);
    }
  };

  const filteredModels = registryModels.filter(
    (model) =>
      model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      model.description.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const formatSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatCacheAge = (age: number): string => {
    if (age < 60000) return `${Math.round(age / 1000)}s ago`;
    if (age < 3600000) return `${Math.round(age / 60000)}m ago`;
    return `${Math.round(age / 3600000)}h ago`;
  };

  return (
    <Registry.Layout>
      <Registry.Header>
        <Registry.Title>Available Models</Registry.Title>
        <Registry.ButtonGroup>
          <Registry.RefreshButton onClick={handleForceRefresh} disabled={isLoading}>
            ↻
          </Registry.RefreshButton>
          <Registry.ClearCacheButton onClick={handleClearCache} disabled={isLoading}>
            🗑
          </Registry.ClearCacheButton>
        </Registry.ButtonGroup>
      </Registry.Header>

      {cacheStatus && (
        <Registry.CacheStatus>
          {cacheStatus.hasCache ? (
            <span>
              📦 Cached {formatCacheAge(cacheStatus.age || 0)}
              {cacheStatus.isExpired && ' (expired)'}
            </span>
          ) : (
            <span>📡 No cache available</span>
          )}
        </Registry.CacheStatus>
      )}

      {diskSpaceInfo && (
        <Registry.DiskSpaceInfo>
          💾 Disk Space: {diskSpaceInfo.freeGB}GB free of {diskSpaceInfo.totalGB}GB total
        </Registry.DiskSpaceInfo>
      )}

      {currentModel && (
        <Registry.CurrentModelInfo>
          🎯 Current Model: {currentModel.name} ({currentModel.parameter_size})
        </Registry.CurrentModelInfo>
      )}

      <Registry.SearchInput
        type="text"
        placeholder="Search models..."
        value={searchTerm}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
      />

      {isLoading && (
        <Registry.LoadingMessage>Loading models from registry...</Registry.LoadingMessage>
      )}

      {error && <Registry.ErrorMessage>{error}</Registry.ErrorMessage>}

      {!isLoading && !error && (
        <Registry.ModelsList>
          {filteredModels.length === 0 ? (
            <Registry.EmptyMessage>
              {searchTerm ? 'No models found matching your search.' : 'No models available.'}
            </Registry.EmptyMessage>
          ) : (
            filteredModels.map((model) => (
              <Registry.ModelCard key={model.name}>
                <Registry.ModelHeader>
                  <Registry.ModelInfo>
                    <Registry.ModelName>{model.name}</Registry.ModelName>
                    <Registry.ModelSize>{formatSize(model.size)}</Registry.ModelSize>
                  </Registry.ModelInfo>
                  <Registry.ModelStatus>
                    {model.isInstalled && (
                      <Registry.InstalledBadge>✓ Installed</Registry.InstalledBadge>
                    )}
                  </Registry.ModelStatus>
                </Registry.ModelHeader>

                {model.description && (
                  <Registry.ModelDescription>{model.description}</Registry.ModelDescription>
                )}

                {model.tags && model.tags.length > 0 && (
                  <Registry.ModelTags>
                    {model.tags.map((tag, index) => (
                      <Registry.Tag key={index}>{tag}</Registry.Tag>
                    ))}
                  </Registry.ModelTags>
                )}

                <Registry.ModelFooter>
                  <Registry.SpaceInfo>
                    {diskSpaceInfo && (
                      <Registry.SpaceCheck>
                        {diskSpaceInfo.free > model.size ? (
                          <Registry.SpaceSuccess>✓ Enough space</Registry.SpaceSuccess>
                        ) : (
                          <Registry.SpaceError>
                            ✗ Need{' '}
                            {(
                              model.size / (1024 * 1024 * 1024) -
                              parseFloat(diskSpaceInfo.freeGB)
                            ).toFixed(1)}
                            GB more
                          </Registry.SpaceError>
                        )}
                      </Registry.SpaceCheck>
                    )}
                  </Registry.SpaceInfo>

                  <Registry.ActionButtons>
                    <Registry.PullButton
                      onClick={() => handleModelPull(model.name)}
                      disabled={
                        model.isInstalled ||
                        (diskSpaceInfo ? diskSpaceInfo.free <= model.size : false) ||
                        isReplacing
                      }
                    >
                      {model.isInstalled ? 'Installed' : 'Pull Model'}
                    </Registry.PullButton>
                    {currentModel && currentModel.name !== model.name && (
                      <Registry.ReplaceButton
                        onClick={() => handlePullAndReplace(model.name)}
                        disabled={isReplacing}
                      >
                        {isReplacing ? 'Replacing...' : 'Pull & Replace'}
                      </Registry.ReplaceButton>
                    )}
                  </Registry.ActionButtons>
                </Registry.ModelFooter>
              </Registry.ModelCard>
            ))
          )}
        </Registry.ModelsList>
      )}
    </Registry.Layout>
  );
};

const Registry = {
  Layout: Styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: ${(props) => props.theme.colors.core};
    padding: 20px;
  `,
  Header: Styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  `,
  Title: Styled.h2`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.medium};
    margin: 0;
  `,
  ButtonGroup: Styled.div`
    display: flex;
    gap: 10px;
  `,
  RefreshButton: Styled.button`
    background: none;
    border: none;
    color: ${(props) => props.theme.colors.notice};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    font-weight: 300;
    font-size: 20px;
    cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5px;
    margin-left: 5px;

    &:hover {
      color: ${(props) => (props.disabled ? props.theme.colors.notice : props.theme.colors.emerald)};
    }
  `,
  ClearCacheButton: Styled.button`
    background: none;
    border: none;
    color: ${(props) => props.theme.colors.notice};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    font-weight: 300;
    font-size: 20px;
    cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5px;

    &:hover {
      color: ${(props) => (props.disabled ? props.theme.colors.notice : '#ff6b6b')};
    }
  `,
  CacheStatus: Styled.div`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    margin-bottom: 15px;
    padding: 8px 12px;
    background: ${(props) => props.theme.colors.hunter};
    border-radius: 8px;
    border: 1px solid ${(props) => props.theme.colors.hunter};
  `,
  DiskSpaceInfo: Styled.div`
    color: ${(props) => props.theme.colors.emerald};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    margin-bottom: 15px;
    padding: 8px 12px;
    background: ${(props) => props.theme.colors.hunter};
    border-radius: 8px;
    border: 1px solid ${(props) => props.theme.colors.emerald};
  `,
  CurrentModelInfo: Styled.div`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    margin-bottom: 15px;
    padding: 8px 12px;
    background: ${(props) => props.theme.colors.hunter};
    border-radius: 8px;
    border: 1px solid ${(props) => props.theme.colors.notice};
  `,
  SearchInput: Styled.input`
    width: 100%;
    height: 40px;
    border-radius: 20px;
    padding: 0 20px;
    background: ${(props) => props.theme.colors.core};
    border: 2px solid ${(props) => props.theme.colors.hunter};
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    margin-bottom: 20px;

    &:focus {
      outline: none;
      border-color: ${(props) => props.theme.colors.emerald};
    }
  `,
  LoadingMessage: Styled.div`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    text-align: center;
    padding: 20px;
  `,
  ErrorMessage: Styled.div`
    color: #ff6b6b;
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    text-align: center;
    padding: 20px;
  `,
  ModelsList: Styled.div`
    display: flex;
    flex-direction: column;
    gap: 15px;
    overflow-y: auto;
    flex: 1;
  `,
  EmptyMessage: Styled.div`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    text-align: center;
    padding: 20px;
  `,
  ModelCard: Styled.div`
    background: ${(props) => props.theme.colors.hunter};
    border-radius: 12px;
    padding: 20px;
    border: 1px solid ${(props) => props.theme.colors.hunter};
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

    &:hover {
      border-color: ${(props) => props.theme.colors.emerald};
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateY(-1px);
    }
  `,
  ModelHeader: Styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  `,
  ModelInfo: Styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
  `,
  ModelName: Styled.h3`
    color: ${(props) => props.theme.colors.emerald};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.medium};
    font-weight: 600;
    margin: 0;
  `,
  ModelSize: Styled.span`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    font-weight: 500;
    background: ${(props) => props.theme.colors.core};
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid ${(props) => props.theme.colors.notice};
  `,
  ModelDescription: Styled.p`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    margin: 0 0 10px 0;
    line-height: 1.4;
  `,
  ModelTags: Styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 15px;
  `,
  Tag: Styled.span`
    background: ${(props) => props.theme.colors.core};
    color: ${(props) => props.theme.colors.emerald};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 16px;
    border: 1px solid ${(props) => props.theme.colors.emerald};
    transition: all 0.2s ease;

    &:hover {
      background: ${(props) => props.theme.colors.emerald};
      color: ${(props) => props.theme.colors.core};
    }
  `,
  ModelStatus: Styled.div`
    display: flex;
    align-items: center;
    gap: 5px;
  `,
  InstalledBadge: Styled.span`
    background: ${(props) => props.theme.colors.emerald};
    color: ${(props) => props.theme.colors.core};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    padding: 4px 8px;
    border-radius: 12px;
    border: 1px solid ${(props) => props.theme.colors.emerald};
  `,
  ModelFooter: Styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 15px;
  `,
  SpaceInfo: Styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
  `,
  SpaceCheck: Styled.div`
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    text-align: right;
  `,
  SpaceSuccess: Styled.span`
    color: #4ade80;
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
  `,
  SpaceError: Styled.span`
    color: #f87171;
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
  `,
  ActionButtons: Styled.div`
    display: flex;
    gap: 10px;
  `,
  PullButton: Styled.button`
    background: ${(props) => (props.disabled ? props.theme.colors.hunter : props.theme.colors.emerald)};
    color: ${(props) => props.theme.colors.core};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    font-weight: 500;
    padding: 10px 20px;
    border-radius: 8px;
    border: none;
    cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

    &:hover {
      background: ${(props) => (props.disabled ? props.theme.colors.hunter : props.theme.colors.notice)};
      transform: ${(props) => (props.disabled ? 'none' : 'translateY(-1px)')};
      box-shadow: ${(props) => (props.disabled ? '0 2px 4px rgba(0, 0, 0, 0.1)' : '0 4px 8px rgba(0, 0, 0, 0.15)')};
    }

    &:active {
      transform: ${(props) => (props.disabled ? 'none' : 'translateY(0)')};
    }
  `,
  ReplaceButton: Styled.button`
    background: ${(props) => (props.disabled ? props.theme.colors.hunter : '#f59e0b')};
    color: ${(props) => props.theme.colors.core};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    font-weight: 500;
    padding: 10px 20px;
    border-radius: 8px;
    border: none;
    cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

    &:hover {
      background: ${(props) => (props.disabled ? props.theme.colors.hunter : '#d97706')};
      transform: ${(props) => (props.disabled ? 'none' : 'translateY(-1px)')};
      box-shadow: ${(props) => (props.disabled ? '0 2px 4px rgba(0, 0, 0, 0.1)' : '0 4px 8px rgba(0, 0, 0, 0.15)')};
    }

    &:active {
      transform: ${(props) => (props.disabled ? 'none' : 'translateY(0)')};
    }
  `,
};

export default RegistryModels;
