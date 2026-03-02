import { relations } from "drizzle-orm/relations";
import { users, refreshTokens, apiKeys, mfaSettings, oauthAccounts, media, notifications, deviceTokens, documents, documentChunks, conversations, messages, webhooks, webhookDeliveries, organizations, repositories, repositorySettings, branches, commits, pipelineRuns, webhookEvents, failures, errorTypes, flakyFailureRegistry, jobs, fixRequests, attempts, patches, validations, pullRequests, escalations, vectorMemory, slackNotifications, costTracking, jobCooldowns, roles, rolePermissions, permissions, userRoles } from "./schema";

export const refreshTokensRelations = relations(refreshTokens, ({one}) => ({
	user: one(users, {
		fields: [refreshTokens.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	refreshTokens: many(refreshTokens),
	apiKeys: many(apiKeys),
	mfaSettings: many(mfaSettings),
	oauthAccounts: many(oauthAccounts),
	media: many(media),
	notifications: many(notifications),
	deviceTokens: many(deviceTokens),
	conversations: many(conversations),
	webhooks: many(webhooks),
	userRoles: many(userRoles),
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
	user: one(users, {
		fields: [apiKeys.userId],
		references: [users.id]
	}),
}));

export const mfaSettingsRelations = relations(mfaSettings, ({one}) => ({
	user: one(users, {
		fields: [mfaSettings.userId],
		references: [users.id]
	}),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({one}) => ({
	user: one(users, {
		fields: [oauthAccounts.userId],
		references: [users.id]
	}),
}));

export const mediaRelations = relations(media, ({one}) => ({
	user: one(users, {
		fields: [media.userId],
		references: [users.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(users, {
		fields: [notifications.userId],
		references: [users.id]
	}),
}));

export const deviceTokensRelations = relations(deviceTokens, ({one}) => ({
	user: one(users, {
		fields: [deviceTokens.userId],
		references: [users.id]
	}),
}));

export const documentChunksRelations = relations(documentChunks, ({one}) => ({
	document: one(documents, {
		fields: [documentChunks.documentId],
		references: [documents.id]
	}),
}));

export const documentsRelations = relations(documents, ({many}) => ({
	documentChunks: many(documentChunks),
}));

export const conversationsRelations = relations(conversations, ({one, many}) => ({
	user: one(users, {
		fields: [conversations.userId],
		references: [users.id]
	}),
	messages: many(messages),
}));

export const messagesRelations = relations(messages, ({one}) => ({
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id]
	}),
}));

export const webhooksRelations = relations(webhooks, ({one, many}) => ({
	user: one(users, {
		fields: [webhooks.userId],
		references: [users.id]
	}),
	webhookDeliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({one}) => ({
	webhook: one(webhooks, {
		fields: [webhookDeliveries.webhookId],
		references: [webhooks.id]
	}),
}));

export const repositoriesRelations = relations(repositories, ({one, many}) => ({
	organization: one(organizations, {
		fields: [repositories.organizationId],
		references: [organizations.id]
	}),
	repositorySettings: many(repositorySettings),
	branches: many(branches),
	commits: many(commits),
	webhookEvents: many(webhookEvents),
	flakyFailureRegistries: many(flakyFailureRegistry),
	vectorMemories: many(vectorMemory),
	costTrackings: many(costTracking),
	jobCooldowns: many(jobCooldowns),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	repositories: many(repositories),
	costTrackings: many(costTracking),
}));

export const repositorySettingsRelations = relations(repositorySettings, ({one}) => ({
	repository: one(repositories, {
		fields: [repositorySettings.repositoryId],
		references: [repositories.id]
	}),
}));

export const branchesRelations = relations(branches, ({one, many}) => ({
	repository: one(repositories, {
		fields: [branches.repositoryId],
		references: [repositories.id]
	}),
	commits: many(commits),
}));

export const commitsRelations = relations(commits, ({one, many}) => ({
	repository: one(repositories, {
		fields: [commits.repositoryId],
		references: [repositories.id]
	}),
	branch: one(branches, {
		fields: [commits.branchId],
		references: [branches.id]
	}),
	pipelineRuns: many(pipelineRuns),
}));

export const pipelineRunsRelations = relations(pipelineRuns, ({one, many}) => ({
	commit: one(commits, {
		fields: [pipelineRuns.commitId],
		references: [commits.id]
	}),
	webhookEvent: one(webhookEvents, {
		fields: [pipelineRuns.webhookEventId],
		references: [webhookEvents.id]
	}),
	failures: many(failures),
	attempts: many(attempts),
}));

export const webhookEventsRelations = relations(webhookEvents, ({one, many}) => ({
	pipelineRuns: many(pipelineRuns),
	repository: one(repositories, {
		fields: [webhookEvents.repositoryId],
		references: [repositories.id]
	}),
}));

export const failuresRelations = relations(failures, ({one, many}) => ({
	pipelineRun: one(pipelineRuns, {
		fields: [failures.pipelineRunId],
		references: [pipelineRuns.id]
	}),
	errorType: one(errorTypes, {
		fields: [failures.errorTypeId],
		references: [errorTypes.id]
	}),
	jobs: many(jobs),
}));

export const errorTypesRelations = relations(errorTypes, ({many}) => ({
	failures: many(failures),
}));

export const flakyFailureRegistryRelations = relations(flakyFailureRegistry, ({one}) => ({
	repository: one(repositories, {
		fields: [flakyFailureRegistry.repositoryId],
		references: [repositories.id]
	}),
}));

export const jobsRelations = relations(jobs, ({one, many}) => ({
	failure: one(failures, {
		fields: [jobs.failureId],
		references: [failures.id]
	}),
	fixRequest: one(fixRequests, {
		fields: [jobs.fixRequestId],
		references: [fixRequests.id],
		relationName: "jobs_fixRequestId_fixRequests_id"
	}),
	attempts: many(attempts),
	pullRequests: many(pullRequests),
	escalations: many(escalations),
	vectorMemories: many(vectorMemory),
	slackNotifications: many(slackNotifications),
	jobCooldowns: many(jobCooldowns),
	fixRequests: many(fixRequests, {
		relationName: "fixRequests_jobId_jobs_id"
	}),
}));

export const fixRequestsRelations = relations(fixRequests, ({one, many}) => ({
	jobs: many(jobs, {
		relationName: "jobs_fixRequestId_fixRequests_id"
	}),
	job: one(jobs, {
		fields: [fixRequests.jobId],
		references: [jobs.id],
		relationName: "fixRequests_jobId_jobs_id"
	}),
}));

export const attemptsRelations = relations(attempts, ({one, many}) => ({
	job: one(jobs, {
		fields: [attempts.jobId],
		references: [jobs.id]
	}),
	pipelineRun: one(pipelineRuns, {
		fields: [attempts.validationRunId],
		references: [pipelineRuns.id]
	}),
	patches: many(patches),
	validations: many(validations),
}));

export const patchesRelations = relations(patches, ({one}) => ({
	attempt: one(attempts, {
		fields: [patches.attemptId],
		references: [attempts.id]
	}),
}));

export const validationsRelations = relations(validations, ({one}) => ({
	attempt: one(attempts, {
		fields: [validations.attemptId],
		references: [attempts.id]
	}),
}));

export const pullRequestsRelations = relations(pullRequests, ({one}) => ({
	job: one(jobs, {
		fields: [pullRequests.jobId],
		references: [jobs.id]
	}),
}));

export const escalationsRelations = relations(escalations, ({one}) => ({
	job: one(jobs, {
		fields: [escalations.jobId],
		references: [jobs.id]
	}),
}));

export const vectorMemoryRelations = relations(vectorMemory, ({one}) => ({
	repository: one(repositories, {
		fields: [vectorMemory.repositoryId],
		references: [repositories.id]
	}),
	job: one(jobs, {
		fields: [vectorMemory.jobId],
		references: [jobs.id]
	}),
}));

export const slackNotificationsRelations = relations(slackNotifications, ({one}) => ({
	job: one(jobs, {
		fields: [slackNotifications.jobId],
		references: [jobs.id]
	}),
}));

export const costTrackingRelations = relations(costTracking, ({one}) => ({
	organization: one(organizations, {
		fields: [costTracking.organizationId],
		references: [organizations.id]
	}),
	repository: one(repositories, {
		fields: [costTracking.repositoryId],
		references: [repositories.id]
	}),
}));

export const jobCooldownsRelations = relations(jobCooldowns, ({one}) => ({
	repository: one(repositories, {
		fields: [jobCooldowns.repositoryId],
		references: [repositories.id]
	}),
	job: one(jobs, {
		fields: [jobCooldowns.triggeredByJobId],
		references: [jobs.id]
	}),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({one}) => ({
	role: one(roles, {
		fields: [rolePermissions.roleId],
		references: [roles.id]
	}),
	permission: one(permissions, {
		fields: [rolePermissions.permissionId],
		references: [permissions.id]
	}),
}));

export const rolesRelations = relations(roles, ({many}) => ({
	rolePermissions: many(rolePermissions),
	userRoles: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({many}) => ({
	rolePermissions: many(rolePermissions),
}));

export const userRolesRelations = relations(userRoles, ({one}) => ({
	user: one(users, {
		fields: [userRoles.userId],
		references: [users.id]
	}),
	role: one(roles, {
		fields: [userRoles.roleId],
		references: [roles.id]
	}),
}));