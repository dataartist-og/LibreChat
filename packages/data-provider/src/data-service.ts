import type { AxiosResponse } from 'axios';
import type * as t from './types';
import * as endpoints from './api-endpoints';
import * as a from './types/assistants';
import * as ag from './types/agents';
import * as m from './types/mutations';
import * as q from './types/queries';
import * as f from './types/files';
import * as mcp from './types/mcpServers';
import * as config from './config';
import request from './request';
import * as s from './schemas';
import * as r from './roles';
import * as permissions from './accessPermissions';

export const getLectureSource = (source: q.LectureSource): Promise<q.LectureSourceResponse> =>
  request.post(endpoints.lectureSource(), { source });

export const askLecture = (
  payload: q.LectureAskRequest,
  signal?: AbortSignal,
): Promise<q.LectureAskResponse> =>
  request.postWithOptions(endpoints.lectureAsk(), payload, { signal });

export const indexLecture = (payload: q.LectureIndexRequest): Promise<q.Lecture> =>
  request.post(endpoints.lectureIndex(), payload);

export const importLecture = (payload: q.Lecture): Promise<q.Lecture> =>
  request.post(endpoints.lectureImport(), payload);

export const getLectureVoiceStatus = (): Promise<q.LectureVoiceStatus> =>
  request.get(endpoints.lectureVoice());
export const getLectureYouTube = (
  payload: q.LectureYouTubeRequest,
): Promise<q.LectureYouTubeResponse> => request.post(endpoints.lectureYouTube(), payload);
export const startLectureVoice = (
  payload: q.LectureVoiceRequest,
  signal?: AbortSignal,
): Promise<q.LectureVoiceSession> =>
  request.postWithOptions(endpoints.lectureVoice(), payload, { signal });
export const stopLectureVoice = (sessionId: string): Promise<{ stopped: true }> =>
  request.post(endpoints.lectureVoiceStop(), { sessionId });
export const extractLectureNotes = (
  payload: q.LectureNotesRequest,
  signal?: AbortSignal,
): Promise<q.LectureNotesResponse> =>
  request.postWithOptions(endpoints.lectureNotes(), payload, { signal });

export function revokeUserKey(name: string): Promise<unknown> {
  return request.delete(endpoints.revokeUserKey(name));
}

export function revokeAllUserKeys(): Promise<unknown> {
  return request.delete(endpoints.revokeAllUserKeys());
}

export function deleteUser(payload?: t.TDeleteUserRequest): Promise<unknown> {
  return request.deleteWithOptions(endpoints.deleteUser(), { data: payload });
}

export type FavoriteItem = {
  agentId?: string;
  model?: string;
  endpoint?: string;
};

export function getFavorites(): Promise<FavoriteItem[]> {
  return request.get(`${endpoints.apiBaseUrl()}/api/user/settings/favorites`);
}

export function updateFavorites(favorites: FavoriteItem[]): Promise<FavoriteItem[]> {
  return request.post(`${endpoints.apiBaseUrl()}/api/user/settings/favorites`, { favorites });
}

export function getSharedMessages(shareId: string): Promise<t.TSharedMessagesResponse> {
  return request.get(endpoints.shareMessages(shareId));
}

export const listSharedLinks = async (
  params: q.SharedLinksListParams,
): Promise<q.SharedLinksResponse> => {
  const { pageSize, isPublic, sortBy, sortDirection, search, cursor } = params;

  return request.get(
    endpoints.getSharedLinks(pageSize, isPublic, sortBy, sortDirection, search, cursor),
  );
};

export function getSharedLink(conversationId: string): Promise<t.TSharedLinkGetResponse> {
  return request.get(endpoints.getSharedLink(conversationId));
}

export function createSharedLink(
  conversationId: string,
  targetMessageId?: string,
): Promise<t.TSharedLinkResponse> {
  return request.post(endpoints.createSharedLink(conversationId), { targetMessageId });
}

export function updateSharedLink(shareId: string): Promise<t.TSharedLinkResponse> {
  return request.patch(endpoints.updateSharedLink(shareId));
}

export function deleteSharedLink(shareId: string): Promise<m.TDeleteSharedLinkResponse> {
  return request.delete(endpoints.shareMessages(shareId));
}

export function updateUserKey(payload: t.TUpdateUserKeyRequest) {
  const { value } = payload;
  if (!value) {
    throw new Error('value is required');
  }

  return request.put(endpoints.keys(), payload);
}

export function getAgentApiKeys(): Promise<t.TAgentApiKeyListResponse> {
  return request.get(endpoints.apiKeys());
}

export function createAgentApiKey(
  payload: t.TAgentApiKeyCreateRequest,
): Promise<t.TAgentApiKeyCreateResponse> {
  return request.post(endpoints.apiKeys(), payload);
}

export function deleteAgentApiKey(id: string): Promise<void> {
  return request.delete(endpoints.apiKeyById(id));
}

export function getPresets(): Promise<s.TPreset[]> {
  return request.get(endpoints.presets());
}

export function createPreset(payload: s.TPreset): Promise<s.TPreset> {
  return request.post(endpoints.presets(), payload);
}

export function updatePreset(payload: s.TPreset): Promise<s.TPreset> {
  return request.post(endpoints.presets(), payload);
}

export function deletePreset(arg: s.TPreset | undefined): Promise<m.PresetDeleteResponse> {
  return request.post(endpoints.deletePreset(), arg);
}

export function getSearchEnabled(): Promise<boolean> {
  return request.get(endpoints.searchEnabled());
}

export function getUser(): Promise<t.TUser> {
  return request.get(endpoints.user());
}

export function getUserBalance(): Promise<t.TBalanceResponse> {
  return request.get(endpoints.balance());
}

export const updateTokenCount = (text: string) => {
  return request.post(endpoints.tokenizer(), { arg: text });
};

export const login = (payload: t.TLoginUser): Promise<t.TLoginResponse> => {
  return request.post(endpoints.login(), payload);
};

export const logout = (): Promise<m.TLogoutResponse> => {
  return request.post(endpoints.logout());
};

export const register = (payload: t.TRegisterUser) => {
  return request.post(endpoints.register(), payload);
};

export const userKeyQuery = (name: string): Promise<t.TCheckUserKeyResponse> =>
  request.get(endpoints.userKeyQuery(name));

export const getLoginGoogle = () => {
  return request.get(endpoints.loginGoogle());
};

export const requestPasswordReset = (
  payload: t.TRequestPasswordReset,
): Promise<t.TRequestPasswordResetResponse> => {
  return request.post(endpoints.requestPasswordReset(), payload);
};

export const resetPassword = (payload: t.TResetPassword) => {
  return request.post(endpoints.resetPassword(), payload);
};

export const verifyEmail = (payload: t.TVerifyEmail): Promise<t.VerifyEmailResponse> => {
  return request.post(endpoints.verifyEmail(), payload);
};

export const resendVerificationEmail = (
  payload: t.TResendVerificationEmail,
): Promise<t.VerifyEmailResponse> => {
  return request.post(endpoints.resendVerificationEmail(), payload);
};

export const getAvailablePlugins = (): Promise<s.TPlugin[]> => {
  return request.get(endpoints.plugins());
};

export const updateUserPlugins = (payload: t.TUpdateUserPlugins) => {
  return request.post(endpoints.userPlugins(), payload);
};

export const reinitializeMCPServer = (serverName: string) => {
  return request.post(endpoints.mcpReinitialize(serverName));
};

export const bindMCPOAuth = (serverName: string): Promise<{ success: boolean }> => {
  return request.post(endpoints.mcpOAuthBind(serverName));
};

export const bindActionOAuth = (actionId: string): Promise<{ success: boolean }> => {
  return request.post(endpoints.actionOAuthBind(actionId));
};

export const getMCPConnectionStatus = (): Promise<q.MCPConnectionStatusResponse> => {
  return request.get(endpoints.mcpConnectionStatus());
};

export const getMCPServerConnectionStatus = (
  serverName: string,
): Promise<q.MCPServerConnectionStatusResponse> => {
  return request.get(endpoints.mcpServerConnectionStatus(serverName));
};

export const getMCPAuthValues = (serverName: string): Promise<q.MCPAuthValuesResponse> => {
  return request.get(endpoints.mcpAuthValues(serverName));
};

export function cancelMCPOAuth(serverName: string): Promise<m.CancelMCPOAuthResponse> {
  return request.post(endpoints.cancelMCPOAuth(serverName), {});
}

/* Config */

export const getStartupConfig = (): Promise<
  config.TStartupConfig & {
    mcpCustomUserVars?: Record<string, { title: string; description: string }>;
  }
> => {
  return request.get(endpoints.config());
};

export const getAIEndpoints = (): Promise<t.TEndpointsConfig> => {
  return request.get(endpoints.aiEndpoints());
};

export const getModels = async (): Promise<t.TModelsConfig> => {
  return request.get(endpoints.models());
};

/* Assistants */

export const createAssistant = ({
  version,
  ...data
}: a.AssistantCreateParams): Promise<a.Assistant> => {
  return request.post(endpoints.assistants({ version }), data);
};

export const getAssistantById = ({
  endpoint,
  assistant_id,
  version,
}: {
  endpoint: s.AssistantsEndpoint;
  assistant_id: string;
  version: number | string | number;
}): Promise<a.Assistant> => {
  return request.get(
    endpoints.assistants({
      path: assistant_id,
      endpoint,
      version,
    }),
  );
};

export const updateAssistant = ({
  assistant_id,
  data,
  version,
}: {
  assistant_id: string;
  data: a.AssistantUpdateParams;
  version: number | string;
}): Promise<a.Assistant> => {
  return request.patch(
    endpoints.assistants({
      path: assistant_id,
      version,
    }),
    data,
  );
};

export const deleteAssistant = ({
  assistant_id,
  model,
  endpoint,
  version,
}: m.DeleteAssistantBody & { version: number | string }): Promise<void> => {
  return request.delete(
    endpoints.assistants({
      path: assistant_id,
      options: { model, endpoint },
      version,
    }),
  );
};

export const listAssistants = (
  params: a.AssistantListParams,
  version: number | string,
): Promise<a.AssistantListResponse> => {
  return request.get(
    endpoints.assistants({
      version,
      options: params,
    }),
  );
};

export function getAssistantDocs({
  endpoint,
  version,
}: {
  endpoint: s.AssistantsEndpoint | string;
  version: number | string;
}): Promise<a.AssistantDocument[]> {
  if (!s.isAssistantsEndpoint(endpoint)) {
    return Promise.resolve([]);
  }
  return request.get(
    endpoints.assistants({
      path: 'documents',
      version,
      options: { endpoint },
      endpoint: endpoint as s.AssistantsEndpoint,
    }),
  );
}

/* Tools */

export const getAvailableTools = (
  _endpoint: s.AssistantsEndpoint | s.EModelEndpoint.agents,
  version?: number | string,
): Promise<s.TPlugin[]> => {
  let path = '';
  if (s.isAssistantsEndpoint(_endpoint)) {
    const endpoint = _endpoint as s.AssistantsEndpoint;
    path = endpoints.assistants({
      path: 'tools',
      endpoint: endpoint,
      version: version ?? config.defaultAssistantsVersion[endpoint],
    });
  } else {
    path = endpoints.agents({
      path: 'tools',
    });
  }

  return request.get(path);
};

/* MCP Tools - Decoupled from regular tools */

export const getMCPTools = (): Promise<q.MCPServersResponse> => {
  return request.get(endpoints.mcp.tools);
};

export const getVerifyAgentToolAuth = (
  params: q.VerifyToolAuthParams,
): Promise<q.VerifyToolAuthResponse> => {
  return request.get(
    endpoints.agents({
      path: `tools/${params.toolId}/auth`,
    }),
  );
};

export const callTool = <T extends m.ToolId>({
  toolId,
  toolParams,
}: {
  toolId: T;
  toolParams: m.ToolParams<T>;
}): Promise<m.ToolCallResponse> => {
  return request.post(
    endpoints.agents({
      path: `tools/${toolId}/call`,
    }),
    toolParams,
  );
};

export const getToolCalls = (params: q.GetToolCallParams): Promise<q.ToolCallResults> => {
  return request.get(
    endpoints.agents({
      path: 'tools/calls',
      options: params,
    }),
  );
};

/* Files */

export const getFiles = (): Promise<f.TFile[]> => {
  return request.get(endpoints.files());
};

export const getAgentFiles = (agentId: string): Promise<f.TFile[]> => {
  return request.get(endpoints.agentFiles(agentId));
};

export const getFileConfig = (): Promise<f.FileConfig> => {
  return request.get(`${endpoints.files()}/config`);
};

export const uploadImage = (
  data: FormData,
  signal?: AbortSignal | null,
): Promise<f.TFileUpload> => {
  const requestConfig = signal ? { signal } : undefined;
  return request.postMultiPart(endpoints.images(), data, requestConfig);
};

export const uploadFile = (data: FormData, signal?: AbortSignal | null): Promise<f.TFileUpload> => {
  const requestConfig = signal ? { signal } : undefined;
  return request.postMultiPart(endpoints.files(), data, requestConfig);
};

/* actions */

export const updateAction = (data: m.UpdateActionVariables): Promise<m.UpdateActionResponse> => {
  const { assistant_id, version, ...body } = data;
  return request.post(
    endpoints.assistants({
      path: `actions/${assistant_id}`,
      version,
    }),
    body,
  );
};

export function getActions(): Promise<ag.Action[]> {
  return request.get(
    endpoints.agents({
      path: 'actions',
    }),
  );
}

export const deleteAction = async ({
  assistant_id,
  action_id,
  model,
  version,
  endpoint,
}: m.DeleteActionVariables & { version: number | string }): Promise<void> =>
  request.delete(
    endpoints.assistants({
      path: `actions/${assistant_id}/${action_id}/${model}`,
      version,
      endpoint,
    }),
  );

/**
 * Agents
 */

export const createAgent = ({ ...data }: a.AgentCreateParams): Promise<a.Agent> => {
  return request.post(endpoints.agents({}), data);
};

export const getAgentById = ({ agent_id }: { agent_id: string }): Promise<a.Agent> => {
  return request.get(
    endpoints.agents({
      path: agent_id,
    }),
  );
};

export const getExpandedAgentById = ({ agent_id }: { agent_id: string }): Promise<a.Agent> => {
  return request.get(
    endpoints.agents({
      path: `${agent_id}/expanded`,
    }),
  );
};

export const updateAgent = ({
  agent_id,
  data,
}: {
  agent_id: string;
  data: a.AgentUpdateParams;
}): Promise<a.Agent> => {
  return request.patch(
    endpoints.agents({
      path: agent_id,
    }),
    data,
  );
};

export const duplicateAgent = ({
  agent_id,
}: m.DuplicateAgentBody): Promise<{ agent: a.Agent; actions: ag.Action[] }> => {
  return request.post(
    endpoints.agents({
      path: `${agent_id}/duplicate`,
    }),
  );
};

export const deleteAgent = ({ agent_id }: m.DeleteAgentBody): Promise<void> => {
  return request.delete(
    endpoints.agents({
      path: agent_id,
    }),
  );
};

export const listAgents = (params: a.AgentListParams): Promise<a.AgentListResponse> => {
  return request.get(
    endpoints.agents({
      options: params,
    }),
  );
};

export const revertAgentVersion = ({
  agent_id,
  version_index,
}: {
  agent_id: string;
  version_index: number;
}): Promise<a.Agent> => request.post(endpoints.revertAgentVersion(agent_id), { version_index });

/* Marketplace */

/**
 * Get agent categories with counts for marketplace tabs
 */
export const getAgentCategories = (): Promise<t.TMarketplaceCategory[]> => {
  return request.get(endpoints.agents({ path: 'categories' }));
};

/**
 * Unified marketplace agents endpoint with query string controls
 */
export const getMarketplaceAgents = (params: {
  requiredPermission: number;
  category?: string;
  search?: string;
  limit?: number;
  cursor?: string;
  promoted?: 0 | 1;
}): Promise<a.AgentListResponse> => {
  return request.get(
    endpoints.agents({
      // path: 'marketplace',
      options: params,
    }),
  );
};

/* Tools */

export const getAvailableAgentTools = (): Promise<s.TPlugin[]> => {
  return request.get(
    endpoints.agents({
      path: 'tools',
    }),
  );
};

/* Actions */

export const updateAgentAction = (
  data: m.UpdateAgentActionVariables,
): Promise<m.UpdateAgentActionResponse> => {
  const { agent_id, ...body } = data;
  return request.post(
    endpoints.agents({
      path: `actions/${agent_id}`,
    }),
    body,
  );
};

export const deleteAgentAction = async ({
  agent_id,
  action_id,
}: m.DeleteAgentActionVariables): Promise<void> =>
  request.delete(
    endpoints.agents({
      path: `actions/${agent_id}/${action_id}`,
    }),
  );

/**
 * MCP Servers
 */

/**
 *
 * Ensure and List loaded mcp server configs from the cache Enriched with effective permissions.
 */
export const getMCPServers = async (): Promise<mcp.MCPServersListResponse> => {
  return request.get(endpoints.mcp.servers);
};

/**
 * Get a single MCP server by ID
 */
export const getMCPServer = async (serverName: string): Promise<mcp.MCPServerDBObjectResponse> => {
  return request.get(endpoints.mcpServer(serverName));
};

/**
 * Create a new MCP server
 */
export const createMCPServer = async (
  data: mcp.MCPServerCreateParams,
): Promise<mcp.MCPServerDBObjectResponse> => {
  return request.post(endpoints.mcp.servers, data);
};

/**
 * Update an existing MCP server
 */
export const updateMCPServer = async (
  serverName: string,
  data: mcp.MCPServerUpdateParams,
): Promise<mcp.MCPServerDBObjectResponse> => {
  return request.patch(endpoints.mcpServer(serverName), data);
};

/**
 * Delete an MCP server
 */
export const deleteMCPServer = async (serverName: string): Promise<{ success: boolean }> => {
  return request.delete(endpoints.mcpServer(serverName));
};

/**
 * Imports a conversations file.
 *
 * @param data - The FormData containing the file to import.
 * @returns A Promise that resolves to the import start response.
 */
export const importConversationsFile = (data: FormData): Promise<t.TImportResponse> => {
  return request.postMultiPart(endpoints.importConversation(), data);
};

export const uploadAvatar = (data: FormData): Promise<f.AvatarUploadResponse> => {
  return request.postMultiPart(endpoints.avatar(), data);
};

export const uploadAssistantAvatar = (data: m.AssistantAvatarVariables): Promise<a.Assistant> => {
  return request.postMultiPart(
    endpoints.assistants({
      isAvatar: true,
      path: `${data.assistant_id}/avatar`,
      options: { model: data.model, endpoint: data.endpoint },
      version: data.version,
    }),
    data.formData,
  );
};

export const uploadAgentAvatar = (data: m.AgentAvatarVariables): Promise<a.Agent> => {
  return request.postMultiPart(
    `${endpoints.images()}/agents/${data.agent_id}/avatar`,
    data.formData,
  );
};

export const getFileDownload = async (userId: string, file_id: string): Promise<AxiosResponse> => {
  return request.getResponse(`${endpoints.files()}/download/${userId}/${file_id}`, {
    responseType: 'blob',
    headers: {
      Accept: 'application/octet-stream',
    },
  });
};

export const getCodeOutputDownload = async (url: string): Promise<AxiosResponse> => {
  return request.getResponse(url, {
    responseType: 'blob',
    headers: {
      Accept: 'application/octet-stream',
    },
  });
};

export const deleteFiles = async (payload: {
  files: f.BatchFile[];
  agent_id?: string;
  assistant_id?: string;
  tool_resource?: a.EToolResources;
}): Promise<f.DeleteFilesResponse> =>
  request.deleteWithOptions(endpoints.files(), {
    data: payload,
  });

/* Speech */

export const speechToText = (data: FormData): Promise<f.SpeechToTextResponse> => {
  return request.postMultiPart(endpoints.speechToText(), data);
};

export const textToSpeech = (data: FormData): Promise<ArrayBuffer> => {
  return request.postTTS(endpoints.textToSpeechManual(), data);
};

export const getVoices = (): Promise<f.VoiceResponse> => {
  return request.get(endpoints.textToSpeechVoices());
};

export const getCustomConfigSpeech = (): Promise<t.TCustomConfigSpeechResponse> => {
  return request.get(endpoints.getCustomConfigSpeech());
};

/* conversations */

export function duplicateConversation(
  payload: t.TDuplicateConvoRequest,
): Promise<t.TDuplicateConvoResponse> {
  return request.post(endpoints.duplicateConversation(), payload);
}

export function forkConversation(payload: t.TForkConvoRequest): Promise<t.TForkConvoResponse> {
  return request.post(endpoints.forkConversation(), payload);
}

export function deleteConversation(payload: t.TDeleteConversationRequest) {
  return request.deleteWithOptions(endpoints.deleteConversation(), { data: { arg: payload } });
}

export function clearAllConversations(): Promise<unknown> {
  return request.delete(endpoints.deleteAllConversation());
}

export const listConversations = (
  params?: q.ConversationListParams,
): Promise<q.ConversationListResponse> => {
  return request.get(endpoints.conversations(params ?? {}));
};

export function getConversations(cursor: string): Promise<t.TGetConversationsResponse> {
  return request.get(endpoints.conversations({ cursor }));
}

export function getConversationById(id: string): Promise<s.TConversation> {
  return request.get(endpoints.conversationById(id));
}

export function updateConversation(
  payload: t.TUpdateConversationRequest,
): Promise<t.TUpdateConversationResponse> {
  return request.post(endpoints.updateConversation(), { arg: payload });
}

export function archiveConversation(
  payload: t.TArchiveConversationRequest,
): Promise<t.TArchiveConversationResponse> {
  return request.post(endpoints.archiveConversation(), { arg: payload });
}

export function listProjects(): Promise<t.TProject[]> {
  return request.get(endpoints.projects());
}

export function createProject(payload: t.TProjectCreateRequest): Promise<t.TProject> {
  return request.post(endpoints.projects(), payload);
}

export function getProjectById(projectId: string): Promise<t.TProject> {
  return request.get(endpoints.projectById(projectId));
}

export function updateProject(payload: t.TProjectUpdateRequest): Promise<t.TProject> {
  const { projectId, ...update } = payload;
  return request.patch(endpoints.projectById(projectId), update);
}

export function archiveProject(projectId: string): Promise<t.TProject> {
  return request.delete(endpoints.projectById(projectId));
}

export function listProjectSources(projectId: string): Promise<t.TProjectSource[]> {
  return request.get(endpoints.projectSources(projectId));
}

export function createProjectSource(
  payload: t.TProjectSourceCreateRequest,
): Promise<t.TProjectSource> {
  const { projectId, ...data } = payload;
  return request.post(endpoints.projectSources(projectId), data);
}

export function updateProjectSource(
  payload: t.TProjectSourceUpdateRequest,
): Promise<t.TProjectSource> {
  const { sourceId, projectId, ...data } = payload;
  return request.patch(endpoints.projectSourceById(projectId, sourceId), data);
}

export function deleteProjectSource(
  projectId: string,
  sourceId: string,
): Promise<t.TProjectSource> {
  return request.delete(endpoints.projectSourceById(projectId, sourceId));
}

export function listDialogs(params?: t.TStudyDialogListParams): Promise<t.TStudyDialog[]> {
  return request.get(endpoints.dialogs(params));
}

export function createDialog(payload: t.TStudyDialogCreateRequest): Promise<t.TDialogWorkspace> {
  return request.post(endpoints.dialogs(), payload);
}

export function createStarterDialog(
  payload: t.TStudyDialogStarterRequest,
): Promise<t.TDialogWorkspace> {
  return request.post(endpoints.dialogStarter(), payload);
}

export function getDialogWorkspace(dialogId: string): Promise<t.TDialogWorkspace> {
  return request.get(endpoints.dialogById(dialogId));
}

export function getDialogTutorWorkspace(dialogId: string): Promise<t.TDialogTutorWorkspace> {
  return request.get(endpoints.dialogTutor(dialogId));
}

export function getLearnerWorkspace(): Promise<t.TLearnerWorkspace> {
  return request.get(endpoints.learnerProfile());
}

export function updateDialog(payload: t.TStudyDialogUpdateRequest): Promise<t.TDialogWorkspace> {
  const { dialogId, ...data } = payload;
  return request.patch(endpoints.dialogById(dialogId), data);
}

export function createDialogCell(payload: t.TDialogCellCreateRequest): Promise<t.TDialogWorkspace> {
  const { dialogId, ...data } = payload;
  return request.post(endpoints.dialogCells(dialogId), data);
}

export function updateDialogCell(payload: t.TDialogCellUpdateRequest): Promise<t.TDialogWorkspace> {
  const { dialogId, cellId, ...data } = payload;
  return request.patch(endpoints.dialogCellById(dialogId, cellId), data);
}

export function executeDialogCell(
  payload: t.TDialogCellExecuteRequest,
): Promise<t.TDialogWorkspace> {
  return request.post(endpoints.dialogCellExecute(payload.dialogId, payload.cellId), {});
}

export function selectDialogTrajectory(
  payload: t.TDialogTrajectorySelectRequest,
): Promise<t.TDialogWorkspace> {
  const { dialogId, trajectoryKey } = payload;
  return request.post(endpoints.dialogTrajectory(dialogId), { trajectoryKey });
}

export function runDialogTutorAction(
  payload: t.TDialogTutorActionRequest,
): Promise<t.TDialogTutorActionResponse> {
  const { dialogId, ...data } = payload;
  return request.post(endpoints.dialogTutorAction(dialogId), data);
}

export function createDialogClarification(
  payload: t.TDialogClarificationCreateRequest,
): Promise<t.TDialogClarification> {
  const { dialogId, cellId, ...data } = payload;
  return request.post(endpoints.dialogClarifications(dialogId, cellId), data);
}

export function integrateDialogClarification(
  payload: t.TDialogClarificationIntegrateRequest,
): Promise<t.TDialogClarification> {
  const { clarificationId, ...data } = payload;
  return request.post(endpoints.dialogClarificationIntegrate(clarificationId), data);
}

export function createDialogVisualization(
  payload: t.TDialogVisualizationCreateRequest,
): Promise<t.TDialogVisualization> {
  const { dialogId, cellId, ...data } = payload;
  return request.post(endpoints.dialogVisualizations(dialogId, cellId), data);
}

export function integrateDialogVisualization(
  payload: t.TDialogVisualizationIntegrateRequest,
): Promise<t.TDialogVisualization> {
  const { visualizationId, ...data } = payload;
  return request.post(endpoints.dialogVisualizationIntegrate(visualizationId), data);
}

export function deleteDialogVisualization(
  visualizationId: string,
): Promise<t.TDialogVisualization> {
  return request.delete(endpoints.dialogVisualizationById(visualizationId));
}

export function listStudyDocuments(
  params?: t.TStudyDocumentListParams,
): Promise<t.TStudyDocument[]> {
  return request.get(endpoints.documents(params));
}

export function listExploreStudyDocuments(
  params?: t.TExploreStudyDocumentListParams,
): Promise<t.TStudyDocument[]> {
  return request.get(endpoints.exploreDocuments(params));
}

export function createStudyDocument(
  payload: t.TStudyDocumentCreateRequest,
): Promise<t.TDocumentWorkspace> {
  return request.post(endpoints.documents(), payload);
}

export function getStudyDocumentWorkspace(documentId: string): Promise<t.TDocumentWorkspace> {
  return request.get(endpoints.documentById(documentId));
}

export function getExploreStudyDocumentWorkspace(
  documentId: string,
): Promise<t.TDocumentWorkspace> {
  return request.get(endpoints.exploreDocumentById(documentId));
}

export function reingestStudyDocument(documentId: string): Promise<t.TDocumentWorkspace> {
  return request.post(endpoints.documentReingest(documentId), {});
}

export function importStudyDocument(documentId: string): Promise<t.TDocumentWorkspace> {
  return request.post(endpoints.documentImport(documentId), {});
}

export function updateStudyDocumentSharing(
  payload: t.TStudyDocumentSharingRequest,
): Promise<t.TStudyDocument> {
  const { documentId, ...data } = payload;
  return request.patch(endpoints.documentSharing(documentId), data);
}

export function createDocumentClarification(
  payload: t.TDocumentClarificationCreateRequest,
): Promise<t.TDocumentClarification> {
  const { documentId, ...data } = payload;
  return request.post(endpoints.documentClarifications(documentId), data);
}

export function integrateDocumentClarification(
  payload: t.TDocumentClarificationIntegrateRequest,
): Promise<t.TDocumentClarification> {
  const { clarificationId, ...data } = payload;
  return request.post(endpoints.documentClarificationIntegrate(clarificationId), data);
}

export function archiveDocumentClarification(
  clarificationId: string,
): Promise<t.TDocumentClarification> {
  return request.delete(endpoints.documentClarificationById(clarificationId));
}

export function createDocumentVisualization(
  payload: t.TDocumentVisualizationCreateRequest,
): Promise<t.TDocumentVisualization> {
  const { documentId, ...data } = payload;
  return request.post(endpoints.documentVisualizations(documentId), data);
}

export function integrateDocumentVisualization(
  payload: t.TDocumentVisualizationIntegrateRequest,
): Promise<t.TDocumentVisualization> {
  const { visualizationId, ...data } = payload;
  return request.post(endpoints.documentVisualizationIntegrate(visualizationId), data);
}

export function deleteDocumentVisualization(
  visualizationId: string,
): Promise<t.TDocumentVisualization> {
  return request.delete(endpoints.documentVisualizationById(visualizationId));
}

export function getDocumentSpeechManifest(
  payload: t.TDocumentSpeechManifestRequest,
): Promise<t.TDocumentSpeechManifest> {
  const { documentId, ...data } = payload;
  return request.post(endpoints.documentSpeechManifest(documentId), data);
}

export function getDocumentSpeechAudioArtifact(
  payload: t.TDocumentSpeechAudioRequest,
): Promise<t.TDocumentSpeechAudioArtifact> {
  const { documentId, ...data } = payload;
  return request.post(endpoints.documentSpeechAudio(documentId), data);
}

export function getDocumentSpeechAudioDownload(
  documentId: string,
  audioArtifactId: string,
): Promise<AxiosResponse<Blob>> {
  return request.getResponse(endpoints.documentSpeechAudioById(documentId, audioArtifactId), {
    responseType: 'blob',
    headers: {
      Accept: 'audio/*',
    },
  });
}

export function listClarifications(
  params: t.TClarificationListParams,
): Promise<t.TClarification[]> {
  const { conversationId, parentMessageId, includeArchived } = params;
  return request.get(
    endpoints.conversationClarifications(conversationId, {
      parentMessageId,
      includeArchived,
    }),
  );
}

export function createClarification(
  payload: t.TClarificationCreateRequest,
): Promise<t.TClarification> {
  return request.post(endpoints.conversationClarifications(payload.conversationId), payload);
}

export function updateClarification(
  payload: t.TClarificationUpdateRequest,
): Promise<t.TClarification> {
  const { clarificationId, ...data } = payload;
  return request.patch(endpoints.clarificationById(clarificationId), data);
}

export function integrateClarification(
  payload: t.TClarificationIntegrateRequest,
): Promise<t.TClarification> {
  const { clarificationId, ...data } = payload;
  return request.post(endpoints.clarificationIntegrate(clarificationId), data);
}

export function reanchorClarification(
  payload: t.TClarificationReanchorRequest,
): Promise<t.TClarification> {
  const { clarificationId, ...data } = payload;
  return request.post(endpoints.clarificationReanchor(clarificationId), data);
}

export function suggestClarifications(
  payload: t.TClarificationSuggestionRequest,
): Promise<t.TClarificationSuggestionSet> {
  const { conversationId, ...data } = payload;
  return request.post(endpoints.clarificationSuggestions(conversationId), data);
}

export function listVisualizations(
  params: t.TVisualizationListParams,
): Promise<t.TVisualization[]> {
  return request.get(
    endpoints.visualizations({
      conversationId: params.conversationId,
      parentMessageId: params.parentMessageId,
      includeArchived: params.includeArchived,
      includeDeleted: params.includeDeleted,
      includeAllVersions: params.includeAllVersions,
    }),
  );
}

export function createVisualization(
  payload: t.TVisualizationCreateRequest,
): Promise<t.TVisualization> {
  return request.post(endpoints.visualizations(), payload);
}

export function getVisualization(visualizationId: string): Promise<t.TVisualization> {
  return request.get(endpoints.visualizationById(visualizationId));
}

export function updateVisualization(
  payload: t.TVisualizationUpdateRequest,
): Promise<t.TVisualization> {
  const { visualizationId, ...data } = payload;
  return request.patch(endpoints.visualizationById(visualizationId), data);
}

export function regenerateVisualization(
  payload: t.TVisualizationRegenerateRequest,
): Promise<t.TVisualization> {
  const { visualizationId, ...data } = payload;
  return request.post(endpoints.visualizationRegenerate(visualizationId), data);
}

export function refineVisualization(
  payload: t.TVisualizationRefineRequest,
): Promise<t.TVisualization> {
  const { visualizationId, ...data } = payload;
  return request.post(endpoints.visualizationRefine(visualizationId), data);
}

export function integrateVisualization(
  payload: t.TVisualizationIntegrateRequest,
): Promise<t.TVisualization> {
  const { visualizationId, ...data } = payload;
  return request.post(endpoints.visualizationIntegrate(visualizationId), data);
}

export function duplicateVisualization(
  payload: t.TVisualizationDuplicateRequest,
): Promise<t.TVisualization> {
  const { visualizationId, ...data } = payload;
  return request.post(endpoints.visualizationDuplicate(visualizationId), data);
}

export function deleteVisualization(visualizationId: string): Promise<t.TVisualization> {
  return request.delete(endpoints.visualizationById(visualizationId));
}

export function suggestVisualizations(
  payload: t.TVisualizationSuggestionRequest,
): Promise<t.TVisualizationSuggestionSet> {
  return request.post(endpoints.visualizationSuggestions(), payload);
}

export function listMessageRevisions(messageId: string): Promise<t.TMessageRevision[]> {
  return request.get(endpoints.messageRevisions(messageId));
}

export function genTitle(payload: m.TGenTitleRequest): Promise<m.TGenTitleResponse> {
  return request.get(endpoints.genTitle(payload.conversationId));
}

export const listMessages = (params?: q.MessagesListParams): Promise<q.MessagesListResponse> => {
  return request.get(endpoints.messages(params ?? {}));
};

export function updateMessage(payload: t.TUpdateMessageRequest): Promise<unknown> {
  const { conversationId, messageId, text } = payload;
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  return request.put(endpoints.messages({ conversationId, messageId }), { text });
}

export function updateMessageContent(payload: t.TUpdateMessageContent): Promise<unknown> {
  const { conversationId, messageId, index, text } = payload;
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  return request.put(endpoints.messages({ conversationId, messageId }), { text, index });
}

export const editArtifact = async ({
  messageId,
  ...params
}: m.TEditArtifactRequest): Promise<m.TEditArtifactResponse> => {
  return request.post(endpoints.messagesArtifacts(messageId), params);
};

export const branchMessage = async (
  payload: m.TBranchMessageRequest,
): Promise<m.TBranchMessageResponse> => {
  return request.post(endpoints.messagesBranch(), payload);
};

export function getMessagesByConvoId(conversationId: string): Promise<s.TMessage[]> {
  if (
    conversationId === config.Constants.NEW_CONVO ||
    conversationId === config.Constants.PENDING_CONVO
  ) {
    return Promise.resolve([]);
  }
  return request.get(endpoints.messages({ conversationId }));
}

export function getPrompt(id: string): Promise<{ prompt: t.TPrompt }> {
  return request.get(endpoints.getPrompt(id));
}

export function getPrompts(filter: t.TPromptsWithFilterRequest): Promise<t.TPrompt[]> {
  return request.get(endpoints.getPromptsWithFilters(filter));
}

export function getAllPromptGroups(): Promise<q.AllPromptGroupsResponse> {
  return request.get(endpoints.getAllPromptGroups());
}

export function getPromptGroups(
  filter: t.TPromptGroupsWithFilterRequest,
): Promise<t.PromptGroupListResponse> {
  return request.get(endpoints.getPromptGroupsWithFilters(filter));
}

export function getPromptGroup(id: string): Promise<t.TPromptGroup> {
  return request.get(endpoints.getPromptGroup(id));
}

export function createPrompt(payload: t.TCreatePrompt): Promise<t.TCreatePromptResponse> {
  return request.post(endpoints.postPrompt(), payload);
}

export function addPromptToGroup(
  groupId: string,
  payload: t.TCreatePrompt,
): Promise<t.TCreatePromptResponse> {
  return request.post(endpoints.addPromptToGroup(groupId), payload);
}

export function updatePromptGroup(
  variables: t.TUpdatePromptGroupVariables,
): Promise<t.TUpdatePromptGroupResponse> {
  return request.patch(endpoints.updatePromptGroup(variables.id), variables.payload);
}

export function recordPromptGroupUsage(groupId: string): Promise<{ numberOfGenerations: number }> {
  return request.post(endpoints.recordPromptGroupUsage(groupId));
}

export function deletePrompt(payload: t.TDeletePromptVariables): Promise<t.TDeletePromptResponse> {
  return request.delete(endpoints.deletePrompt(payload));
}

export function makePromptProduction(id: string): Promise<t.TMakePromptProductionResponse> {
  return request.patch(endpoints.updatePromptTag(id));
}

export function updatePromptLabels(
  variables: t.TUpdatePromptLabelsRequest,
): Promise<t.TUpdatePromptLabelsResponse> {
  return request.patch(endpoints.updatePromptLabels(variables.id), variables.payload);
}

export function deletePromptGroup(id: string): Promise<t.TDeletePromptGroupResponse> {
  return request.delete(endpoints.deletePromptGroup(id));
}

export function getCategories(): Promise<t.TGetCategoriesResponse> {
  return request.get(endpoints.getCategories());
}

export function getRandomPrompts(
  variables: t.TGetRandomPromptsRequest,
): Promise<t.TGetRandomPromptsResponse> {
  return request.get(endpoints.getRandomPrompts(variables.limit, variables.skip));
}

/* Roles */
export function getRole(roleName: string): Promise<r.TRole> {
  return request.get(endpoints.getRole(roleName));
}

export function updatePromptPermissions(
  variables: m.UpdatePromptPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(endpoints.updatePromptPermissions(variables.roleName), variables.updates);
}

export function updateAgentPermissions(
  variables: m.UpdateAgentPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(endpoints.updateAgentPermissions(variables.roleName), variables.updates);
}

export function updateMemoryPermissions(
  variables: m.UpdateMemoryPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(endpoints.updateMemoryPermissions(variables.roleName), variables.updates);
}

export function updatePeoplePickerPermissions(
  variables: m.UpdatePeoplePickerPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(
    endpoints.updatePeoplePickerPermissions(variables.roleName),
    variables.updates,
  );
}

export function updateMCPServersPermissions(
  variables: m.UpdateMCPServersPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(endpoints.updateMCPServersPermissions(variables.roleName), variables.updates);
}

export function updateRemoteAgentsPermissions(
  variables: m.UpdateRemoteAgentsPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(
    endpoints.updateRemoteAgentsPermissions(variables.roleName),
    variables.updates,
  );
}

export function updateMarketplacePermissions(
  variables: m.UpdateMarketplacePermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(endpoints.updateMarketplacePermissions(variables.roleName), variables.updates);
}

/* Tags */
export function getConversationTags(): Promise<t.TConversationTagsResponse> {
  return request.get(endpoints.conversationTags());
}

export function createConversationTag(
  payload: t.TConversationTagRequest,
): Promise<t.TConversationTagResponse> {
  return request.post(endpoints.conversationTags(), payload);
}

export function updateConversationTag(
  tag: string,
  payload: t.TConversationTagRequest,
): Promise<t.TConversationTagResponse> {
  return request.put(endpoints.conversationTags(tag), payload);
}
export function deleteConversationTag(tag: string): Promise<t.TConversationTagResponse> {
  return request.delete(endpoints.conversationTags(tag));
}

export function addTagToConversation(
  conversationId: string,
  payload: t.TTagConversationRequest,
): Promise<t.TTagConversationResponse> {
  return request.put(endpoints.addTagToConversation(conversationId), payload);
}
export function rebuildConversationTags(): Promise<t.TConversationTagsResponse> {
  return request.post(endpoints.conversationTags('rebuild'));
}

export function healthCheck(): Promise<string> {
  return request.get(endpoints.health());
}

export function getUserTerms(): Promise<t.TUserTermsResponse> {
  return request.get(endpoints.userTerms());
}

export function acceptTerms(): Promise<t.TAcceptTermsResponse> {
  return request.post(endpoints.acceptUserTerms());
}

export function getBanner(): Promise<t.TBannerResponse> {
  return request.get(endpoints.banner());
}

export function updateFeedback(
  conversationId: string,
  messageId: string,
  payload: t.TUpdateFeedbackRequest,
): Promise<t.TUpdateFeedbackResponse> {
  return request.put(endpoints.feedback(conversationId, messageId), payload);
}

// 2FA
export function enableTwoFactor(payload?: t.TEnable2FARequest): Promise<t.TEnable2FAResponse> {
  return request.post(endpoints.enableTwoFactor(), payload);
}

export function verifyTwoFactor(payload: t.TVerify2FARequest): Promise<t.TVerify2FAResponse> {
  return request.post(endpoints.verifyTwoFactor(), payload);
}

export function confirmTwoFactor(payload: t.TVerify2FARequest): Promise<t.TVerify2FAResponse> {
  return request.post(endpoints.confirmTwoFactor(), payload);
}

export function disableTwoFactor(payload?: t.TDisable2FARequest): Promise<t.TDisable2FAResponse> {
  return request.post(endpoints.disableTwoFactor(), payload);
}

export function regenerateBackupCodes(
  payload?: t.TRegenerateBackupCodesRequest,
): Promise<t.TRegenerateBackupCodesResponse> {
  return request.post(endpoints.regenerateBackupCodes(), payload);
}

export function verifyTwoFactorTemp(
  payload: t.TVerify2FATempRequest,
): Promise<t.TVerify2FATempResponse> {
  return request.post(endpoints.verifyTwoFactorTemp(), payload);
}

/* Memories */
export const getMemories = (): Promise<q.MemoriesResponse> => {
  return request.get(endpoints.memories());
};

export const deleteMemory = (key: string): Promise<void> => {
  return request.delete(endpoints.memory(key));
};

export const updateMemory = (
  key: string,
  value: string,
  originalKey?: string,
): Promise<q.TUserMemory> => {
  return request.patch(endpoints.memory(originalKey || key), { key, value });
};

export const updateMemoryPreferences = (preferences: {
  memories: boolean;
}): Promise<{ updated: boolean; preferences: { memories: boolean } }> => {
  return request.patch(endpoints.memoryPreferences(), preferences);
};

export const createMemory = (data: {
  key: string;
  value: string;
}): Promise<{ created: boolean; memory: q.TUserMemory }> => {
  return request.post(endpoints.memories(), data);
};

export function searchPrincipals(
  params: q.PrincipalSearchParams,
): Promise<q.PrincipalSearchResponse> {
  return request.get(endpoints.searchPrincipals(params));
}

export function getAccessRoles(
  resourceType: permissions.ResourceType,
): Promise<q.AccessRolesResponse> {
  return request.get(endpoints.getAccessRoles(resourceType));
}

export function getResourcePermissions(
  resourceType: permissions.ResourceType,
  resourceId: string,
): Promise<permissions.TGetResourcePermissionsResponse> {
  return request.get(endpoints.getResourcePermissions(resourceType, resourceId));
}

export function updateResourcePermissions(
  resourceType: permissions.ResourceType,
  resourceId: string,
  data: permissions.TUpdateResourcePermissionsRequest,
): Promise<permissions.TUpdateResourcePermissionsResponse> {
  return request.put(endpoints.updateResourcePermissions(resourceType, resourceId), data);
}

export function getEffectivePermissions(
  resourceType: permissions.ResourceType,
  resourceId: string,
): Promise<permissions.TEffectivePermissionsResponse> {
  return request.get(endpoints.getEffectivePermissions(resourceType, resourceId));
}

export function getAllEffectivePermissions(
  resourceType: permissions.ResourceType,
): Promise<permissions.TAllEffectivePermissionsResponse> {
  return request.get(endpoints.getAllEffectivePermissions(resourceType));
}

// SharePoint Graph API Token
export function getGraphApiToken(params: q.GraphTokenParams): Promise<q.GraphTokenResponse> {
  return request.get(endpoints.graphToken(params.scopes));
}

export function getDomainServerBaseUrl(): string {
  return `${endpoints.apiBaseUrl()}/api`;
}

/* Active Jobs */
export interface ActiveJobsResponse {
  activeJobIds: string[];
}

export const getActiveJobs = (): Promise<ActiveJobsResponse> => {
  return request.get(endpoints.activeJobs());
};
