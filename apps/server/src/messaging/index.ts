/**
 * Barrel export for the Messaging module -- port of
 * NzbDrone.Core/Messaging/*.cs (Commands/, Events/, plus the top-level
 * EventHandleOrderAttribute.cs/IProcessMessage.cs files). See this
 * worktree's final report for what's ported vs. deferred (ProgressMessaging
 * is forward-ref'd locally, not a real port -- see
 * commands/progressMessageContext.ts's doc comment; Lifecycle's
 * ApplicationStartedEvent/ApplicationShutdownRequested are referenced only
 * as plain `handleApplicationStarted`/`handleApplicationShutdownRequested`
 * methods, not real `IHandle<T>` subscriptions).
 */

export * from "./iProcessMessage.js";
export * from "./eventHandleOrder.js";

export * from "./events/iEvent.js";
export * from "./events/iHandle.js";
export * from "./events/iEventAggregator.js";
export * from "./events/eventAggregator.js";
export * from "./events/commandExecutedEvent.js";

export * from "./commands/command.js";
export * from "./commands/commandModel.js";
export * from "./commands/commandStatus.js";
export * from "./commands/commandResult.js";
export * from "./commands/commandPriority.js";
export * from "./commands/commandPriorityComparer.js";
export * from "./commands/commandTrigger.js";
export * from "./commands/iExecute.js";
export * from "./commands/commandFailedException.js";
export * from "./commands/commandNotFoundException.js";
export * from "./commands/backendCommandAttribute.js";
export * from "./commands/commandEqualityComparer.js";
export * from "./commands/commandQueue.js";
export * from "./commands/commandRepository.js";
export * from "./commands/commandQueueManager.js";
export * from "./commands/commandExecutor.js";
export * from "./commands/commandResultReporter.js";
export * from "./commands/progressMessageContext.js";
export * from "./commands/messagingCleanupCommand.js";
export * from "./commands/cleanupCommandMessagingService.js";
export * from "./commands/testCommand.js";
export * from "./commands/testCommandExecutor.js";
export * from "./commands/unknownCommand.js";
export * from "./commands/unknownCommandExecutor.js";
