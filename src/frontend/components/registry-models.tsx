import React, { useEffect, useState } from 'react';
import Styled from 'styled-components';
import { RegistryModel, CacheStatus, DiskSpaceInfo } from '../renderer.d';

interface RegistryModelsProps {
  onModelPull?: (modelName: string) => void;
  isPulling?: string | null;
  onCancelPull?: () => void;
}

const RegistryModels: React.FC<RegistryModelsProps> = ({
  onModelPull,
  isPulling,
  onCancelPull,
}) => {
  const [registryModels, setRegistryModels] = useState<RegistryModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [diskSpaceInfo, setDiskSpaceInfo] = useState<DiskSpaceInfo | null>(null);
  const [currentModel, setCurrentModel] = useState<RegistryModel | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'popularity'>('name');
  const [pullStatus, setPullStatus] = useState<string>('');
  const [pullProgress, setPullProgress] = useState<number>(0);
  const [canCancel, setCanCancel] = useState<boolean>(true);
  const [pullStage, setPullStage] = useState<
    'initializing' | 'downloading' | 'installing' | 'complete'
  >('initializing');
  const [estimatedTime, setEstimatedTime] = useState<string>('');
  const [downloadSpeed, setDownloadSpeed] = useState<string>('');
  const [errorType, setErrorType] = useState<
    'network' | 'permission' | 'disk_space' | 'unknown' | null
  >(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  const loadRegistryModels = async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    setErrorType(null);

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

      // Reset retry count on success
      setRetryCount(0);
    } catch (err: unknown) {
      console.error('Error loading registry models:', err);

      // Classify error type
      let errorMessage = 'Failed to load models from registry.';
      let type: 'network' | 'permission' | 'disk_space' | 'unknown' = 'unknown';

      const errorMessageStr = err instanceof Error ? err.message : String(err);

      if (errorMessageStr.includes('network') || errorMessageStr.includes('fetch')) {
        type = 'network';
        errorMessage =
          'Network connection failed. Please check your internet connection and try again.';
      } else if (errorMessageStr.includes('permission') || errorMessageStr.includes('access')) {
        type = 'permission';
        errorMessage =
          'Permission denied. Please check if the app has access to the models directory.';
      } else if (errorMessageStr.includes('disk') || errorMessageStr.includes('space')) {
        type = 'disk_space';
        errorMessage = 'Insufficient disk space. Please free up some space and try again.';
      }

      setError(errorMessage);
      setErrorType(type);
      setRetryCount((prev) => prev + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceRefresh = async () => {
    await loadRegistryModels(true);
  };

  const handleModelPull = (modelName: string) => {
    if (onModelPull) {
      setCanCancel(true);
      setPullProgress(0);
      setPullStatus('Starting download...');
      onModelPull(modelName);
    }
  };

  const handlePullAndReplace = async (modelName: string) => {
    setIsReplacing(true);
    setCanCancel(true);
    setPullProgress(0);
    setPullStatus('Starting replacement...');

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
      setCanCancel(false);
      setPullProgress(0);
      setPullStatus('');
    }
  };

  const handleCancelOperation = () => {
    if (canCancel) {
      // Ask for confirmation before cancelling
      const confirmed = window.confirm(
        'Are you sure you want to cancel this operation? The download will be stopped and no model will be installed.',
      );

      if (confirmed) {
        // Reset local state
        setIsReplacing(false);
        setCanCancel(false);
        setPullProgress(0);
        setPullStatus('');
        console.log('Operation cancelled by user');

        // Notify parent component to reset isPulling state
        if (onCancelPull) {
          onCancelPull();
        }
      }
    }
  };

  const handleRetry = async () => {
    if (retryCount < 3) {
      await loadRegistryModels(true);
    } else {
      setError('Maximum retry attempts reached. Please check your connection and try again later.');
    }
  };

  const handleClearCacheAndRetry = async () => {
    try {
      await window.backendBridge.ollama.clearRegistryCache();
      await loadRegistryModels(true);
    } catch (err) {
      console.error('Error clearing cache:', err);
      setError('Failed to clear cache. Please try again.');
    }
  };

  const formatSize = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) {
      return `${gb.toFixed(1)} GB`;
    }
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatCacheAge = (age: number): string => {
    const minutes = Math.floor(age / (1000 * 60));
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getErrorIcon = () => {
    switch (errorType) {
      case 'network':
        return '🌐';
      case 'permission':
        return '🔒';
      case 'disk_space':
        return '💾';
      default:
        return '⚠️';
    }
  };

  const filteredModels = registryModels.filter(
    (model) =>
      model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      model.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      model.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const sortedModels = [...filteredModels].sort((a, b) => {
    switch (sortBy) {
      case 'name': {
        return a.name.localeCompare(b.name);
      }
      case 'size': {
        return b.size - a.size;
      }
      case 'popularity': {
        // Simple popularity based on model name patterns
        const aPopular =
          a.name.includes('llama') || a.name.includes('gpt') || a.name.includes('mistral');
        const bPopular =
          b.name.includes('llama') || b.name.includes('gpt') || b.name.includes('mistral');
        if (aPopular && !bPopular) return -1;
        if (!aPopular && bPopular) return 1;
        return a.name.localeCompare(b.name);
      }
      default:
        return 0;
    }
  });

  useEffect(() => {
    loadRegistryModels();
  }, []);

  // Listen for Ollama status updates
  useEffect(() => {
    const handleStatusUpdate = (status: string) => {
      console.log('Ollama status update:', status);
      setPullStatus(status);

      // Extract progress from status messages
      const progressMatch = status.match(/(\d+)%/);
      if (progressMatch) {
        const progress = parseInt(progressMatch[1]);
        setPullProgress(progress);

        // Update stage based on progress
        if (progress < 20) {
          setPullStage('initializing');
        } else if (progress < 80) {
          setPullStage('downloading');
        } else if (progress < 100) {
          setPullStage('installing');
        } else {
          setPullStage('complete');
        }
      } else if (status.includes('pulling') || status.includes('downloading')) {
        setPullProgress((prev) => Math.min(prev + 10, 90));
        setPullStage('downloading');
      } else if (status.includes('Initializing') || status.includes('Starting')) {
        setPullStage('initializing');
      } else if (status.includes('installing') || status.includes('setting up')) {
        setPullStage('installing');
      }

      // Extract download speed if available
      const speedMatch = status.match(/(\d+(?:\.\d+)?)\s*(MB\/s|GB\/s)/);
      if (speedMatch) {
        setDownloadSpeed(`${speedMatch[1]} ${speedMatch[2]}`);
      }

      // Estimate time remaining based on progress
      if (pullProgress > 0 && pullProgress < 100) {
        const remaining = Math.max(1, Math.round((100 - pullProgress) / 10));
        setEstimatedTime(`${remaining} min remaining`);
      }
    };

    window.backendBridge.ollama.onStatusUpdate(handleStatusUpdate);

    return () => {
      // Clean up listener if needed
    };
  }, []);

  if (isLoading) {
    return (
      <Registry.Container>
        <Registry.LoadingState>
          <Registry.LoadingSpinner />
          <Registry.LoadingText>Loading models...</Registry.LoadingText>
        </Registry.LoadingState>
      </Registry.Container>
    );
  }

  return (
    <Registry.Container>
      {/* Pull Progress Overlay */}
      {(isPulling || isReplacing) && (
        <Registry.PullOverlay>
          <Registry.PullModal>
            <Registry.PullIcon>📦</Registry.PullIcon>
            <Registry.PullTitle>
              {isReplacing ? 'Replacing Model' : 'Pulling Model'}
            </Registry.PullTitle>
            <Registry.PullSubtitle>
              {isPulling || 'This may take several minutes...'}
            </Registry.PullSubtitle>

            <Registry.StageIndicator>
              <Registry.Stage $active={pullStage === 'initializing'} $completed={pullProgress > 0}>
                <Registry.StageDot $active={pullStage === 'initializing'}>1</Registry.StageDot>
                <Registry.StageText>Initializing</Registry.StageText>
              </Registry.Stage>
              <Registry.Stage $active={pullStage === 'downloading'} $completed={pullProgress > 20}>
                <Registry.StageDot $active={pullStage === 'downloading'}>2</Registry.StageDot>
                <Registry.StageText>Downloading</Registry.StageText>
              </Registry.Stage>
              <Registry.Stage $active={pullStage === 'installing'} $completed={pullProgress > 80}>
                <Registry.StageDot $active={pullStage === 'installing'}>3</Registry.StageDot>
                <Registry.StageText>Installing</Registry.StageText>
              </Registry.Stage>
            </Registry.StageIndicator>

            <Registry.ProgressContainer>
              <Registry.ProgressBar>
                <Registry.ProgressFill progress={pullProgress} />
              </Registry.ProgressBar>
              <Registry.ProgressText>{pullProgress}%</Registry.ProgressText>
            </Registry.ProgressContainer>

            <Registry.StatusText>{pullStatus || 'Initializing...'}</Registry.StatusText>

            {(downloadSpeed || estimatedTime) && (
              <Registry.DetailsContainer>
                {downloadSpeed && (
                  <Registry.DetailItem>
                    <Registry.DetailIcon>⚡</Registry.DetailIcon>
                    <Registry.DetailText>{downloadSpeed}</Registry.DetailText>
                  </Registry.DetailItem>
                )}
                {estimatedTime && (
                  <Registry.DetailItem>
                    <Registry.DetailIcon>⏱️</Registry.DetailIcon>
                    <Registry.DetailText>{estimatedTime}</Registry.DetailText>
                  </Registry.DetailItem>
                )}
              </Registry.DetailsContainer>
            )}

            <Registry.PullSpinner />

            {canCancel && (
              <Registry.CancelButton onClick={handleCancelOperation}>
                Cancel Operation
              </Registry.CancelButton>
            )}

            {canCancel && (
              <Registry.CancelWarning>
                ⚠️ Cancelling will stop the download. The new model will not be installed.
              </Registry.CancelWarning>
            )}
          </Registry.PullModal>
        </Registry.PullOverlay>
      )}

      {/* Header Section */}
      <Registry.Header>
        <Registry.HeaderLeft>
          <Registry.Title>Model Registry</Registry.Title>
          <Registry.Subtitle>Discover and install AI models</Registry.Subtitle>
        </Registry.HeaderLeft>

        <Registry.HeaderRight>
          <Registry.ViewToggle>
            <Registry.ViewButton active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
              <Registry.GridIcon />
            </Registry.ViewButton>
            <Registry.ViewButton active={viewMode === 'list'} onClick={() => setViewMode('list')}>
              <Registry.ListIcon />
            </Registry.ViewButton>
          </Registry.ViewToggle>

          <Registry.RefreshButton onClick={handleForceRefresh}>
            <Registry.RefreshIcon />
          </Registry.RefreshButton>
        </Registry.HeaderRight>
      </Registry.Header>

      {/* Stats Bar */}
      <Registry.StatsBar>
        <Registry.StatItem>
          <Registry.StatIcon>📦</Registry.StatIcon>
          <Registry.StatText>{filteredModels.length} models</Registry.StatText>
        </Registry.StatItem>

        {diskSpaceInfo && (
          <Registry.StatItem>
            <Registry.StatIcon>💾</Registry.StatIcon>
            <Registry.StatText>{diskSpaceInfo.freeGB}GB free</Registry.StatText>
          </Registry.StatItem>
        )}

        {currentModel && (
          <Registry.StatItem>
            <Registry.StatIcon>🎯</Registry.StatIcon>
            <Registry.StatText>Current: {currentModel.name}</Registry.StatText>
          </Registry.StatItem>
        )}

        {cacheStatus && (
          <Registry.StatItem>
            <Registry.StatIcon>⏰</Registry.StatIcon>
            <Registry.StatText>Updated {formatCacheAge(cacheStatus.age || 0)}</Registry.StatText>
          </Registry.StatItem>
        )}
      </Registry.StatsBar>

      {/* Controls Section */}
      <Registry.Controls>
        <Registry.SearchContainer>
          <Registry.SearchIcon />
          <Registry.SearchInput
            type="text"
            placeholder="Search models by name, description, or tags..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
          />
        </Registry.SearchContainer>

        <Registry.SortContainer>
          <Registry.SortLabel>Sort by:</Registry.SortLabel>
          <Registry.SortSelect
            value={sortBy}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              const value = e.target.value;
              if (value === 'name' || value === 'size' || value === 'popularity') {
                setSortBy(value);
              }
            }}
          >
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="popularity">Popularity</option>
          </Registry.SortSelect>
        </Registry.SortContainer>
      </Registry.Controls>

      {/* Error State */}
      {error && (
        <Registry.ErrorContainer>
          <Registry.ErrorIcon>{getErrorIcon()}</Registry.ErrorIcon>
          <Registry.ErrorText>{error}</Registry.ErrorText>
          <Registry.RetryButton onClick={handleRetry}>Retry</Registry.RetryButton>
          <Registry.ClearCacheButton onClick={handleClearCacheAndRetry}>
            Clear Cache & Retry
          </Registry.ClearCacheButton>
        </Registry.ErrorContainer>
      )}

      {/* Models Grid/List */}
      {!error && (
        <Registry.ModelsContainer viewMode={viewMode}>
          {sortedModels.length === 0 ? (
            <Registry.EmptyState>
              <Registry.EmptyIcon>🔍</Registry.EmptyIcon>
              <Registry.EmptyTitle>No models found</Registry.EmptyTitle>
              <Registry.EmptyText>
                {searchTerm ? 'Try adjusting your search terms' : 'No models available in registry'}
              </Registry.EmptyText>
            </Registry.EmptyState>
          ) : (
            sortedModels.map((model) => (
              <Registry.ModelCard key={model.name} viewMode={viewMode}>
                <Registry.ModelCardHeader>
                  <Registry.ModelInfo>
                    <Registry.ModelName>{model.name}</Registry.ModelName>
                    <Registry.ModelSize>{formatSize(model.size)}</Registry.ModelSize>
                  </Registry.ModelInfo>

                  <Registry.ModelStatus>
                    {model.isInstalled && (
                      <Registry.InstalledBadge>
                        <Registry.CheckIcon />
                        Installed
                      </Registry.InstalledBadge>
                    )}
                  </Registry.ModelStatus>
                </Registry.ModelCardHeader>

                {model.description && (
                  <Registry.ModelDescription>{model.description}</Registry.ModelDescription>
                )}

                {model.tags && model.tags.length > 0 && (
                  <Registry.ModelTags>
                    {model.tags.slice(0, 3).map((tag, index) => (
                      <Registry.Tag key={index}>{tag}</Registry.Tag>
                    ))}
                    {model.tags.length > 3 && (
                      <Registry.TagMore>+{model.tags.length - 3}</Registry.TagMore>
                    )}
                  </Registry.ModelTags>
                )}

                <Registry.ModelCardFooter>
                  <Registry.SpaceIndicator>
                    {diskSpaceInfo &&
                      (diskSpaceInfo.free > model.size ? (
                        <Registry.SpaceSuccess>
                          <Registry.SpaceIcon>✓</Registry.SpaceIcon>
                          Enough space
                        </Registry.SpaceSuccess>
                      ) : (
                        <Registry.SpaceError>
                          <Registry.SpaceIcon>✗</Registry.SpaceIcon>
                          Need{' '}
                          {(
                            model.size / (1024 * 1024 * 1024) -
                            parseFloat(diskSpaceInfo.freeGB)
                          ).toFixed(1)}
                          GB more
                        </Registry.SpaceError>
                      ))}
                  </Registry.SpaceIndicator>

                  <Registry.ActionButtons>
                    <Registry.PullButton
                      onClick={() => handleModelPull(model.name)}
                      disabled={
                        model.isInstalled ||
                        (diskSpaceInfo ? diskSpaceInfo.free <= model.size : false) ||
                        isReplacing ||
                        isPulling === model.name
                      }
                    >
                      {model.isInstalled
                        ? 'Installed'
                        : isPulling === model.name
                          ? 'Pulling...'
                          : 'Pull'}
                    </Registry.PullButton>

                    {currentModel && currentModel.name !== model.name && (
                      <Registry.ReplaceButton
                        onClick={() => handlePullAndReplace(model.name)}
                        disabled={isReplacing || isPulling === model.name}
                      >
                        {isReplacing ? 'Replacing...' : 'Replace'}
                      </Registry.ReplaceButton>
                    )}
                  </Registry.ActionButtons>
                </Registry.ModelCardFooter>
              </Registry.ModelCard>
            ))
          )}
        </Registry.ModelsContainer>
      )}
    </Registry.Container>
  );
};

const Registry = {
  Container: Styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #e2e8f0;
    overflow: hidden;
  `,

  // Header Section
  Header: Styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px 32px;
    background: rgba(15, 23, 42, 0.8);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  `,

  HeaderLeft: Styled.div``,

  Title: Styled.h1`
    font-size: 28px;
    font-weight: 700;
    margin: 0 0 4px 0;
    background: linear-gradient(135deg, #10b981, #059669);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  `,

  Subtitle: Styled.p`
    font-size: 14px;
    color: #94a3b8;
    margin: 0;
  `,

  HeaderRight: Styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
  `,

  ViewToggle: Styled.div`
    display: flex;
    background: rgba(15, 23, 42, 0.6);
    border-radius: 8px;
    padding: 4px;
    border: 1px solid rgba(148, 163, 184, 0.2);
  `,

  ViewButton: Styled.button<{ active: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 6px;
    background: ${(props) => (props.active ? '#10b981' : 'transparent')};
    color: ${(props) => (props.active ? '#ffffff' : '#94a3b8')};
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: ${(props) => (props.active ? '#059669' : 'rgba(148, 163, 184, 0.1)')};
    }
  `,

  GridIcon: Styled.div`
    width: 16px;
    height: 16px;
    background: currentColor;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z'/%3E%3C/svg%3E") no-repeat center;
    mask-size: contain;
  `,

  ListIcon: Styled.div`
    width: 16px;
    height: 16px;
    background: currentColor;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zm0-8h14V7H7v2z'/%3E%3C/svg%3E") no-repeat center;
    mask-size: contain;
  `,

  RefreshButton: Styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.6);
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(16, 185, 129, 0.1);
      border-color: #10b981;
      color: #10b981;
    }
  `,

  RefreshIcon: Styled.div`
    width: 18px;
    height: 18px;
    background: currentColor;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z'/%3E%3C/svg%3E") no-repeat center;
    mask-size: contain;
  `,

  // Stats Bar
  StatsBar: Styled.div`
    display: flex;
    gap: 24px;
    padding: 16px 32px;
    background: rgba(15, 23, 42, 0.4);
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  `,

  StatItem: Styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
  `,

  StatIcon: Styled.span`
    font-size: 16px;
  `,

  StatText: Styled.span`
    font-size: 14px;
    color: #94a3b8;
  `,

  // Controls Section
  Controls: Styled.div`
    display: flex;
    gap: 16px;
    padding: 20px 32px;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  `,

  SearchContainer: Styled.div`
    position: relative;
    flex: 1;
  `,

  SearchIcon: Styled.div`
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    background: #94a3b8;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z'/%3E%3C/svg%3E") no-repeat center;
    mask-size: contain;
  `,

  SearchInput: Styled.input`
    width: 100%;
    height: 44px;
    padding: 0 16px 0 48px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.8);
    color: #e2e8f0;
    font-size: 14px;
    transition: all 0.2s ease;

    &::placeholder {
      color: #64748b;
    }

    &:focus {
      outline: none;
      border-color: #10b981;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
    }
  `,

  SortContainer: Styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
  `,

  SortLabel: Styled.span`
    font-size: 14px;
    color: #94a3b8;
  `,

  SortSelect: Styled.select`
    height: 44px;
    padding: 0 12px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.8);
    color: #e2e8f0;
    font-size: 14px;
    cursor: pointer;

    &:focus {
      outline: none;
      border-color: #10b981;
    }
  `,

  // Error State
  ErrorContainer: Styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin: 20px 32px;
    padding: 16px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
  `,

  ErrorIcon: Styled.span`
    font-size: 20px;
  `,

  ErrorText: Styled.span`
    flex: 1;
    color: #fca5a5;
  `,

  RetryButton: Styled.button`
    padding: 8px 16px;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.1);
    color: #fca5a5;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(239, 68, 68, 0.2);
    }
  `,

  ClearCacheButton: Styled.button`
    padding: 8px 16px;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.1);
    color: #fca5a5;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(239, 68, 68, 0.2);
    }
  `,

  // Models Container
  ModelsContainer: Styled.div<{ viewMode: 'grid' | 'list' }>`
    flex: 1;
    padding: 20px 32px;
    overflow-y: auto;
    display: ${(props) => (props.viewMode === 'grid' ? 'grid' : 'flex')};
    ${(props) =>
      props.viewMode === 'grid'
        ? `
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
    `
        : `
      flex-direction: column;
      gap: 12px;
    `}
  `,

  // Model Card
  ModelCard: Styled.div<{ viewMode: 'grid' | 'list' }>`
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 12px;
    padding: ${(props) => (props.viewMode === 'grid' ? '20px' : '16px')};
    transition: all 0.2s ease;
    ${(props) =>
      props.viewMode === 'list'
        ? `
      display: flex;
      align-items: center;
      gap: 20px;
    `
        : ''}

    &:hover {
      border-color: rgba(16, 185, 129, 0.3);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      transform: translateY(-2px);
    }
  `,

  ModelCardHeader: Styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  `,

  ModelInfo: Styled.div`
    flex: 1;
  `,

  ModelName: Styled.h3`
    font-size: 18px;
    font-weight: 600;
    color: #f1f5f9;
    margin: 0 0 4px 0;
  `,

  ModelSize: Styled.span`
    font-size: 14px;
    color: #94a3b8;
    background: rgba(148, 163, 184, 0.1);
    padding: 4px 8px;
    border-radius: 6px;
  `,

  ModelStatus: Styled.div``,

  InstalledBadge: Styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
  `,

  CheckIcon: Styled.span`
    font-size: 12px;
  `,

  ModelDescription: Styled.p`
    color: #cbd5e1;
    font-size: 14px;
    line-height: 1.5;
    margin: 0 0 12px 0;
  `,

  ModelTags: Styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
  `,

  Tag: Styled.span`
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    font-size: 12px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 12px;
    border: 1px solid rgba(16, 185, 129, 0.2);
  `,

  TagMore: Styled.span`
    background: rgba(148, 163, 184, 0.1);
    color: #94a3b8;
    font-size: 12px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.2);
  `,

  ModelCardFooter: Styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
  `,

  SpaceIndicator: Styled.div``,

  SpaceSuccess: Styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    color: #10b981;
    font-size: 12px;
    font-weight: 500;
  `,

  SpaceError: Styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    color: #f87171;
    font-size: 12px;
    font-weight: 500;
  `,

  SpaceIcon: Styled.span`
    font-size: 12px;
  `,

  ActionButtons: Styled.div`
    display: flex;
    gap: 8px;
  `,

  PullButton: Styled.button`
    padding: 8px 16px;
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 6px;
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background: rgba(16, 185, 129, 0.2);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,

  ReplaceButton: Styled.button`
    padding: 8px 16px;
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 6px;
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background: rgba(245, 158, 11, 0.2);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,

  // Loading State
  LoadingState: Styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
  `,

  LoadingSpinner: Styled.div`
    width: 40px;
    height: 40px;
    border: 3px solid rgba(148, 163, 184, 0.2);
    border-top: 3px solid #10b981;
    border-radius: 50%;
    animation: spin 1s linear infinite;

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `,

  LoadingText: Styled.div`
    color: #94a3b8;
    font-size: 16px;
  `,

  // Empty State
  EmptyState: Styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    text-align: center;
  `,

  EmptyIcon: Styled.div`
    font-size: 48px;
    opacity: 0.5;
  `,

  EmptyTitle: Styled.h3`
    font-size: 20px;
    color: #94a3b8;
    margin: 0;
  `,

  EmptyText: Styled.p`
    color: #64748b;
    font-size: 14px;
    margin: 0;
  `,

  // Pull Progress Overlay
  PullOverlay: Styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `,

  PullModal: Styled.div`
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 12px;
    padding: 32px;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  `,

  PullIcon: Styled.div`
    font-size: 48px;
    color: #10b981;
  `,

  PullTitle: Styled.h2`
    font-size: 24px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0;
  `,

  PullSubtitle: Styled.p`
    font-size: 16px;
    color: #94a3b8;
    margin: 0;
  `,

  StageIndicator: Styled.div`
    display: flex;
    justify-content: space-around;
    width: 100%;
    margin-bottom: 20px;
  `,

  Stage: Styled.div<{ $active: boolean; $completed: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    color: ${(props) => (props.$active ? '#10b981' : '#94a3b8')};
    font-size: 14px;
    font-weight: ${(props) => (props.$active ? '600' : '500')};
    opacity: ${(props) => (props.$active ? 1 : 0.7)};
    text-shadow: ${(props) => (props.$active ? '0 0 5px rgba(16, 185, 129, 0.5)' : 'none')};
  `,

  StageDot: Styled.div<{ $active: boolean }>`
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: ${(props) => (props.$active ? '#10b981' : '#94a3b8')};
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
  `,

  StageText: Styled.span``,

  ProgressContainer: Styled.div`
    width: 100%;
    max-width: 250px;
    position: relative;
  `,

  ProgressBar: Styled.div`
    width: 100%;
    height: 8px;
    background: rgba(148, 163, 184, 0.2);
    border-radius: 4px;
    overflow: hidden;
  `,

  ProgressFill: Styled.div<{ progress: number }>`
    height: 100%;
    background: linear-gradient(to right, #10b981, #059669);
    width: ${(props) => props.progress}%;
    border-radius: 4px;
    transition: width 0.3s ease-in-out;
  `,

  ProgressText: Styled.span`
    font-size: 14px;
    font-weight: 500;
    color: #f1f5f9;
    position: absolute;
    top: -25px;
    left: 50%;
    transform: translateX(-50%);
  `,

  StatusText: Styled.p`
    font-size: 14px;
    color: #94a3b8;
    margin: 0;
  `,

  DetailsContainer: Styled.div`
    display: flex;
    justify-content: space-around;
    width: 100%;
    margin-bottom: 20px;
  `,

  DetailItem: Styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    color: #94a3b8;
    font-size: 14px;
  `,

  DetailIcon: Styled.span`
    font-size: 16px;
  `,

  DetailText: Styled.span`
    font-weight: 500;
  `,

  PullSpinner: Styled.div`
    width: 40px;
    height: 40px;
    border: 3px solid rgba(148, 163, 184, 0.2);
    border-top: 3px solid #10b981;
    border-radius: 50%;
    animation: spin 1s linear infinite;

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `,

  CancelButton: Styled.button`
    padding: 12px 24px;
    border: 2px solid rgba(239, 68, 68, 0.5);
    border-radius: 8px;
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 10px;

    &:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.7);
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  `,

  CancelWarning: Styled.p`
    font-size: 12px;
    color: #fca5a5;
    margin-top: 10px;
    text-align: center;
  `,
};

export default RegistryModels;
