import { createUserModel } from './user';
import { createTokenModel } from './token';
import { createSessionModel } from './session';
import { createBalanceModel } from './balance';
import { createConversationModel } from './convo';
import { createMessageModel } from './message';
import { createProjectModel } from './project';
import { createProjectSourceModel } from './projectSource';
import {
  createDocumentClarificationModel,
  createDocumentOverlayModel,
  createDocumentRenderVersionModel,
  createDocumentSpeechAudioArtifactModel,
  createDocumentSpeechPlanModel,
  createDocumentSpeechSegmentModel,
  createDocumentVisualizationModel,
  createStudyDocumentModel,
} from './document';
import {
  createDialogCellModel,
  createDialogClarificationModel,
  createDialogExecutionRunModel,
  createDialogImportModel,
  createDialogPlanNodeModel,
  createDialogSourceMapModel,
  createDialogTutorStateModel,
  createDialogVisualizationModel,
  createStudyDialogModel,
} from './dialog';
import {
  createLearnerEventModel,
  createLearnerKnowledgeEdgeModel,
  createLearnerKnowledgeNodeModel,
  createLearnerProfileModel,
} from './learner';
import { createClarificationModel } from './clarification';
import { createVisualizationModel } from './visualization';
import { createMessageRevisionModel } from './messageRevision';
import { createAgentModel } from './agent';
import { createAgentApiKeyModel } from './agentApiKey';
import { createAgentCategoryModel } from './agentCategory';
import { createMCPServerModel } from './mcpServer';
import { createRoleModel } from './role';
import { createActionModel } from './action';
import { createAssistantModel } from './assistant';
import { createFileModel } from './file';
import { createBannerModel } from './banner';
import { createKeyModel } from './key';
import { createPluginAuthModel } from './pluginAuth';
import { createTransactionModel } from './transaction';
import { createPresetModel } from './preset';
import { createPromptModel } from './prompt';
import { createPromptGroupModel } from './promptGroup';
import { createConversationTagModel } from './conversationTag';
import { createSharedLinkModel } from './sharedLink';
import { createToolCallModel } from './toolCall';
import { createMemoryModel } from './memory';
import { createAccessRoleModel } from './accessRole';
import { createAclEntryModel } from './aclEntry';
import { createSystemGrantModel } from './systemGrant';
import { createGroupModel } from './group';
import { createConfigModel } from './config';

/**
 * Creates all database models for all collections
 */
export function createModels(mongoose: typeof import('mongoose')) {
  return {
    User: createUserModel(mongoose),
    Token: createTokenModel(mongoose),
    Session: createSessionModel(mongoose),
    Balance: createBalanceModel(mongoose),
    Conversation: createConversationModel(mongoose),
    Message: createMessageModel(mongoose),
    Project: createProjectModel(mongoose),
    ProjectSource: createProjectSourceModel(mongoose),
    StudyDocument: createStudyDocumentModel(mongoose),
    DocumentRenderVersion: createDocumentRenderVersionModel(mongoose),
    DocumentOverlay: createDocumentOverlayModel(mongoose),
    DocumentClarification: createDocumentClarificationModel(mongoose),
    DocumentVisualization: createDocumentVisualizationModel(mongoose),
    DocumentSpeechPlan: createDocumentSpeechPlanModel(mongoose),
    DocumentSpeechSegment: createDocumentSpeechSegmentModel(mongoose),
    DocumentSpeechAudioArtifact: createDocumentSpeechAudioArtifactModel(mongoose),
    StudyDialog: createStudyDialogModel(mongoose),
    DialogCell: createDialogCellModel(mongoose),
    DialogExecutionRun: createDialogExecutionRunModel(mongoose),
    DialogPlanNode: createDialogPlanNodeModel(mongoose),
    DialogTutorState: createDialogTutorStateModel(mongoose),
    DialogImport: createDialogImportModel(mongoose),
    DialogSourceMap: createDialogSourceMapModel(mongoose),
    DialogClarification: createDialogClarificationModel(mongoose),
    DialogVisualization: createDialogVisualizationModel(mongoose),
    LearnerProfile: createLearnerProfileModel(mongoose),
    LearnerKnowledgeNode: createLearnerKnowledgeNodeModel(mongoose),
    LearnerKnowledgeEdge: createLearnerKnowledgeEdgeModel(mongoose),
    LearnerEvent: createLearnerEventModel(mongoose),
    MessageClarification: createClarificationModel(mongoose),
    VisualizationArtifact: createVisualizationModel(mongoose),
    MessageRevision: createMessageRevisionModel(mongoose),
    Agent: createAgentModel(mongoose),
    AgentApiKey: createAgentApiKeyModel(mongoose),
    AgentCategory: createAgentCategoryModel(mongoose),
    MCPServer: createMCPServerModel(mongoose),
    Role: createRoleModel(mongoose),
    Action: createActionModel(mongoose),
    Assistant: createAssistantModel(mongoose),
    File: createFileModel(mongoose),
    Banner: createBannerModel(mongoose),
    Key: createKeyModel(mongoose),
    PluginAuth: createPluginAuthModel(mongoose),
    Transaction: createTransactionModel(mongoose),
    Preset: createPresetModel(mongoose),
    Prompt: createPromptModel(mongoose),
    PromptGroup: createPromptGroupModel(mongoose),
    ConversationTag: createConversationTagModel(mongoose),
    SharedLink: createSharedLinkModel(mongoose),
    ToolCall: createToolCallModel(mongoose),
    MemoryEntry: createMemoryModel(mongoose),
    AccessRole: createAccessRoleModel(mongoose),
    AclEntry: createAclEntryModel(mongoose),
    SystemGrant: createSystemGrantModel(mongoose),
    Group: createGroupModel(mongoose),
    Config: createConfigModel(mongoose),
  };
}
