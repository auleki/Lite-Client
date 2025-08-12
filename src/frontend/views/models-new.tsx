import React, { useState, useEffect } from 'react';
import styled, { useTheme } from 'styled-components';

// Import types from the backend bridge
import { RegistryModel } from '../renderer.d';

// Types for our models - use the actual backend response types
interface LocalModel {
  name: string;
  size: number;
  modified_at: Date; // This comes from ollama as Date, not string
}

// Use RegistryModel directly for community models since that's what backend returns
type CommunityModel = RegistryModel;

interface RemoteModel {
  id: string;
  name: string;
  description: string;
  isFavorite?: boolean;
}

const ModelsView: React.FC = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<'local' | 'remote'>('local');
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [communityModels, setCommunityModels] = useState<CommunityModel[]>([]);
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  const [loading, setLoading] = useState(false);

  // Scroll loading state
  const [communityOffset, setCommunityOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreModels, setHasMoreModels] = useState(true);

  // Load data when tab changes
  useEffect(() => {
    loadTabData();
  }, [activeTab]);

  const loadTabData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'local') {
        // Load downloaded models
        const localResponse = await window.backendBridge.ollama.getAllModels();
        setLocalModels(localResponse.models || []);

        // Load initial community models (reset scroll loading)
        setCommunityOffset(0);
        setHasMoreModels(true);
        const communityResponse = await window.backendBridge.ollama.getAvailableModelsFromRegistry(
          0,
          20,
        );
        setCommunityModels(communityResponse || []);
      } else {
        // Load remote models
        const remoteResponse = await window.backendBridge.morpheus.getModels();
        setRemoteModels(remoteResponse || []);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreCommunityModels = async () => {
    if (loadingMore || !hasMoreModels) return;

    setLoadingMore(true);
    try {
      const nextOffset = communityOffset + 20;
      const moreModels = await window.backendBridge.ollama.getAvailableModelsFromRegistry(
        nextOffset,
        20,
      );

      if (moreModels && moreModels.length > 0) {
        setCommunityModels((prev) => [...prev, ...moreModels]);
        setCommunityOffset(nextOffset);

        // Check if we've reached the end (less than 20 models returned)
        if (moreModels.length < 20) {
          setHasMoreModels(false);
        }
      } else {
        setHasMoreModels(false);
      }
    } catch (error) {
      console.error('Failed to load more models:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDownload = async (modelName: string) => {
    try {
      await window.backendBridge.ollama.getModel(modelName);
      // Refresh local models
      if (activeTab === 'local') {
        loadTabData();
      }
    } catch (error) {
      console.error('Failed to download model:', error);
    }
  };

  const handleDelete = async (modelName: string) => {
    if (confirm(`Are you sure you want to delete ${modelName}?`)) {
      try {
        await window.backendBridge.ollama.deleteModel(modelName);
        // Refresh local models
        loadTabData();
      } catch (error) {
        console.error('Failed to delete model:', error);
      }
    }
  };

  const handleToggleFavorite = (modelId: string) => {
    // TODO: Implement favorites in local storage
    console.log('Toggle favorite for:', modelId);
  };

  return (
    <Container>
      <Header>
        <Title>Models</Title>
        <TabContainer>
          <Tab active={activeTab === 'local'} onClick={() => setActiveTab('local')}>
            Local Mode
          </Tab>
          <Tab active={activeTab === 'remote'} onClick={() => setActiveTab('remote')}>
            Remote Mode
          </Tab>
        </TabContainer>
      </Header>

      <Content>
        {loading ? (
          <LoadingMessage>Loading models...</LoadingMessage>
        ) : (
          <>
            {activeTab === 'local' ? (
              <LocalTabContent
                localModels={localModels}
                communityModels={communityModels}
                onDownload={handleDownload}
                onDelete={handleDelete}
                onLoadMore={loadMoreCommunityModels}
                loadingMore={loadingMore}
                hasMoreModels={hasMoreModels}
              />
            ) : (
              <RemoteTabContent
                remoteModels={remoteModels}
                onToggleFavorite={handleToggleFavorite}
              />
            )}
          </>
        )}
      </Content>
    </Container>
  );
};

// Local Tab Component
const LocalTabContent: React.FC<{
  localModels: LocalModel[];
  communityModels: CommunityModel[];
  onDownload: (modelName: string) => void;
  onDelete: (modelName: string) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
  hasMoreModels: boolean;
}> = ({
  localModels,
  communityModels,
  onDownload,
  onDelete,
  onLoadMore,
  loadingMore,
  hasMoreModels,
}) => {
  // Scroll detection for community models list
  const handleCommunityScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const threshold = 0.8; // Load more when 80% scrolled

    if (scrollTop + clientHeight >= scrollHeight * threshold && hasMoreModels && !loadingMore) {
      onLoadMore();
    }
  };

  return (
    <LocalContainer>
      <Section>
        <SectionTitle>Downloaded Models</SectionTitle>
        <ModelList>
          {localModels.map((model) => (
            <ModelItem key={model.name}>
              <ModelInfo>
                <ModelName>{model.name}</ModelName>
                <ModelMeta>Size: {(model.size / (1024 * 1024 * 1024)).toFixed(1)}GB</ModelMeta>
              </ModelInfo>
              <ActionButton variant="delete" onClick={() => onDelete(model.name)}>
                Delete
              </ActionButton>
            </ModelItem>
          ))}
          {localModels.length === 0 && <EmptyMessage>No models downloaded</EmptyMessage>}
        </ModelList>
      </Section>

      <Section>
        <SectionTitle>Available Models</SectionTitle>
        <ModelList onScroll={handleCommunityScroll}>
          {communityModels.map((model) => (
            <ModelItem key={model.name}>
              <ModelInfo>
                <ModelName>{model.name}</ModelName>
                <ModelMeta>{model.isInstalled && <span>Installed</span>}</ModelMeta>
              </ModelInfo>
              <ActionButton variant="download" onClick={() => onDownload(model.name)}>
                {model.isInstalled ? 'Installed' : 'Download'}
              </ActionButton>
            </ModelItem>
          ))}
          {loadingMore && <LoadingMessage>Loading more models...</LoadingMessage>}
          {!hasMoreModels && communityModels.length > 0 && (
            <EmptyMessage>All {communityModels.length} models loaded</EmptyMessage>
          )}
          {communityModels.length === 0 && !loadingMore && (
            <EmptyMessage>No models available</EmptyMessage>
          )}
        </ModelList>
      </Section>
    </LocalContainer>
  );
};

// Remote Tab Component
const RemoteTabContent: React.FC<{
  remoteModels: RemoteModel[];
  onToggleFavorite: (modelId: string) => void;
}> = ({ remoteModels, onToggleFavorite }) => (
  <Section>
    <SectionTitle>Morpheus API Models</SectionTitle>
    <ModelList>
      {remoteModels.map((model) => (
        <ModelItem key={model.id}>
          <ModelInfo>
            <ModelName>{model.name}</ModelName>
            <ModelMeta>{model.description}</ModelMeta>
          </ModelInfo>
          <ActionButton
            variant={model.isFavorite ? 'favorited' : 'favorite'}
            onClick={() => onToggleFavorite(model.id)}
          >
            {model.isFavorite ? 'Unfavorite' : 'Favorite'}
          </ActionButton>
        </ModelItem>
      ))}
      {remoteModels.length === 0 && <EmptyMessage>No remote models available</EmptyMessage>}
    </ModelList>
  </Section>
);

// Styled Components
const Container = styled.div`
  padding: 20px;
  background: ${(props) => props.theme.colors.background};
  color: ${(props) => props.theme.colors.core};
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  margin-bottom: 30px;
  flex-shrink: 0;
`;

const Title = styled.h1`
  color: ${(props) => props.theme.colors.emerald};
  margin: 0 0 20px 0;
  font-size: 24px;
  font-weight: 600;
`;

const TabContainer = styled.div`
  display: flex;
  gap: 10px;
`;

const Tab = styled.button.withConfig({
  shouldForwardProp: (prop) => !['active'].includes(prop),
})<{ active: boolean }>`
  padding: 12px 24px;
  background: ${(props) => (props.active ? props.theme.colors.emerald : 'transparent')};
  color: ${(props) => (props.active ? props.theme.colors.background : props.theme.colors.emerald)};
  border: 2px solid ${(props) => props.theme.colors.emerald};
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) =>
      props.active ? props.theme.colors.emerald : props.theme.colors.emerald + '20'};
  }
`;

const Content = styled.div`
  background: ${(props) => props.theme.colors.balance};
  border-radius: 12px;
  padding: 20px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const LocalContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 30px;
  flex: 1;
  overflow-y: auto;
`;

const Section = styled.div`
  margin-bottom: 20px;
  flex-shrink: 0;
`;

const SectionTitle = styled.h2`
  color: ${(props) => props.theme.colors.emerald};
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 15px 0;
`;

const ModelList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
`;

const ModelItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: ${(props) => props.theme.colors.background};
  border-radius: 8px;
  border: 1px solid ${(props) => props.theme.colors.border};
`;

const ModelInfo = styled.div`
  flex: 1;
`;

const ModelName = styled.div`
  color: ${(props) => props.theme.colors.core};
  font-weight: 500;
  margin-bottom: 4px;
`;

const ModelMeta = styled.div`
  color: ${(props) => props.theme.colors.textSecondary};
  font-size: 12px;
`;

const ActionButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['variant'].includes(prop),
})<{ variant: string }>`
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;

  ${(props) => {
    switch (props.variant) {
      case 'download':
        return `
          background: ${props.theme.colors.emerald};
          color: ${props.theme.colors.background};
          &:hover { background: ${props.theme.colors.emerald}dd; }
        `;
      case 'delete':
        return `
          background: #ff4444;
          color: white;
          &:hover { background: #ff4444dd; }
        `;
      case 'favorite':
        return `
          background: transparent;
          color: ${props.theme.colors.emerald};
          border: 1px solid ${props.theme.colors.emerald};
          &:hover { background: ${props.theme.colors.emerald}20; }
        `;
      case 'favorited':
        return `
          background: ${props.theme.colors.emerald};
          color: ${props.theme.colors.background};
          &:hover { background: ${props.theme.colors.emerald}dd; }
        `;
      default:
        return '';
    }
  }}
`;

const LoadingMessage = styled.div`
  text-align: center;
  color: ${(props) => props.theme.colors.textSecondary};
  padding: 40px;
`;

const EmptyMessage = styled.div`
  text-align: center;
  color: ${(props) => props.theme.colors.textSecondary};
  padding: 20px;
  font-style: italic;
`;

export default ModelsView;
