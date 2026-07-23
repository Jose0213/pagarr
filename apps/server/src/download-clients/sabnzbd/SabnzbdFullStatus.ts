/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdFullStatus.cs.
 * Added in Sabnzbd 2.0.0, my_home was previously in &mode=queue. This is the
 * already resolved completedir path.
 */
export interface SabnzbdFullStatus {
  completedir: string;
}
