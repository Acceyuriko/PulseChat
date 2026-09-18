import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import type { UserDTO, MessageDTO, ConversationDTO, ConversationMemberDTO, QuoteSnapshotDTO } from '../graphql/mappers.js';
import type { GraphQLContext } from '../graphql/context.js';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** An ISO-8601 timestamp on the wire, a JavaScript `Date` on the server. */
  DateTime: { input: Date; output: Date; }
};

export type Conversation = {
  __typename?: 'Conversation';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  kind: ConversationKind;
  /**
   * Timestamp of the newest live message, falling back to `createdAt` for an empty
   * conversation. This — not `updatedAt` — is the sort key for the list.
   */
  lastActivityAt: Scalars['DateTime']['output'];
  /** Newest message that has not been deleted. Null when every message is gone. */
  lastMessage?: Maybe<Message>;
  members: Array<ConversationMember>;
  /** Present for `CHANNEL`, null for `DM`. */
  title?: Maybe<Scalars['String']['output']>;
  /** Viewer-scoped: messages newer than this member's `lastReadAt`, from anyone else. */
  unreadCount: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/**
 * What kind of conversation this is.
 *
 * `CHANNEL` is a named, possibly multi-member room (`title` is present).
 * `DM` is a direct exchange between exactly two members (`title` is null; the client
 * labels it with the other member's display name).
 *
 * A dedicated field rather than inferring from the member count: a two-member channel
 * would otherwise be indistinguishable from a DM, and that heuristic would leak into
 * every component that renders a row.
 */
export type ConversationKind =
  | 'CHANNEL'
  | 'DM';

/**
 * One member of a conversation, together with that member's own read cursor.
 *
 * The cursor is what makes the unread count derivable instead of stored: there is no
 * counter to drift out of sync, and no write amplification on every message.
 */
export type ConversationMember = {
  __typename?: 'ConversationMember';
  lastReadAt?: Maybe<Scalars['DateTime']['output']>;
  user: User;
};

export type DeleteMessagePayload = {
  __typename?: 'DeleteMessagePayload';
  conversation: Conversation;
  conversationId: Scalars['ID']['output'];
  /** Id of the message that was deleted, so the client can address it without a refetch. */
  messageId: Scalars['ID']['output'];
};

export type MarkConversationReadPayload = {
  __typename?: 'MarkConversationReadPayload';
  conversation: Conversation;
  /** The count after the cursor moved. Always 0 on success; returned so the client can assert it. */
  unreadCount: Scalars['Int']['output'];
};

export type Message = {
  __typename?: 'Message';
  /** Markdown-subset source, not opaque text. Rendered by parsing to nodes, never injected as HTML. */
  body: Scalars['String']['output'];
  conversationId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  /** Set on soft delete. A deleted message stays addressable so a reply to it still resolves. */
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  /** Derived by parsing `body`, never stored a second time — one source of truth for who was mentioned. */
  mentions: Array<User>;
  replyTo?: Maybe<QuoteSnapshot>;
  sender: User;
};

/**
 * Declared here, empty, purely so domain files can `extend` it.
 *
 * GraphQL requires the base type to exist before anything extends it — `extend type Mutation`
 * without a `Mutation` declaration is an SDL validation error at schema build time, not at query
 * time, so the process refuses to boot.
 */
export type Mutation = {
  __typename?: 'Mutation';
  /** Soft delete. Restricted to the sender; fails with `FORBIDDEN` otherwise. */
  deleteMessage: DeleteMessagePayload;
  /** Advances the caller's read cursor to now and returns the resulting conversation view. */
  markConversationRead: MarkConversationReadPayload;
  sendMessage: SendMessagePayload;
};


/**
 * Declared here, empty, purely so domain files can `extend` it.
 *
 * GraphQL requires the base type to exist before anything extends it — `extend type Mutation`
 * without a `Mutation` declaration is an SDL validation error at schema build time, not at query
 * time, so the process refuses to boot.
 */
export type MutationDeleteMessageArgs = {
  id: Scalars['ID']['input'];
};


/**
 * Declared here, empty, purely so domain files can `extend` it.
 *
 * GraphQL requires the base type to exist before anything extends it — `extend type Mutation`
 * without a `Mutation` declaration is an SDL validation error at schema build time, not at query
 * time, so the process refuses to boot.
 */
export type MutationMarkConversationReadArgs = {
  conversationId: Scalars['ID']['input'];
};


/**
 * Declared here, empty, purely so domain files can `extend` it.
 *
 * GraphQL requires the base type to exist before anything extends it — `extend type Mutation`
 * without a `Mutation` declaration is an SDL validation error at schema build time, not at query
 * time, so the process refuses to boot.
 */
export type MutationSendMessageArgs = {
  input: SendMessageInput;
};

export type Query = {
  __typename?: 'Query';
  /** Null when the conversation does not exist, or when the caller is not a member. */
  conversation?: Maybe<Conversation>;
  /** Conversations the current user takes part in, most recently active first. */
  conversations: Array<Conversation>;
  /** Liveness probe for the GraphQL layer itself. */
  health: Scalars['String']['output'];
  /**
   * The user behind the current request identity.
   * Fails with error code `UNAUTHENTICATED` when no identity was supplied.
   */
  me: User;
  /**
   * Messages of a conversation, newest first. Callers must be members.
   * Soft-deleted messages are returned (so quotes and ids stay resolvable) with
   * `deletedAt` set; the client renders a placeholder for them.
   */
  messages: Array<Message>;
  /** Every seeded user. Feeds the frontend identity switcher. */
  users: Array<User>;
};


export type QueryConversationArgs = {
  id: Scalars['ID']['input'];
};


export type QueryMessagesArgs = {
  conversationId: Scalars['ID']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};

/**
 * A frozen copy of the message a reply points at, taken when the reply is sent.
 *
 * Deliberately a snapshot rather than a join: the read path needs no second query, the
 * card stays renderable after the quoted message is deleted, and the excerpt cannot
 * change under the reader. It never contains a nested `replyTo`, so quote depth is
 * always exactly one.
 */
export type QuoteSnapshot = {
  __typename?: 'QuoteSnapshot';
  bodyExcerpt: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  messageId: Scalars['ID']['output'];
  senderDisplayName: Scalars['String']['output'];
  senderId: Scalars['ID']['output'];
};

/** Freezes the quote snapshot from the referenced message. */
export type SendMessageInput = {
  body: Scalars['String']['input'];
  conversationId: Scalars['ID']['input'];
  /**
   * Id of the message being quoted. The server reads it, copies what it needs into a
   * snapshot, and rejects the send when the target is missing or deleted.
   */
  replyToMessageId?: InputMaybe<Scalars['ID']['input']>;
};

export type SendMessagePayload = {
  __typename?: 'SendMessagePayload';
  /** The conversation in the sender's own view, so the client does not have to guess at ordering. */
  conversation: Conversation;
  message: Message;
};

export type User = {
  __typename?: 'User';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  displayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Job title shown as the mention dropdown subtitle, e.g. `CTO@Apple`. Null when unknown. */
  title?: Maybe<Scalars['String']['output']>;
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Conversation: ResolverTypeWrapper<ConversationDTO>;
  ConversationKind: ConversationKind;
  ConversationMember: ResolverTypeWrapper<ConversationMemberDTO>;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  DeleteMessagePayload: ResolverTypeWrapper<Omit<DeleteMessagePayload, 'conversation'> & { conversation: ResolversTypes['Conversation'] }>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  MarkConversationReadPayload: ResolverTypeWrapper<Omit<MarkConversationReadPayload, 'conversation'> & { conversation: ResolversTypes['Conversation'] }>;
  Message: ResolverTypeWrapper<MessageDTO>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  QuoteSnapshot: ResolverTypeWrapper<QuoteSnapshotDTO>;
  SendMessageInput: SendMessageInput;
  SendMessagePayload: ResolverTypeWrapper<Omit<SendMessagePayload, 'conversation' | 'message'> & { conversation: ResolversTypes['Conversation'], message: ResolversTypes['Message'] }>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  User: ResolverTypeWrapper<UserDTO>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Boolean: Scalars['Boolean']['output'];
  Conversation: ConversationDTO;
  ConversationMember: ConversationMemberDTO;
  DateTime: Scalars['DateTime']['output'];
  DeleteMessagePayload: Omit<DeleteMessagePayload, 'conversation'> & { conversation: ResolversParentTypes['Conversation'] };
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  MarkConversationReadPayload: Omit<MarkConversationReadPayload, 'conversation'> & { conversation: ResolversParentTypes['Conversation'] };
  Message: MessageDTO;
  Mutation: Record<PropertyKey, never>;
  Query: Record<PropertyKey, never>;
  QuoteSnapshot: QuoteSnapshotDTO;
  SendMessageInput: SendMessageInput;
  SendMessagePayload: Omit<SendMessagePayload, 'conversation' | 'message'> & { conversation: ResolversParentTypes['Conversation'], message: ResolversParentTypes['Message'] };
  String: Scalars['String']['output'];
  User: UserDTO;
};

export type ConversationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Conversation'] = ResolversParentTypes['Conversation']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  kind?: Resolver<ResolversTypes['ConversationKind'], ParentType, ContextType>;
  lastActivityAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  lastMessage?: Resolver<Maybe<ResolversTypes['Message']>, ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['ConversationMember']>, ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  unreadCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type ConversationMemberResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ConversationMember'] = ResolversParentTypes['ConversationMember']> = {
  lastReadAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type DeleteMessagePayloadResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['DeleteMessagePayload'] = ResolversParentTypes['DeleteMessagePayload']> = {
  conversation?: Resolver<ResolversTypes['Conversation'], ParentType, ContextType>;
  conversationId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  messageId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type MarkConversationReadPayloadResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['MarkConversationReadPayload'] = ResolversParentTypes['MarkConversationReadPayload']> = {
  conversation?: Resolver<ResolversTypes['Conversation'], ParentType, ContextType>;
  unreadCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type MessageResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Message'] = ResolversParentTypes['Message']> = {
  body?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  conversationId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  deletedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  mentions?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType>;
  replyTo?: Resolver<Maybe<ResolversTypes['QuoteSnapshot']>, ParentType, ContextType>;
  sender?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  deleteMessage?: Resolver<ResolversTypes['DeleteMessagePayload'], ParentType, ContextType, RequireFields<MutationDeleteMessageArgs, 'id'>>;
  markConversationRead?: Resolver<ResolversTypes['MarkConversationReadPayload'], ParentType, ContextType, RequireFields<MutationMarkConversationReadArgs, 'conversationId'>>;
  sendMessage?: Resolver<ResolversTypes['SendMessagePayload'], ParentType, ContextType, RequireFields<MutationSendMessageArgs, 'input'>>;
};

export type QueryResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  conversation?: Resolver<Maybe<ResolversTypes['Conversation']>, ParentType, ContextType, RequireFields<QueryConversationArgs, 'id'>>;
  conversations?: Resolver<Array<ResolversTypes['Conversation']>, ParentType, ContextType>;
  health?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  me?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  messages?: Resolver<Array<ResolversTypes['Message']>, ParentType, ContextType, RequireFields<QueryMessagesArgs, 'conversationId' | 'limit'>>;
  users?: Resolver<Array<ResolversTypes['User']>, ParentType, ContextType>;
};

export type QuoteSnapshotResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['QuoteSnapshot'] = ResolversParentTypes['QuoteSnapshot']> = {
  bodyExcerpt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  messageId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  senderDisplayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  senderId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type SendMessagePayloadResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['SendMessagePayload'] = ResolversParentTypes['SendMessagePayload']> = {
  conversation?: Resolver<ResolversTypes['Conversation'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['Message'], ParentType, ContextType>;
};

export type UserResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  displayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type Resolvers<ContextType = GraphQLContext> = {
  Conversation?: ConversationResolvers<ContextType>;
  ConversationMember?: ConversationMemberResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  DeleteMessagePayload?: DeleteMessagePayloadResolvers<ContextType>;
  MarkConversationReadPayload?: MarkConversationReadPayloadResolvers<ContextType>;
  Message?: MessageResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  QuoteSnapshot?: QuoteSnapshotResolvers<ContextType>;
  SendMessagePayload?: SendMessagePayloadResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
};

