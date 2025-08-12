import React, { useState, useEffect, useCallback } from 'react';
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

// Debounce utility function
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

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

  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'downloads' | 'name' | 'updated_at' | 'last_updated'>(
    'downloads',
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isSearching, setIsSearching] = useState(false);

  // Manual pagination for search
  const [currentSearchPage, setCurrentSearchPage] = useState(1);
  const [totalSearchPages, setTotalSearchPages] = useState(0);
  const [totalSearchResults, setTotalSearchResults] = useState(0);

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
          searchQuery || undefined,
          sortBy,
          sortOrder,
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
      console.log(
        `🔍 DEBUG: Loading more - current offset: ${communityOffset}, next offset: ${nextOffset}`,
      );
      console.log(
        `🔍 DEBUG: Search params - query: '${searchQuery}', sortBy: '${sortBy}', sortOrder: '${sortOrder}'`,
      );
      const moreModels = await window.backendBridge.ollama.getAvailableModelsFromRegistry(
        nextOffset,
        20,
        searchQuery || undefined,
        sortBy,
        sortOrder,
      );

      if (moreModels && moreModels.length > 0) {
        console.log(
          `🔍 DEBUG: Adding ${moreModels.length} more models. Current count: ${communityModels.length}`,
        );
        console.log(
          `🔍 DEBUG: New model names:`,
          moreModels.slice(0, 5).map((m) => m.name),
        );
        setCommunityModels((prev) => {
          const newArray = [...prev, ...moreModels];
          console.log(`🔍 DEBUG: Total after append: ${newArray.length}`);
          return newArray;
        });
        setCommunityOffset(nextOffset);
        console.log(`🔍 DEBUG: Updated offset from ${communityOffset} to ${nextOffset}`);

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

  // Search and sort handlers
  const refreshWithCurrentFilters = async (offset = 0) => {
    setLoading(true);
    setCommunityOffset(offset);

    try {
      const response = await window.backendBridge.ollama.getAvailableModelsFromRegistry(
        offset,
        20,
        searchQuery || undefined,
        sortBy,
        sortOrder,
      );
      if (offset === 0) {
        console.log(`🔍 DEBUG: Setting fresh community models: ${(response || []).length}`);
        console.log(
          `🔍 DEBUG: First 5 model names:`,
          (response || []).slice(0, 5).map((m) => m.name),
        );
        setCommunityModels(response || []);
        setHasMoreModels(true);
      } else {
        console.log(
          `🔍 DEBUG: Adding ${(response || []).length} models to existing ${communityModels.length}`,
        );
        setCommunityModels((prev) => {
          const newArray = [...prev, ...(response || [])];
          console.log(`🔍 DEBUG: Total after refresh append: ${newArray.length}`);
          return newArray;
        });
      }
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  // Manual search with pagination
  const performSearch = async (query: string, page: number = 1) => {
    setIsSearching(true);
    const offset = (page - 1) * 20;

    try {
      console.log(`🔍 DEBUG: Search page ${page}, offset ${offset}, query: '${query}'`);
      const response = await window.backendBridge.ollama.getAvailableModelsFromRegistry(
        offset,
        20,
        query || undefined,
        sortBy,
        sortOrder,
      );

      if (page === 1) {
        // First page - replace results
        setCommunityModels(response || []);
      } else {
        // Subsequent pages - accumulate results
        setCommunityModels((prev) => [...prev, ...(response || [])]);
      }
      setCurrentSearchPage(page);

      // Calculate total pages (estimate based on typical API behavior)
      if (response && response.length === 20) {
        // If we got full page, assume more pages exist
        setTotalSearchPages(Math.max(page + 1, totalSearchPages));
      } else if (response && response.length < 20) {
        // If partial page, this is the last page
        setTotalSearchPages(page);
      }

      console.log(`🔍 DEBUG: Search complete - page ${page}, got ${response?.length || 0} results`);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      if (query.trim()) {
        setCurrentSearchPage(1);
        setTotalSearchPages(0);
        await performSearch(query, 1);
      } else {
        // No search - return to infinite scroll mode
        setCommunityOffset(0);
        setHasMoreModels(true);
        setCurrentSearchPage(1);
        setTotalSearchPages(0);
        await refreshWithCurrentFilters(0);
      }
    }, 300),
    [sortBy, sortOrder],
  );

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    debouncedSearch(value);
  };

  // Handle sort change
  const handleSortChange = async (newSortBy: string) => {
    setSortBy(newSortBy as 'downloads' | 'name' | 'updated_at' | 'last_updated');
    if (searchQuery.trim()) {
      // Re-search with new sort
      await performSearch(searchQuery, 1);
    } else {
      await refreshWithCurrentFilters(0);
    }
  };

  // Handle sort order toggle
  const handleSortOrderToggle = async () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(newOrder);
    if (searchQuery.trim()) {
      // Re-search with new sort order
      await performSearch(searchQuery, 1);
    } else {
      await refreshWithCurrentFilters(0);
    }
  };

  // Handle clear search
  const handleClearSearch = () => {
    setSearchQuery('');
    debouncedSearch('');
  };

  // Handle manual page navigation for search
  const handleSearchPageChange = async (newPage: number) => {
    if (searchQuery.trim() && newPage >= 1) {
      await performSearch(searchQuery, newPage);
    }
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
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                onClearSearch={handleClearSearch}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={handleSortChange}
                onSortOrderToggle={handleSortOrderToggle}
                isSearching={isSearching}
                // Manual pagination props
                currentSearchPage={currentSearchPage}
                totalSearchPages={totalSearchPages}
                onSearchPageChange={handleSearchPageChange}
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
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  sortBy: string;
  sortOrder: string;
  onSortChange: (sortBy: string) => void;
  onSortOrderToggle: () => void;
  isSearching: boolean;
  // Manual pagination props
  currentSearchPage: number;
  totalSearchPages: number;
  onSearchPageChange: (page: number) => void;
}> = ({
  localModels,
  communityModels,
  onDownload,
  onDelete,
  onLoadMore,
  loadingMore,
  hasMoreModels,
  searchQuery,
  onSearchChange,
  onClearSearch,
  sortBy,
  sortOrder,
  onSortChange,
  onSortOrderToggle,
  isSearching,
  // Manual pagination props
  currentSearchPage,
  totalSearchPages,
  onSearchPageChange,
}) => {
  // Scroll detection for community models list (only when not searching)
  const handleCommunityScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Only enable scroll loading when not in search mode
    if (searchQuery.trim()) return;

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

        {/* Search and Sort Controls */}
        <SearchContainer>
          <SearchAndSortRow>
            <SearchInput>
              <SearchField
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={onSearchChange}
              />
              {searchQuery && <ClearButton onClick={onClearSearch}>✕</ClearButton>}
            </SearchInput>

            <SortControls>
              <SortLabel>Sort by:</SortLabel>
              <SortSelect value={sortBy} onChange={(e) => onSortChange(e.target.value)}>
                <option value="downloads">Most Popular</option>
                <option value="name">Name</option>
                <option value="updated_at">Recently Updated</option>
                <option value="last_updated">Last Updated</option>
              </SortSelect>
              <SortOrderButton onClick={onSortOrderToggle}>
                {sortOrder === 'asc' ? '↑ A-Z' : '↓ Z-A'}
              </SortOrderButton>
            </SortControls>
          </SearchAndSortRow>

          {/* Search Results Info */}
          {searchQuery.trim() && (
            <SearchResultsInfo>
              {isSearching
                ? 'Searching...'
                : `Found ${communityModels.length} models for "${searchQuery}"`}
              {currentSearchPage > 1 && !isSearching && ` (Page ${currentSearchPage})`}
            </SearchResultsInfo>
          )}
        </SearchContainer>

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
          {isSearching && <LoadingMessage>Searching...</LoadingMessage>}
          {!searchQuery.trim() && loadingMore && (
            <LoadingMessage>Loading more models...</LoadingMessage>
          )}
          {!searchQuery.trim() && !hasMoreModels && communityModels.length > 0 && (
            <EmptyMessage>All {communityModels.length} models loaded</EmptyMessage>
          )}
          {searchQuery && communityModels.length === 0 && !isSearching && (
            <EmptyMessage>No models found for "{searchQuery}"</EmptyMessage>
          )}
          {!searchQuery && communityModels.length === 0 && !isSearching && !loadingMore && (
            <EmptyMessage>No models available</EmptyMessage>
          )}
        </ModelList>

        {/* Manual Pagination for Search Results */}
        {searchQuery.trim() && totalSearchPages > 1 && (
          <PaginationContainer>
            <PaginationButton
              onClick={() => onSearchPageChange(currentSearchPage - 1)}
              disabled={currentSearchPage <= 1}
            >
              Previous
            </PaginationButton>

            <PaginationInfo>
              Page {currentSearchPage} of {totalSearchPages}
            </PaginationInfo>

            <PaginationNumbers>
              {Array.from({ length: Math.min(5, totalSearchPages) }, (_, i) => {
                const pageNum = Math.max(1, currentSearchPage - 2) + i;
                if (pageNum > totalSearchPages) return null;
                return (
                  <PaginationNumber
                    key={pageNum}
                    active={pageNum === currentSearchPage}
                    onClick={() => onSearchPageChange(pageNum)}
                  >
                    {pageNum}
                  </PaginationNumber>
                );
              }).filter(Boolean)}
            </PaginationNumbers>

            <PaginationButton
              onClick={() => onSearchPageChange(currentSearchPage + 1)}
              disabled={currentSearchPage >= totalSearchPages}
            >
              Next
            </PaginationButton>
          </PaginationContainer>
        )}
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

// Search and Sort Components
const SearchContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
`;

const SearchAndSortRow = styled.div`
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
`;

const SearchResultsInfo = styled.div`
  color: ${(props) => props.theme.colors.textSecondary};
  font-size: 14px;
  font-style: italic;
  padding: 8px 0;
`;

const SearchInput = styled.div`
  display: flex;
  align-items: center;
  position: relative;
`;

const SearchField = styled.input`
  flex: 1;
  padding: 12px 40px 12px 15px;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 8px;
  background: ${(props) => props.theme.colors.background};
  color: ${(props) => props.theme.colors.core};
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.colors.emerald};
  }

  &::placeholder {
    color: ${(props) => props.theme.colors.textSecondary};
  }
`;

const ClearButton = styled.button`
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: ${(props) => props.theme.colors.textSecondary};
  cursor: pointer;
  padding: 4px;
  font-size: 14px;

  &:hover {
    color: ${(props) => props.theme.colors.core};
  }
`;

const SortControls = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

const SortLabel = styled.span`
  color: ${(props) => props.theme.colors.core};
  font-size: 14px;
  font-weight: 500;
`;

const SortSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 6px;
  background: ${(props) => props.theme.colors.background};
  color: ${(props) => props.theme.colors.core};
  font-size: 14px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.colors.emerald};
  }
`;

const SortOrderButton = styled.button`
  padding: 8px 16px;
  border: 1px solid ${(props) => props.theme.colors.emerald};
  border-radius: 6px;
  background: transparent;
  color: ${(props) => props.theme.colors.emerald};
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) => props.theme.colors.emerald}20;
  }
`;

// Pagination Components for Search Results
const PaginationContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 20px;
  margin-top: 10px;
`;

const PaginationButton = styled.button<{ disabled?: boolean }>`
  padding: 8px 16px;
  border: 1px solid ${(props) => props.theme.colors.emerald};
  border-radius: 6px;
  background: ${(props) => (props.disabled ? 'transparent' : 'transparent')};
  color: ${(props) =>
    props.disabled ? props.theme.colors.textSecondary : props.theme.colors.emerald};
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};

  &:hover {
    background: ${(props) => (!props.disabled ? props.theme.colors.emerald + '20' : 'transparent')};
  }
`;

const PaginationInfo = styled.span`
  color: ${(props) => props.theme.colors.core};
  font-size: 14px;
  font-weight: 500;
  margin: 0 8px;
`;

const PaginationNumbers = styled.div`
  display: flex;
  gap: 4px;
`;

const PaginationNumber = styled.button<{ active: boolean }>`
  width: 36px;
  height: 36px;
  border: 1px solid
    ${(props) => (props.active ? props.theme.colors.emerald : props.theme.colors.border)};
  border-radius: 6px;
  background: ${(props) => (props.active ? props.theme.colors.emerald : 'transparent')};
  color: ${(props) => (props.active ? props.theme.colors.background : props.theme.colors.core)};
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) =>
      props.active ? props.theme.colors.emerald : props.theme.colors.emerald + '20'};
    border-color: ${(props) => props.theme.colors.emerald};
  }
`;

export default ModelsView;
