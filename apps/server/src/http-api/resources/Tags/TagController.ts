import type { Router } from "express";
import type { EventAggregator } from "../../../messaging/events/eventAggregator.js";
import type { SignalRBroadcaster } from "../../signalr/SignalRBroadcaster.js";
import { restControllerWithSignalR } from "../../rest/RestControllerWithSignalR.js";
import type { ResourceValidator } from "../../rest/ResourceValidator.js";
import { combineValidators } from "../../rest/ResourceValidator.js";
import type { Tag } from "../../../tags/tag.js";
import { TagService } from "../../../tags/tagService.js";
import { ModelAction } from "../../../db/events.js";
import { TAG_RESOURCE_NAME, tagToModel, tagToResource, tagsToResource } from "./TagResource.js";
import type { TagResource } from "./TagResource.js";

/**
 * Ported from Readarr.Api.V1/Tags/TagController.cs.
 *
 * `IHandle<TagsUpdatedEvent>` -- the real controller's own handler that
 * re-broadcasts a resourceless "Sync" SignalR message whenever
 * `TagsUpdatedEvent` fires -- is wired here via `TagService`'s
 * `onTagsUpdated` callback (see tagService.ts's module doc comment: this
 * port's Tags module doesn't yet have a real `IEventAggregator`-published
 * `TagsUpdatedEvent`, so a plain callback stands in for the subscription
 * this controller's ctor would otherwise register). `TagsUpdatedEvent`
 * itself is imported here purely so this file's intent ("this callback is
 * this port's substitute for `Handle(TagsUpdatedEvent message)`") is
 * traceable back to the real C# event type, even though no event instance
 * is actually constructed anywhere in this module.
 *
 * `getResourceByIdForBroadcast` is wired to the same `tagService.getTag(id)`
 * + `tagToResource` pair `getById` uses -- the real C#
 * `GetResourceByIdForBroadcast` defaults to `GetResourceById` when not
 * overridden, and `TagController` doesn't override it.
 */
export interface TagControllerOptions {
  tagService: TagService;
  eventAggregator: EventAggregator;
  signalRBroadcaster: SignalRBroadcaster;
}

export function tagController(options: TagControllerOptions): Router {
  const { tagService, eventAggregator, signalRBroadcaster } = options;

  // Ported from `SharedValidator.RuleFor(c => c.Label).NotEmpty();`
  const sharedValidator: ResourceValidator<TagResource> = (resource) =>
    resource.label && resource.label.trim() !== ""
      ? []
      : [{ propertyName: "label", errorMessage: "'Label' must not be empty." }];

  const { router } = restControllerWithSignalR<TagResource, Tag>({
    resourceName: TAG_RESOURCE_NAME,
    eventAggregator,
    signalRBroadcaster,
    sharedValidator: combineValidators(sharedValidator),

    getAll: () => tagsToResource(tagService.all()),

    getById: (id) => tagToResource(tagService.getTag(id)),

    getResourceByIdForBroadcast: (id) => tagToResource(tagService.getTag(id)),

    create: (resource) => {
      const created = tagService.add(tagToModel(resource));
      return tagToResource(created);
    },

    update: (resource) => {
      tagService.update(tagToModel(resource));
      return tagToResource(resource);
    },

    delete: (id) => {
      tagService.delete(id);
    },
  });

  return router;
}

/**
 * Ported from `TagController.Handle(TagsUpdatedEvent message)`: broadcasts a
 * resourceless "Sync" SignalR message. Wire this as `TagService`'s
 * `onTagsUpdated` callback at composition time -- see module doc comment.
 * Kept as a small standalone helper (rather than inlined at every call
 * site) so the mapping from "TagsUpdatedEvent fired" to "broadcast a Sync"
 * stays a single, named, testable unit.
 */
export function broadcastTagsSync(signalRBroadcaster: SignalRBroadcaster): void {
  signalRBroadcaster.broadcastResourceChange(ModelAction.Sync, TAG_RESOURCE_NAME);
}
