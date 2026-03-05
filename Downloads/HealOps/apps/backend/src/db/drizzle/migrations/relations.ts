import { relations } from "drizzle-orm/relations";
import { users, refreshTokens, apiKeys, mfaSettings, oauthAccounts, media, notifications, deviceTokens, documents, documentChunks, conversations, messages, webhooks, webhookDeliveries, ciHealingRuns, ciHealingAttempts, ciHealingEvents, repositories, repositorySettings, branches, commits, pipelineRuns, webhookEvents, organizations, ciProviderConfigs, failures, jobs, fixRequests, attempts, errorTypes, flakyFailureRegistry, patches, validations, pullRequests, escalations, vectorMemory, slackNotifications, costTracking, jobCooldowns, subscriptions, plans, usageRecords, notificationSettings, invoices, organizationMembers, organizationInvitations, onboardingProgress, dashboardSnapshots, roles, rolePermissions, permissions, userRoles } from "./schema";

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
	notificationSettings: many(notificationSettings),
	organizationMembers_userId: many(organizationMembers, {
		relationName: "organizationMembers_userId_users_id"
	}),
	organizationMembers_invitedBy: many(organizationMembers, {
		relationName: "organizationMembers_invitedBy_users_id"
	}),
	organizationInvitations: many(organizationInvitations),
	onboardingProgresses: many(onboardingProgress),
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

export const ciHealingAttemptsRelations = relations(ciHealingAttempts, ({one}) => ({
	ciHealingRun: one(ciHealingRuns, {
		fields: [ciHealingAttempts.runId],
		references: [ciHealingRuns.id]
	}),
}));

export const ciHealingRunsRelations = relations(ciHealingRuns, ({many}) => ({
	ciHealingAttempts: many(ciHealingAttempts),
	ciHealingEvents: many(ciHealingEvents),
}));

export const ciHealingEventsRelations = relations(ciHealingEvents, ({one}) => ({
	ciHealingRun: one(ciHealingRuns, {
		fields: [ciHealingEvents.runId],
		references: [ciHealingRuns.id]
	}),
}));

export const repositorySettingsRelations = relations(repositorySettings, ({one}) => ({
	repository: one(repositories, {
		fields: [repositorySettings.repositoryId],
		references: [repositories.id]
	}),
}));

export const repositoriesRelations = relations(repositories, ({one, many}) => ({
	repositorySettings: many(repositorySettings),
	branches: many(branches),
	commits: many(commits),
	webhookEvents: many(webhookEvents),
	organization: one(organizations, {
		fields: [repositories.organizationId],
		references: [organizations.id]
	}),
	ciProviderConfig: one(ciProviderConfigs, {
		fields: [repositories.ciProviderConfigId],
		references: [ciProviderConfigs.id]
	}),
	flakyFailureRegistries: many(flakyFailureRegistry),
	vectorMemories: many(vectorMemory),
	costTrackings: many(costTracking),
	jobCooldowns: many(jobCooldowns),
	dashboardSnapshots: many(dashboardSnapshots),
}));

export const branchesRelations = relations(branches, ({one, many}) => ({
	repository: one(repositories, {
		fields: [branches.repositoryId],
		references: [repositories.id]
	}),
	commits: many(commits),
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
	attempts: many(attempts),
	failures: many(failures),
}));

export const commitsRelations = relations(commits, ({one, many}) => ({
	pipelineRuns: many(pipelineRuns),
	repository: one(repositories, {
		fields: [commits.repositoryId],
		references: [repositories.id]
	}),
	branch: one(branches, {
		fields: [commits.branchId],
		references: [branches.id]
	}),
}));

export const webhookEventsRelations = relations(webhookEvents, ({one, many}) => ({
	pipelineRuns: many(pipelineRuns),
	repository: one(repositories, {
		fields: [webhookEvents.repositoryId],
		references: [repositories.id]
	}),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	repositories: many(repositories),
	costTrackings: many(costTracking),
	ciProviderConfigs: many(ciProviderConfigs),
	subscriptions: many(subscriptions),
	usageRecords: many(usageRecords),
	notificationSettings: many(notificationSettings),
	invoices: many(invoices),
	organizationMembers: many(organizationMembers),
	organizationInvitations: many(organizationInvitations),
	onboardingProgresses: many(onboardingProgress),
	dashboardSnapshots: many(dashboardSnapshots),
}));

export const ciProviderConfigsRelations = relations(ciProviderConfigs, ({one, many}) => ({
	repositories: many(repositories),
	organization: one(organizations, {
		fields: [ciProviderConfigs.organizationId],
		references: [organizations.id]
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

export const failuresRelations = relations(failures, ({one, many}) => ({
	jobs: many(jobs),
	pipelineRun: one(pipelineRuns, {
		fields: [failures.pipelineRunId],
		references: [pipelineRuns.id]
	}),
	errorType: one(errorTypes, {
		fields: [failures.errorTypeId],
		references: [errorTypes.id]
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

export const errorTypesRelations = relations(errorTypes, ({many}) => ({
	failures: many(failures),
}));

export const flakyFailureRegistryRelations = relations(flakyFailureRegistry, ({one}) => ({
	repository: one(repositories, {
		fields: [flakyFailureRegistry.repositoryId],
		references: [repositories.id]
	}),
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

export const subscriptionsRelations = relations(subscriptions, ({one, many}) => ({
	organization: one(organizations, {
		fields: [subscriptions.organizationId],
		references: [organizations.id]
	}),
	plan: one(plans, {
		fields: [subscriptions.planId],
		references: [plans.id]
	}),
	usageRecords: many(usageRecords),
}));

export const plansRelations = relations(plans, ({many}) => ({
	subscriptions: many(subscriptions),
}));

export const usageRecordsRelations = relations(usageRecords, ({one}) => ({
	organization: one(organizations, {
		fields: [usageRecords.organizationId],
		references: [organizations.id]
	}),
	subscription: one(subscriptions, {
		fields: [usageRecords.subscriptionId],
		references: [subscriptions.id]
	}),
}));

export const notificationSettingsRelations = relations(notificationSettings, ({one}) => ({
	organization: one(organizations, {
		fields: [notificationSettings.organizationId],
		references: [organizations.id]
	}),
	user: one(users, {
		fields: [notificationSettings.userId],
		references: [users.id]
	}),
}));

export const invoicesRelations = relations(invoices, ({one}) => ({
	organization: one(organizations, {
		fields: [invoices.organizationId],
		references: [organizations.id]
	}),
}));

export const organizationMembersRelations = relations(organizationMembers, ({one}) => ({
	organization: one(organizations, {
		fields: [organizationMembers.organizationId],
		references: [organizations.id]
	}),
	user_userId: one(users, {
		fields: [organizationMembers.userId],
		references: [users.id],
		relationName: "organizationMembers_userId_users_id"
	}),
	user_invitedBy: one(users, {
		fields: [organizationMembers.invitedBy],
		references: [users.id],
		relationName: "organizationMembers_invitedBy_users_id"
	}),
}));

export const organizationInvitationsRelations = relations(organizationInvitations, ({one}) => ({
	organization: one(organizations, {
		fields: [organizationInvitations.organizationId],
		references: [organizations.id]
	}),
	user: one(users, {
		fields: [organizationInvitations.invitedBy],
		references: [users.id]
	}),
}));

export const onboardingProgressRelations = relations(onboardingProgress, ({one}) => ({
	organization: one(organizations, {
		fields: [onboardingProgress.organizationId],
		references: [organizations.id]
	}),
	user: one(users, {
		fields: [onboardingProgress.userId],
		references: [users.id]
	}),
}));

export const dashboardSnapshotsRelations = relations(dashboardSnapshots, ({one}) => ({
	organization: one(organizations, {
		fields: [dashboardSnapshots.organizationId],
		references: [organizations.id]
	}),
	repository: one(repositories, {
		fields: [dashboardSnapshots.repositoryId],
		references: [repositories.id]
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