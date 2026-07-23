import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../db/db-factory.js";
import { RemotePathMappingRepository } from "../remotePathMappingRepository.js";
import { newRemotePathMapping } from "../remotePathMapping.js";
import { ModelAction, ModelEvent, type IEventAggregator } from "../../../db/events.js";

describe("RemotePathMappingRepository", () => {
  let db: MainDatabase;
  let repo: RemotePathMappingRepository;

  beforeEach(() => {
    db = createMainDatabase(":memory:");
    repo = new RemotePathMappingRepository(db);
  });

  it("round-trips host/remotePath/localPath through insert + get", () => {
    const inserted = repo.insert(
      newRemotePathMapping({
        host: "sabnzbd",
        remotePath: "/downloads/",
        localPath: "D:\\downloads\\",
      })
    );

    expect(inserted.id).toBeGreaterThan(0);

    const stored = repo.get(inserted.id);
    expect(stored.host).toBe("sabnzbd");
    expect(stored.remotePath).toBe("/downloads/");
    expect(stored.localPath).toBe("D:\\downloads\\");
  });

  it("update() persists changes", () => {
    const inserted = repo.insert(
      newRemotePathMapping({ host: "a", remotePath: "/r/", localPath: "/l/" })
    );
    repo.update({ ...inserted, host: "b" });
    expect(repo.get(inserted.id).host).toBe("b");
  });

  it("delete() removes the row and publishes a ModelEvent (PublishModelEvents => true)", () => {
    const events: ModelEvent<ReturnType<typeof newRemotePathMapping>>[] = [];
    const eventAggregator: IEventAggregator = {
      publishEvent: (e) => events.push(e as never),
    };
    const repoWithEvents = new RemotePathMappingRepository(db, eventAggregator);

    const inserted = repoWithEvents.insert(
      newRemotePathMapping({ host: "a", remotePath: "/r/", localPath: "/l/" })
    );
    events.length = 0;

    repoWithEvents.delete(inserted.id);

    expect(repoWithEvents.find(inserted.id)).toBeUndefined();
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe(ModelAction.Deleted);
    expect(events[0]?.model?.host).toBe("a");
  });

  it("insert() also publishes a ModelEvent (PublishModelEvents => true)", () => {
    const events: ModelEvent<ReturnType<typeof newRemotePathMapping>>[] = [];
    const eventAggregator: IEventAggregator = {
      publishEvent: (e) => events.push(e as never),
    };
    const repoWithEvents = new RemotePathMappingRepository(db, eventAggregator);

    repoWithEvents.insert(newRemotePathMapping({ host: "a", remotePath: "/r/", localPath: "/l/" }));

    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe(ModelAction.Created);
  });

  it("all() returns every mapping", () => {
    repo.insert(newRemotePathMapping({ host: "a", remotePath: "/r1/", localPath: "/l1/" }));
    repo.insert(newRemotePathMapping({ host: "b", remotePath: "/r2/", localPath: "/l2/" }));
    expect(repo.all()).toHaveLength(2);
  });
});
