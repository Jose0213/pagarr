/**
 * Ported from NzbDrone.Core/Datastore/ModelNotFoundException.cs and
 * ModelConflictException.cs.
 */
export class ModelNotFoundException extends Error {
  constructor(modelTypeName: string, modelId: number) {
    super(`${modelTypeName} with ID ${modelId} does not exist`);
    this.name = "ModelNotFoundException";
  }
}

export class ModelConflictException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConflictException";
  }
}
