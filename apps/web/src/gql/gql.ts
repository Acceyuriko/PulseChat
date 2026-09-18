/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  fragment ConversationFields on Conversation {\n    __typename\n    id\n    kind\n    title\n    members {\n      __typename\n      user {\n        __typename\n        id\n        displayName\n        avatarUrl\n        title\n      }\n      lastReadAt\n    }\n    unreadCount\n    lastActivityAt\n    lastMessage {\n      __typename\n      id\n      body\n      sender {\n        __typename\n        id\n        displayName\n        avatarUrl\n      }\n      createdAt\n      deletedAt\n    }\n  }\n": typeof types.ConversationFieldsFragmentDoc,
    "\n  query Conversations {\n    conversations {\n      ...ConversationFields\n    }\n  }\n": typeof types.ConversationsDocument,
    "\n  query Conversation($id: ID!) {\n    conversation(id: $id) {\n      ...ConversationFields\n    }\n  }\n": typeof types.ConversationDocument,
    "\n  fragment MessageFields on Message {\n    __typename\n    id\n    conversationId\n    body\n    sender {\n      __typename\n      id\n      displayName\n      avatarUrl\n      title\n    }\n    replyTo {\n      __typename\n      messageId\n      senderId\n      senderDisplayName\n      bodyExcerpt\n      createdAt\n    }\n    createdAt\n    deletedAt\n  }\n": typeof types.MessageFieldsFragmentDoc,
    "\n  query Messages($conversationId: ID!, $limit: Int) {\n    messages(conversationId: $conversationId, limit: $limit) {\n      ...MessageFields\n    }\n  }\n": typeof types.MessagesDocument,
    "\n  mutation SendMessage($input: SendMessageInput!) {\n    sendMessage(input: $input) {\n      message {\n        ...MessageFields\n      }\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n": typeof types.SendMessageDocument,
    "\n  mutation DeleteMessage($id: ID!) {\n    deleteMessage(id: $id) {\n      messageId\n      conversationId\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n": typeof types.DeleteMessageDocument,
    "\n  mutation MarkConversationRead($conversationId: ID!) {\n    markConversationRead(conversationId: $conversationId) {\n      unreadCount\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n": typeof types.MarkConversationReadDocument,
    "\n  query Users {\n    users {\n      id\n      displayName\n      avatarUrl\n      title\n    }\n  }\n": typeof types.UsersDocument,
};
const documents: Documents = {
    "\n  fragment ConversationFields on Conversation {\n    __typename\n    id\n    kind\n    title\n    members {\n      __typename\n      user {\n        __typename\n        id\n        displayName\n        avatarUrl\n        title\n      }\n      lastReadAt\n    }\n    unreadCount\n    lastActivityAt\n    lastMessage {\n      __typename\n      id\n      body\n      sender {\n        __typename\n        id\n        displayName\n        avatarUrl\n      }\n      createdAt\n      deletedAt\n    }\n  }\n": types.ConversationFieldsFragmentDoc,
    "\n  query Conversations {\n    conversations {\n      ...ConversationFields\n    }\n  }\n": types.ConversationsDocument,
    "\n  query Conversation($id: ID!) {\n    conversation(id: $id) {\n      ...ConversationFields\n    }\n  }\n": types.ConversationDocument,
    "\n  fragment MessageFields on Message {\n    __typename\n    id\n    conversationId\n    body\n    sender {\n      __typename\n      id\n      displayName\n      avatarUrl\n      title\n    }\n    replyTo {\n      __typename\n      messageId\n      senderId\n      senderDisplayName\n      bodyExcerpt\n      createdAt\n    }\n    createdAt\n    deletedAt\n  }\n": types.MessageFieldsFragmentDoc,
    "\n  query Messages($conversationId: ID!, $limit: Int) {\n    messages(conversationId: $conversationId, limit: $limit) {\n      ...MessageFields\n    }\n  }\n": types.MessagesDocument,
    "\n  mutation SendMessage($input: SendMessageInput!) {\n    sendMessage(input: $input) {\n      message {\n        ...MessageFields\n      }\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n": types.SendMessageDocument,
    "\n  mutation DeleteMessage($id: ID!) {\n    deleteMessage(id: $id) {\n      messageId\n      conversationId\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n": types.DeleteMessageDocument,
    "\n  mutation MarkConversationRead($conversationId: ID!) {\n    markConversationRead(conversationId: $conversationId) {\n      unreadCount\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n": types.MarkConversationReadDocument,
    "\n  query Users {\n    users {\n      id\n      displayName\n      avatarUrl\n      title\n    }\n  }\n": types.UsersDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment ConversationFields on Conversation {\n    __typename\n    id\n    kind\n    title\n    members {\n      __typename\n      user {\n        __typename\n        id\n        displayName\n        avatarUrl\n        title\n      }\n      lastReadAt\n    }\n    unreadCount\n    lastActivityAt\n    lastMessage {\n      __typename\n      id\n      body\n      sender {\n        __typename\n        id\n        displayName\n        avatarUrl\n      }\n      createdAt\n      deletedAt\n    }\n  }\n"): (typeof documents)["\n  fragment ConversationFields on Conversation {\n    __typename\n    id\n    kind\n    title\n    members {\n      __typename\n      user {\n        __typename\n        id\n        displayName\n        avatarUrl\n        title\n      }\n      lastReadAt\n    }\n    unreadCount\n    lastActivityAt\n    lastMessage {\n      __typename\n      id\n      body\n      sender {\n        __typename\n        id\n        displayName\n        avatarUrl\n      }\n      createdAt\n      deletedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Conversations {\n    conversations {\n      ...ConversationFields\n    }\n  }\n"): (typeof documents)["\n  query Conversations {\n    conversations {\n      ...ConversationFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Conversation($id: ID!) {\n    conversation(id: $id) {\n      ...ConversationFields\n    }\n  }\n"): (typeof documents)["\n  query Conversation($id: ID!) {\n    conversation(id: $id) {\n      ...ConversationFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment MessageFields on Message {\n    __typename\n    id\n    conversationId\n    body\n    sender {\n      __typename\n      id\n      displayName\n      avatarUrl\n      title\n    }\n    replyTo {\n      __typename\n      messageId\n      senderId\n      senderDisplayName\n      bodyExcerpt\n      createdAt\n    }\n    createdAt\n    deletedAt\n  }\n"): (typeof documents)["\n  fragment MessageFields on Message {\n    __typename\n    id\n    conversationId\n    body\n    sender {\n      __typename\n      id\n      displayName\n      avatarUrl\n      title\n    }\n    replyTo {\n      __typename\n      messageId\n      senderId\n      senderDisplayName\n      bodyExcerpt\n      createdAt\n    }\n    createdAt\n    deletedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Messages($conversationId: ID!, $limit: Int) {\n    messages(conversationId: $conversationId, limit: $limit) {\n      ...MessageFields\n    }\n  }\n"): (typeof documents)["\n  query Messages($conversationId: ID!, $limit: Int) {\n    messages(conversationId: $conversationId, limit: $limit) {\n      ...MessageFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SendMessage($input: SendMessageInput!) {\n    sendMessage(input: $input) {\n      message {\n        ...MessageFields\n      }\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation SendMessage($input: SendMessageInput!) {\n    sendMessage(input: $input) {\n      message {\n        ...MessageFields\n      }\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteMessage($id: ID!) {\n    deleteMessage(id: $id) {\n      messageId\n      conversationId\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteMessage($id: ID!) {\n    deleteMessage(id: $id) {\n      messageId\n      conversationId\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation MarkConversationRead($conversationId: ID!) {\n    markConversationRead(conversationId: $conversationId) {\n      unreadCount\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation MarkConversationRead($conversationId: ID!) {\n    markConversationRead(conversationId: $conversationId) {\n      unreadCount\n      conversation {\n        ...ConversationFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Users {\n    users {\n      id\n      displayName\n      avatarUrl\n      title\n    }\n  }\n"): (typeof documents)["\n  query Users {\n    users {\n      id\n      displayName\n      avatarUrl\n      title\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;