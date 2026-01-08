import { relations } from "drizzle-orm/relations";
import { user, account, workspace, workspaceNotificationSubscription, workspaceNotificationDelivery, workflow, knowledgeBase, document, environment, usageLog, workspaceByokKeys, agentProfile, browserProfile, session, organization, invitation, member, chat, userDbBudget, userGlobalDatabase, workspaceDatabase, memory, workflowFolder, workflowEdges, workflowBlocks, workflowSubflows, permissions, workflowExecutionSnapshots, embedding, templateStars, templates, webhook, knowledgeBaseTagDefinitions, workflowCheckpoints, copilotChats, copilotFeedback, workflowExecutionLogs, workflowDeploymentVersion, workspaceEnvironment, workspaceInvitation, mcpServers, apiKey, ssoProvider, workspaceFile, workspaceFiles, userStats, customTools, pausedExecutions, resumeQueue, templateCreators, workflowSchedule, settings } from "./schema";

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	accounts: many(account),
	workspaceNotificationSubscriptions: many(workspaceNotificationSubscription),
	environments: many(environment),
	usageLogs: many(usageLog),
	workspaceByokKeys: many(workspaceByokKeys),
	agentProfiles: many(agentProfile),
	browserProfiles: many(browserProfile),
	sessions: many(session),
	invitations: many(invitation),
	members: many(member),
	chats: many(chat),
	userDbBudgets: many(userDbBudget),
	userGlobalDatabases: many(userGlobalDatabase),
	knowledgeBases: many(knowledgeBase),
	workflowFolders: many(workflowFolder),
	permissions: many(permissions),
	templateStars: many(templateStars),
	workflowCheckpoints: many(workflowCheckpoints),
	copilotFeedbacks: many(copilotFeedback),
	copilotChats: many(copilotChats),
	workspaceInvitations: many(workspaceInvitation),
	mcpServers: many(mcpServers),
	workflows: many(workflow),
	apiKeys_userId: many(apiKey, {
		relationName: "apiKey_userId_user_id"
	}),
	apiKeys_createdBy: many(apiKey, {
		relationName: "apiKey_createdBy_user_id"
	}),
	ssoProviders: many(ssoProvider),
	workspaceFiles_uploadedBy: many(workspaceFile),
	workspaces_ownerId: many(workspace, {
		relationName: "workspace_ownerId_user_id"
	}),
	workspaces_billedAccountUserId: many(workspace, {
		relationName: "workspace_billedAccountUserId_user_id"
	}),
	workspaceFiles_userId: many(workspaceFiles),
	userStats: many(userStats),
	customTools: many(customTools),
	templateCreators: many(templateCreators),
	settings: many(settings),
}));

export const workspaceNotificationSubscriptionRelations = relations(workspaceNotificationSubscription, ({one, many}) => ({
	workspace: one(workspace, {
		fields: [workspaceNotificationSubscription.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [workspaceNotificationSubscription.createdBy],
		references: [user.id]
	}),
	workspaceNotificationDeliveries: many(workspaceNotificationDelivery),
}));

export const workspaceRelations = relations(workspace, ({one, many}) => ({
	workspaceNotificationSubscriptions: many(workspaceNotificationSubscription),
	usageLogs: many(usageLog),
	workspaceByokKeys: many(workspaceByokKeys),
	agentProfiles: many(agentProfile),
	workspaceDatabases: many(workspaceDatabase),
	memories: many(memory),
	knowledgeBases: many(knowledgeBase),
	workflowFolders: many(workflowFolder),
	workflowExecutionLogs: many(workflowExecutionLogs),
	workspaceEnvironments: many(workspaceEnvironment),
	workspaceInvitations: many(workspaceInvitation),
	mcpServers: many(mcpServers),
	workflows: many(workflow),
	apiKeys: many(apiKey),
	workspaceFiles_workspaceId: many(workspaceFile),
	user_ownerId: one(user, {
		fields: [workspace.ownerId],
		references: [user.id],
		relationName: "workspace_ownerId_user_id"
	}),
	user_billedAccountUserId: one(user, {
		fields: [workspace.billedAccountUserId],
		references: [user.id],
		relationName: "workspace_billedAccountUserId_user_id"
	}),
	workspaceFiles_workspaceId: many(workspaceFiles),
	customTools: many(customTools),
}));

export const workspaceNotificationDeliveryRelations = relations(workspaceNotificationDelivery, ({one}) => ({
	workspaceNotificationSubscription: one(workspaceNotificationSubscription, {
		fields: [workspaceNotificationDelivery.subscriptionId],
		references: [workspaceNotificationSubscription.id]
	}),
	workflow: one(workflow, {
		fields: [workspaceNotificationDelivery.workflowId],
		references: [workflow.id]
	}),
}));

export const workflowRelations = relations(workflow, ({one, many}) => ({
	workspaceNotificationDeliveries: many(workspaceNotificationDelivery),
	usageLogs: many(usageLog),
	chats: many(chat),
	workflowEdges: many(workflowEdges),
	workflowSubflows: many(workflowSubflows),
	workflowExecutionSnapshots: many(workflowExecutionSnapshots),
	webhooks: many(webhook),
	workflowCheckpoints: many(workflowCheckpoints),
	workflowBlocks: many(workflowBlocks),
	copilotChats: many(copilotChats),
	workflowExecutionLogs: many(workflowExecutionLogs),
	user: one(user, {
		fields: [workflow.userId],
		references: [user.id]
	}),
	workspace: one(workspace, {
		fields: [workflow.workspaceId],
		references: [workspace.id]
	}),
	workflowFolder: one(workflowFolder, {
		fields: [workflow.folderId],
		references: [workflowFolder.id]
	}),
	workflowDeploymentVersions: many(workflowDeploymentVersion),
	pausedExecutions: many(pausedExecutions),
	templates: many(templates),
	workflowSchedules: many(workflowSchedule),
}));

export const documentRelations = relations(document, ({one, many}) => ({
	knowledgeBase: one(knowledgeBase, {
		fields: [document.knowledgeBaseId],
		references: [knowledgeBase.id]
	}),
	embeddings: many(embedding),
}));

export const knowledgeBaseRelations = relations(knowledgeBase, ({one, many}) => ({
	documents: many(document),
	user: one(user, {
		fields: [knowledgeBase.userId],
		references: [user.id]
	}),
	workspace: one(workspace, {
		fields: [knowledgeBase.workspaceId],
		references: [workspace.id]
	}),
	embeddings: many(embedding),
	knowledgeBaseTagDefinitions: many(knowledgeBaseTagDefinitions),
}));

export const environmentRelations = relations(environment, ({one}) => ({
	user: one(user, {
		fields: [environment.userId],
		references: [user.id]
	}),
}));

export const usageLogRelations = relations(usageLog, ({one}) => ({
	user: one(user, {
		fields: [usageLog.userId],
		references: [user.id]
	}),
	workspace: one(workspace, {
		fields: [usageLog.workspaceId],
		references: [workspace.id]
	}),
	workflow: one(workflow, {
		fields: [usageLog.workflowId],
		references: [workflow.id]
	}),
}));

export const workspaceByokKeysRelations = relations(workspaceByokKeys, ({one}) => ({
	workspace: one(workspace, {
		fields: [workspaceByokKeys.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [workspaceByokKeys.createdBy],
		references: [user.id]
	}),
}));

export const agentProfileRelations = relations(agentProfile, ({one}) => ({
	user: one(user, {
		fields: [agentProfile.userId],
		references: [user.id]
	}),
	workspace: one(workspace, {
		fields: [agentProfile.workspaceId],
		references: [workspace.id]
	}),
	browserProfile: one(browserProfile, {
		fields: [agentProfile.browserProfileId],
		references: [browserProfile.id]
	}),
}));

export const browserProfileRelations = relations(browserProfile, ({one, many}) => ({
	agentProfiles: many(agentProfile),
	user: one(user, {
		fields: [browserProfile.userId],
		references: [user.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [session.activeOrganizationId],
		references: [organization.id]
	}),
}));

export const organizationRelations = relations(organization, ({many}) => ({
	sessions: many(session),
	invitations: many(invitation),
	members: many(member),
	ssoProviders: many(ssoProvider),
}));

export const invitationRelations = relations(invitation, ({one}) => ({
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id]
	}),
}));

export const memberRelations = relations(member, ({one}) => ({
	user: one(user, {
		fields: [member.userId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id]
	}),
}));

export const chatRelations = relations(chat, ({one}) => ({
	workflow: one(workflow, {
		fields: [chat.workflowId],
		references: [workflow.id]
	}),
	user: one(user, {
		fields: [chat.userId],
		references: [user.id]
	}),
}));

export const userDbBudgetRelations = relations(userDbBudget, ({one}) => ({
	user: one(user, {
		fields: [userDbBudget.userId],
		references: [user.id]
	}),
}));

export const userGlobalDatabaseRelations = relations(userGlobalDatabase, ({one}) => ({
	user: one(user, {
		fields: [userGlobalDatabase.userId],
		references: [user.id]
	}),
}));

export const workspaceDatabaseRelations = relations(workspaceDatabase, ({one}) => ({
	workspace: one(workspace, {
		fields: [workspaceDatabase.workspaceId],
		references: [workspace.id]
	}),
}));

export const memoryRelations = relations(memory, ({one}) => ({
	workspace: one(workspace, {
		fields: [memory.workspaceId],
		references: [workspace.id]
	}),
}));

export const workflowFolderRelations = relations(workflowFolder, ({one, many}) => ({
	user: one(user, {
		fields: [workflowFolder.userId],
		references: [user.id]
	}),
	workspace: one(workspace, {
		fields: [workflowFolder.workspaceId],
		references: [workspace.id]
	}),
	workflowFolder: one(workflowFolder, {
		fields: [workflowFolder.parentId],
		references: [workflowFolder.id],
		relationName: "workflowFolder_parentId_workflowFolder_id"
	}),
	workflowFolders: many(workflowFolder, {
		relationName: "workflowFolder_parentId_workflowFolder_id"
	}),
	workflows: many(workflow),
}));

export const workflowEdgesRelations = relations(workflowEdges, ({one}) => ({
	workflow: one(workflow, {
		fields: [workflowEdges.workflowId],
		references: [workflow.id]
	}),
	workflowBlock_sourceBlockId: one(workflowBlocks, {
		fields: [workflowEdges.sourceBlockId],
		references: [workflowBlocks.id],
		relationName: "workflowEdges_sourceBlockId_workflowBlocks_id"
	}),
	workflowBlock_targetBlockId: one(workflowBlocks, {
		fields: [workflowEdges.targetBlockId],
		references: [workflowBlocks.id],
		relationName: "workflowEdges_targetBlockId_workflowBlocks_id"
	}),
}));

export const workflowBlocksRelations = relations(workflowBlocks, ({one, many}) => ({
	workflowEdges_sourceBlockId: many(workflowEdges, {
		relationName: "workflowEdges_sourceBlockId_workflowBlocks_id"
	}),
	workflowEdges_targetBlockId: many(workflowEdges, {
		relationName: "workflowEdges_targetBlockId_workflowBlocks_id"
	}),
	webhooks: many(webhook),
	workflow: one(workflow, {
		fields: [workflowBlocks.workflowId],
		references: [workflow.id]
	}),
	workflowSchedules: many(workflowSchedule),
}));

export const workflowSubflowsRelations = relations(workflowSubflows, ({one}) => ({
	workflow: one(workflow, {
		fields: [workflowSubflows.workflowId],
		references: [workflow.id]
	}),
}));

export const permissionsRelations = relations(permissions, ({one}) => ({
	user: one(user, {
		fields: [permissions.userId],
		references: [user.id]
	}),
}));

export const workflowExecutionSnapshotsRelations = relations(workflowExecutionSnapshots, ({one, many}) => ({
	workflow: one(workflow, {
		fields: [workflowExecutionSnapshots.workflowId],
		references: [workflow.id]
	}),
	workflowExecutionLogs: many(workflowExecutionLogs),
}));

export const embeddingRelations = relations(embedding, ({one}) => ({
	knowledgeBase: one(knowledgeBase, {
		fields: [embedding.knowledgeBaseId],
		references: [knowledgeBase.id]
	}),
	document: one(document, {
		fields: [embedding.documentId],
		references: [document.id]
	}),
}));

export const templateStarsRelations = relations(templateStars, ({one}) => ({
	user: one(user, {
		fields: [templateStars.userId],
		references: [user.id]
	}),
	template: one(templates, {
		fields: [templateStars.templateId],
		references: [templates.id]
	}),
}));

export const templatesRelations = relations(templates, ({one, many}) => ({
	templateStars: many(templateStars),
	templateCreator: one(templateCreators, {
		fields: [templates.creatorId],
		references: [templateCreators.id]
	}),
	workflow: one(workflow, {
		fields: [templates.workflowId],
		references: [workflow.id]
	}),
}));

export const webhookRelations = relations(webhook, ({one}) => ({
	workflow: one(workflow, {
		fields: [webhook.workflowId],
		references: [workflow.id]
	}),
	workflowBlock: one(workflowBlocks, {
		fields: [webhook.blockId],
		references: [workflowBlocks.id]
	}),
}));

export const knowledgeBaseTagDefinitionsRelations = relations(knowledgeBaseTagDefinitions, ({one}) => ({
	knowledgeBase: one(knowledgeBase, {
		fields: [knowledgeBaseTagDefinitions.knowledgeBaseId],
		references: [knowledgeBase.id]
	}),
}));

export const workflowCheckpointsRelations = relations(workflowCheckpoints, ({one}) => ({
	user: one(user, {
		fields: [workflowCheckpoints.userId],
		references: [user.id]
	}),
	workflow: one(workflow, {
		fields: [workflowCheckpoints.workflowId],
		references: [workflow.id]
	}),
	copilotChat: one(copilotChats, {
		fields: [workflowCheckpoints.chatId],
		references: [copilotChats.id]
	}),
}));

export const copilotChatsRelations = relations(copilotChats, ({one, many}) => ({
	workflowCheckpoints: many(workflowCheckpoints),
	copilotFeedbacks: many(copilotFeedback),
	user: one(user, {
		fields: [copilotChats.userId],
		references: [user.id]
	}),
	workflow: one(workflow, {
		fields: [copilotChats.workflowId],
		references: [workflow.id]
	}),
}));

export const copilotFeedbackRelations = relations(copilotFeedback, ({one}) => ({
	user: one(user, {
		fields: [copilotFeedback.userId],
		references: [user.id]
	}),
	copilotChat: one(copilotChats, {
		fields: [copilotFeedback.chatId],
		references: [copilotChats.id]
	}),
}));

export const workflowExecutionLogsRelations = relations(workflowExecutionLogs, ({one}) => ({
	workflow: one(workflow, {
		fields: [workflowExecutionLogs.workflowId],
		references: [workflow.id]
	}),
	workflowExecutionSnapshot: one(workflowExecutionSnapshots, {
		fields: [workflowExecutionLogs.stateSnapshotId],
		references: [workflowExecutionSnapshots.id]
	}),
	workflowDeploymentVersion: one(workflowDeploymentVersion, {
		fields: [workflowExecutionLogs.deploymentVersionId],
		references: [workflowDeploymentVersion.id]
	}),
	workspace: one(workspace, {
		fields: [workflowExecutionLogs.workspaceId],
		references: [workspace.id]
	}),
}));

export const workflowDeploymentVersionRelations = relations(workflowDeploymentVersion, ({one, many}) => ({
	workflowExecutionLogs: many(workflowExecutionLogs),
	workflow: one(workflow, {
		fields: [workflowDeploymentVersion.workflowId],
		references: [workflow.id]
	}),
}));

export const workspaceEnvironmentRelations = relations(workspaceEnvironment, ({one}) => ({
	workspace: one(workspace, {
		fields: [workspaceEnvironment.workspaceId],
		references: [workspace.id]
	}),
}));

export const workspaceInvitationRelations = relations(workspaceInvitation, ({one}) => ({
	workspace: one(workspace, {
		fields: [workspaceInvitation.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [workspaceInvitation.inviterId],
		references: [user.id]
	}),
}));

export const mcpServersRelations = relations(mcpServers, ({one}) => ({
	workspace: one(workspace, {
		fields: [mcpServers.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [mcpServers.createdBy],
		references: [user.id]
	}),
}));

export const apiKeyRelations = relations(apiKey, ({one}) => ({
	user_userId: one(user, {
		fields: [apiKey.userId],
		references: [user.id],
		relationName: "apiKey_userId_user_id"
	}),
	workspace: one(workspace, {
		fields: [apiKey.workspaceId],
		references: [workspace.id]
	}),
	user_createdBy: one(user, {
		fields: [apiKey.createdBy],
		references: [user.id],
		relationName: "apiKey_createdBy_user_id"
	}),
}));

export const ssoProviderRelations = relations(ssoProvider, ({one}) => ({
	user: one(user, {
		fields: [ssoProvider.userId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [ssoProvider.organizationId],
		references: [organization.id]
	}),
}));

export const workspaceFileRelations = relations(workspaceFile, ({one}) => ({
	workspace: one(workspace, {
		fields: [workspaceFile.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [workspaceFile.uploadedBy],
		references: [user.id]
	}),
}));

export const workspaceFilesRelations = relations(workspaceFiles, ({one}) => ({
	user: one(user, {
		fields: [workspaceFiles.userId],
		references: [user.id]
	}),
	workspace: one(workspace, {
		fields: [workspaceFiles.workspaceId],
		references: [workspace.id]
	}),
}));

export const userStatsRelations = relations(userStats, ({one}) => ({
	user: one(user, {
		fields: [userStats.userId],
		references: [user.id]
	}),
}));

export const customToolsRelations = relations(customTools, ({one}) => ({
	workspace: one(workspace, {
		fields: [customTools.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [customTools.userId],
		references: [user.id]
	}),
}));

export const pausedExecutionsRelations = relations(pausedExecutions, ({one, many}) => ({
	workflow: one(workflow, {
		fields: [pausedExecutions.workflowId],
		references: [workflow.id]
	}),
	resumeQueues: many(resumeQueue),
}));

export const resumeQueueRelations = relations(resumeQueue, ({one}) => ({
	pausedExecution: one(pausedExecutions, {
		fields: [resumeQueue.pausedExecutionId],
		references: [pausedExecutions.id]
	}),
}));

export const templateCreatorsRelations = relations(templateCreators, ({one, many}) => ({
	user: one(user, {
		fields: [templateCreators.createdBy],
		references: [user.id]
	}),
	templates: many(templates),
}));

export const workflowScheduleRelations = relations(workflowSchedule, ({one}) => ({
	workflow: one(workflow, {
		fields: [workflowSchedule.workflowId],
		references: [workflow.id]
	}),
	workflowBlock: one(workflowBlocks, {
		fields: [workflowSchedule.blockId],
		references: [workflowBlocks.id]
	}),
}));

export const settingsRelations = relations(settings, ({one}) => ({
	user: one(user, {
		fields: [settings.userId],
		references: [user.id]
	}),
}));