// Ported from NzbDrone.Common/Http/Dispatchers/ICertificateValidationService.cs
//
// Not wired into ManagedHttpDispatcher in this pass -- see that file's
// header comment. Declared here so the shape exists for a later pass (once
// Configuration, which supplies the cert-bypass-list settings, has landed)
// to implement against.

export interface ICertificateValidationService {
  shouldByPassValidationError(host: string): boolean;
}
