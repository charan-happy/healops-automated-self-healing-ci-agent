import { CronJobName, QueueName } from '@bg/constants/job.constant';

export interface IEmailJob {
  email: string;
  customerName?: string;
}

export interface IOtpEmailJob extends IEmailJob {
  otp: number;
  passwordResetLink?: string;
  passwordSetLink?: string;
}

export interface IMediaUploadJob {
  file: Express.Multer.File;
  metadata?: Record<string, any>;
}

export interface ICronJob {
  jobType: CronJobName;
  data?: any;
  options?: {
    priority?: number;
    timestamp?: number;
  };
}

export interface INotificationJob {
  deviceTokens: string[];
  subject: string;
  message: string;
  url: string;
  data: Record<string, any>;
}

export interface INotificationTopicJob {
  topic: string;
  subject: string;
  message: string;
  url: string;
  data: Record<string, any>;
}

export interface ISendNotificationJob {
  user_ids: string[];
  subject: string;
  message: string;
  url: string;
  notification_type: string;
  data?: Record<string, any>;
}

export interface IWebhookDeliveryJob {
  webhookId: string;
  deliveryId: string;
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface IRepairJobData {
  jobId: string;
  failureId: string;
  repositoryId: string;
}

export interface ISlackNotificationJobData {
  jobId: string;
  type: string;
  message: string;
  channel?: string;
}

export interface IWebhookIngestJobData {
  webhookEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  repository: {
    id: string;
    organizationId: string;
    name: string;
    defaultBranch: string;
    primaryLanguage: string | null;
    githubInstallationId: string | null;
    provider?: string;
  };
  // Normalised webhook context (populated by CiWebhookService for non-GitHub providers)
  headBranch?: string;
  headSha?: string;
  externalRunId?: string;
  workflowName?: string;
}

export interface IDLQFailedJobData {
  originalQueueName: QueueName;
  originalJobId: string;
  originalJobName: string;
  originalJobData: any;
  failedReason: string;
  stacktrace?: string[];
  timestamp: number;
}