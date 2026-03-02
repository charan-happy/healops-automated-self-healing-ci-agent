/* tslint:disable */
/* eslint-disable */
/**
 * 
 * @export
 * @interface ChangePasswordDto
 */
export interface ChangePasswordDto {
    /**
     * Current password for verification
     * @type {string}
     * @memberof ChangePasswordDto
     */
    currentPassword: string;
    /**
     * New password (min 8 characters, must contain uppercase, lowercase, number, and special character)
     * @type {string}
     * @memberof ChangePasswordDto
     */
    newPassword: string;
}
/**
 * 
 * @export
 * @interface ChatRequestDto
 */
export interface ChatRequestDto {
    /**
     * The user message to send to the agent
     * @type {string}
     * @memberof ChatRequestDto
     */
    message: string;
    /**
     * Existing conversation ID to continue (null for new conversation)
     * @type {string}
     * @memberof ChatRequestDto
     */
    conversationId?: string;
    /**
     * AI model to use (default: gpt-4o)
     * @type {string}
     * @memberof ChatRequestDto
     */
    model?: string;
    /**
     * Custom system prompt for the agent
     * @type {string}
     * @memberof ChatRequestDto
     */
    systemPrompt?: string;
    /**
     * Temperature for response generation (0.0 to 2.0)
     * @type {number}
     * @memberof ChatRequestDto
     */
    temperature?: number;
    /**
     * Maximum number of agent turns (tool call iterations)
     * @type {number}
     * @memberof ChatRequestDto
     */
    maxTurns?: number;
}
/**
 * 
 * @export
 * @interface CreateWebhookDto
 */
export interface CreateWebhookDto {
    /**
     * The URL to send webhook events to
     * @type {string}
     * @memberof CreateWebhookDto
     */
    url: string;
    /**
     * List of events to subscribe to
     * @type {Array<string>}
     * @memberof CreateWebhookDto
     */
    events: Array<string>;
    /**
     * A human-readable description for this webhook
     * @type {string}
     * @memberof CreateWebhookDto
     */
    description?: string;
}
/**
 * 
 * @export
 * @interface LoginDto
 */
export interface LoginDto {
    /**
     * User email address
     * @type {string}
     * @memberof LoginDto
     */
    email: string;
    /**
     * User password
     * @type {string}
     * @memberof LoginDto
     */
    password: string;
}
/**
 * 
 * @export
 * @interface MfaVerifyDto
 */
export interface MfaVerifyDto {
    /**
     * MFA verification code
     * @type {string}
     * @memberof MfaVerifyDto
     */
    code: string;
    /**
     * Type of MFA being verified
     * @type {string}
     * @memberof MfaVerifyDto
     */
    type: MfaVerifyDtoTypeEnum;
}


/**
 * @export
 */
export const MfaVerifyDtoTypeEnum = {
    Totp: 'totp',
    Sms: 'sms'
} as const;
export type MfaVerifyDtoTypeEnum = typeof MfaVerifyDtoTypeEnum[keyof typeof MfaVerifyDtoTypeEnum];

/**
 * 
 * @export
 * @interface RefreshTokenDto
 */
export interface RefreshTokenDto {
    /**
     * JWT refresh token
     * @type {string}
     * @memberof RefreshTokenDto
     */
    refreshToken: string;
}
/**
 * 
 * @export
 * @interface RegisterDeviceTokenDto
 */
export interface RegisterDeviceTokenDto {
    /**
     * Device push notification token
     * @type {string}
     * @memberof RegisterDeviceTokenDto
     */
    token: string;
    /**
     * Device platform
     * @type {string}
     * @memberof RegisterDeviceTokenDto
     */
    platform: RegisterDeviceTokenDtoPlatformEnum;
}


/**
 * @export
 */
export const RegisterDeviceTokenDtoPlatformEnum = {
    Ios: 'ios',
    Android: 'android',
    Web: 'web'
} as const;
export type RegisterDeviceTokenDtoPlatformEnum = typeof RegisterDeviceTokenDtoPlatformEnum[keyof typeof RegisterDeviceTokenDtoPlatformEnum];

/**
 * 
 * @export
 * @interface RegisterDto
 */
export interface RegisterDto {
    /**
     * User email address
     * @type {string}
     * @memberof RegisterDto
     */
    email: string;
    /**
     * User password (min 8 characters, must contain uppercase, lowercase, number, and special character)
     * @type {string}
     * @memberof RegisterDto
     */
    password: string;
    /**
     * User first name
     * @type {string}
     * @memberof RegisterDto
     */
    firstName: string;
    /**
     * User last name
     * @type {string}
     * @memberof RegisterDto
     */
    lastName: string;
}
/**
 * 
 * @export
 * @interface SendNotificationDto
 */
export interface SendNotificationDto {
    /**
     * Notification title
     * @type {string}
     * @memberof SendNotificationDto
     */
    title: string;
    /**
     * Notification body text
     * @type {string}
     * @memberof SendNotificationDto
     */
    body: string;
    /**
     * Notification type for categorization
     * @type {string}
     * @memberof SendNotificationDto
     */
    type: string;
    /**
     * Delivery channel for the notification
     * @type {string}
     * @memberof SendNotificationDto
     */
    channel: SendNotificationDtoChannelEnum;
    /**
     * Additional data payload for the notification
     * @type {object}
     * @memberof SendNotificationDto
     */
    data?: object;
}


/**
 * @export
 */
export const SendNotificationDtoChannelEnum = {
    Push: 'push',
    Email: 'email',
    Sms: 'sms',
    InApp: 'in-app'
} as const;
export type SendNotificationDtoChannelEnum = typeof SendNotificationDtoChannelEnum[keyof typeof SendNotificationDtoChannelEnum];

/**
 * 
 * @export
 * @interface UpdateUserDto
 */
export interface UpdateUserDto {
    /**
     * User first name
     * @type {string}
     * @memberof UpdateUserDto
     */
    firstName?: string;
    /**
     * User last name
     * @type {string}
     * @memberof UpdateUserDto
     */
    lastName?: string;
    /**
     * User phone number
     * @type {string}
     * @memberof UpdateUserDto
     */
    phone?: string;
}
/**
 * 
 * @export
 * @interface UpdateWebhookDto
 */
export interface UpdateWebhookDto {
    /**
     * The URL to send webhook events to
     * @type {string}
     * @memberof UpdateWebhookDto
     */
    url?: string;
    /**
     * List of events to subscribe to
     * @type {Array<string>}
     * @memberof UpdateWebhookDto
     */
    events?: Array<string>;
    /**
     * Whether the webhook is active
     * @type {boolean}
     * @memberof UpdateWebhookDto
     */
    isActive?: boolean;
    /**
     * A human-readable description for this webhook
     * @type {string}
     * @memberof UpdateWebhookDto
     */
    description?: string;
}
