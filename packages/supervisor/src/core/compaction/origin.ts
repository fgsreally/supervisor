/**
 * Message origin tracking utilities.
 *
 * This module provides constants and helper functions for tracking the
 * origin/source of messages in the session history. Origin information is
 * stored in the `meta.__origin` field of SessionTreeEntry objects, which is
 * persisted to storage and available when reconstructing messages from the
 * session tree.
 *
 * While we cannot modify the core AgentMessage type (due to read-only
 * constraints on packages/agent), we can achieve similar functionality by
 * storing origin metadata alongside each message.
 *
 * Origin tracking enables features like:
 * - Distinguishing real user input from system injections in compaction
 * - Tracking which messages came from approval models vs human users
 * - Implementing origin-based filtering in UI/replay systems
 * - Debugging message flow and provenance
 */
export type MessageOrigin =
  | 'user'              // Real user input (from harness.prompt or /user-slash skills)
  | 'injection'         // System-generated messages (read-orchestration hints, context files, etc.)
  | 'shell_command'     // Shell command input/output
  | 'compaction_summary'// Message containing a compaction summary
  | 'tool_result'       // Result from tool execution
  | 'assistant'         // Assistant response
  | 'custom'            // Custom message type
  | 'bashExecution'     // Bash execution message
  | 'branchSummary'     // Branch summary message
  | 'unknown';          // Fallback for unrecognized origins

/**
 * Check if a message represents real user input (as opposed to system-generated
 * content). This is used in compaction and projection to determine which
 * messages should be preserved verbatim vs. eligible for summarization/truncation.
 *
 * Real user input includes:
 * - Direct user messages from harness.prompt()
 * - User-slash skill activations (e.g., /read, /edit)
 *
 * System-generated content includes:
 * - Read-orchestration hints
 * - Context file contents
 * - System reminders
 * - Tool results
 * - Assistant messages
 * - Compaction summaries
 * - etc.
 */
export function isRealUserMessage(
  entry: { role: string; meta?: Record<string, unknown> }
): boolean {
  // Check for explicit origin in meta first
  const origin = entry.meta?.__origin as MessageOrigin | undefined;
  if (origin !== undefined) {
    switch (origin) {
      case 'user':
        return true;
      case 'injection':
      case 'shell_command':
      case 'compaction_summary':
      case 'tool_result':
      case 'assistant':
      case 'custom':
      case 'bashExecution':
      case 'branchSummary':
        return false;
      case 'unknown':
        break; // Fall through to role-based check
    }
  }

  // Fallback to role-based checking for backward compatibility
  // with entries that don't have explicit origin metadata
  switch (entry.role) {
    case 'user':
      // Note: This includes both real user input and some system-generated
      // user-role messages. For more precise detection, callers should
      // rely on explicit origin metadata when available.
      return true;
    case 'assistant':
    case 'toolResult':
      return false;
    case 'bashExecution':
    case 'custom':
    case 'branchSummary':
    case 'compactionSummary':
      return false;
    default:
      return false;
  }
}

/**
 * Check if a message is eligible for user-message merging in the projector.
 * Only real user messages with 'user' origin should be merged with adjacent
 * user messages to reduce token waste from system-generated content.
 */
export function isMergeableUserMessage(
  entry: { role: string; meta?: Record<string, unknown> }
): boolean {
  const origin = entry.meta?.__origin as MessageOrigin | undefined;
  return origin === 'user';
}

/**
 * Create a metadata object with origin information.
 * This is a convenience function for setting origin when appending entries.
 */
export function withOrigin(
  baseMeta: Record<string, unknown> = {},
  origin: MessageOrigin
): Record<string, unknown> {
  return {
    ...baseMeta,
    __origin: origin,
  };
}

/**
 * Extract origin from message metadata, falling back to 'unknown' if not set.
 */
export function getMessageOrigin(
  entry: { meta?: Record<string, unknown> }
): MessageOrigin {
  return (entry.meta?.__origin as MessageOrigin) ?? 'unknown';
}