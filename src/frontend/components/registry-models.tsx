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
                  <Registry.ModelName>{model.name}</Registry.ModelName>
                  <Registry.ModelSize>{formatSize(model.size)}</Registry.ModelSize>
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

                <Registry.ModelActions>
                  {diskSpaceInfo && (
                    <Registry.SpaceCheck>
                      {diskSpaceInfo.free > model.size ? (
                        <span style={{ color: '#4ade80' }}>✓ Enough space</span>
                      ) : (
                        <span style={{ color: '#f87171' }}>
                          ✗ Need{' '}
                          {(
                            model.size / (1024 * 1024 * 1024) -
                            parseFloat(diskSpaceInfo.freeGB)
                          ).toFixed(1)}
                          GB more
                        </span>
                      )}
                    </Registry.SpaceCheck>
                  )}
                  <Registry.PullButton
                    onClick={() => handleModelPull(model.name)}
                    disabled={
                      model.isInstalled ||
                      (diskSpaceInfo ? diskSpaceInfo.free <= model.size : false)
                    }
                  >
                    {model.isInstalled ? 'Installed' : 'Pull Model'}
                  </Registry.PullButton>
                </Registry.ModelActions>
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
    border-radius: 10px;
    padding: 15px;
    border: 1px solid ${(props) => props.theme.colors.hunter};
  `,
  ModelHeader: Styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  `,
  ModelName: Styled.h3`
    color: ${(props) => props.theme.colors.emerald};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    margin: 0;
  `,
  ModelSize: Styled.span`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
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
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid ${(props) => props.theme.colors.emerald};
  `,
  ModelActions: Styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
  `,
  SpaceCheck: Styled.div`
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    text-align: right;
  `,
  PullButton: Styled.button`
    background: ${(props) => (props.disabled ? props.theme.colors.hunter : props.theme.colors.emerald)};
    color: ${(props) => props.theme.colors.core};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    padding: 8px 16px;
    border-radius: 20px;
    border: none;
    cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
    transition: background-color 0.2s;

    &:hover {
      background: ${(props) => (props.disabled ? props.theme.colors.hunter : props.theme.colors.notice)};
    }
  `,
};

export default RegistryModels;
