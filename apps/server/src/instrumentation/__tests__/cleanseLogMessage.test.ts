import { describe, expect, it } from "vitest";
import { cleanse } from "../cleanseLogMessage.js";

/**
 * Translated from NzbDrone.Common.Test/InstrumentationTests/
 * CleanseLogMessageFixture.cs -- same test cases (adjusted from Radarr/
 * Readarr-specific product names where the C# source used them, since none
 * of that is regex-relevant), same assertions.
 */

describe("cleanse", () => {
  describe("should_clean_message", () => {
    const messages = [
      "https://iptorrents.com/torrents/rss?u=mySecret;tp=mySecret;l5;download",
      "http://rss.torrentleech.org/mySecret",
      "https://rss24h.torrentleech.org/mySecret",
      "http://rss.torrentleech.org/rss/download/12345/01233210/file.name-RLSGRP.torrent",
      "https://www.torrentleech.org/rss/download/12345/01233210/file.name-RLSGRP.torrent",
      "http://www.bitmetv.org/rss.php?uid=mySecret&passkey=mySecret",
      "https://rss.omgwtfnzbs.org/rss-search.php?catid=19,20&user=Readarr&api=mySecret&eng=1",
      "https://dognzb.cr/fetch/2b51db35e1912ffc138825a12b9933d2/2b51db35e1910123321025a12b9933d2",
      "https://baconbits.org/feeds.php?feed=torrents_tv&user=12345&auth=2b51db35e1910123321025a12b9933d2&passkey=mySecret&authkey=2b51db35e1910123321025a12b9933d2",
      "http://127.0.0.1:9117/dl/indexername?jackett_apikey=flwjiefewklfjacketmySecretsdfldskjfsdlk&path=we0re9f0sdfbase64sfdkfjsdlfjk&file=The+Torrent+File+Name.torrent",
      "http://nzb.su/getnzb/2b51db35e1912ffc138825a12b9933d2.nzb&i=37292&r=2b51db35e1910123321025a12b9933d2",
      "https://b-hd.me/torrent/download/auto.343756.is1t1pl127p1sfwur8h4kgyhg1wcsn05",
      "https://b-hd.me/torrent/download/a-slug-in-the-url.343756.is1t1pl127p1sfwur8h4kgyhg1wcsn05",

      // NzbGet
      '{ "Name" : "ControlUsername", "Value" : "mySecret" }, { "Name" : "ControlPassword", "Value" : "mySecret" }, ',
      '{ "Name" : "Server1.Username", "Value" : "mySecret" }, { "Name" : "Server1.Password", "Value" : "mySecret" }, ',

      // Sabnzbd
      "http://127.0.0.1:1234/api/call?vv=1&apikey=mySecret",
      "http://127.0.0.1:1234/api/call?vv=1&ma_username=mySecret&ma_password=mySecret",
      '"config":{"newzbin":{"username":"mySecret","password":"mySecret"}',
      '"nzbxxx":{"username":"mySecret","apikey":"mySecret"}',
      '"growl":{"growl_password":"mySecret","growl_server":""}',
      '"nzbmatrix":{"username":"mySecret","apikey":"mySecret"}',
      '"misc":{"username":"mySecret","api_key":"mySecret","password":"mySecret","nzb_key":"mySecret"}',
      '"servers":[{"username":"mySecret","password":"mySecret"}]',
      '"misc":{"email_account":"mySecret","email_to":[],"email_from":"","email_pwd":"mySecret"}',

      // uTorrent
      "http://localhost:9091/gui/?token=wThmph5l0ZXfH-a6WOA4lqiLvyjCP0FpMrMeXmySecret_VXBO11HoKL751MAAAAA&list=1",
      ',["boss_key",0,"mySecret",{"access":"Y"}],["boss_key_salt",0,"mySecret",{"access":"W"}]',
      ',["webui.username",2,"mySecret",{"access":"Y"}],["webui.password",2,"mySecret",{"access":"Y"}]',
      ',["webui.uconnect_username",2,"mySecret",{"access":"Y"}],["webui.uconnect_password",2,"mySecret",{"access":"Y"}]',
      ',["proxy.proxy",2,"mySecret",{"access":"Y"}]',
      ',["proxy.username",2,"mySecret",{"access":"Y"}],["proxy.password",2,"mySecret",{"access":"Y"}]',

      // Deluge
      ',{"download_location": "C:\\Users\\mySecret mySecret\\Downloads"}',
      ',{"download_location": "/home/mySecret/Downloads"}',
      ',{"download_location": "/Users/mySecret/Downloads"}',
      'auth.login("mySecret")',

      // Download Station
      "webapi/entry.cgi?api=(removed)&version=2&method=login&account=01233210&passwd=mySecret&format=sid&session=DownloadStation",

      // BroadcastheNet
      'method: "getTorrents", "params": [ "mySecret",',
      'getTorrents("mySecret", [asdfasdf], 100, 0)',
      '"DownloadURL":"https:\\/\\/broadcasthe.net\\/torrents.php?action=download&id=123&authkey=mySecret&torrent_pass=mySecret"',

      // Internal
      "OutputPath=/home/mySecret/Downloads",
      "OutputPath=/Users/mySecret/Downloads",
      "Hardlinking episode file: /home/mySecret/Downloads to /media/abc.mkv",
      "Hardlinking episode file: /Users/mySecret/Downloads to /media/abc.mkv",
      "Hardlink '/home/mySecret/Downloads/abs.mkv' to '/media/abc.mkv' failed.",
      "Hardlink '/Users/mySecret/Downloads/abs.mkv' to '/media/abc.mkv' failed.",
      "https://notifiarr.com/notifier.php: api=1234530f-422f-4aac-b6b3-01233210aaaa&radarr_health_issue_message=Download",
      "/readarr/signalr/messages/negotiate?access_token=1234530f422f4aacb6b301233210aaaa&negotiateVersion=1",
      "[Info] MigrationController: *** Migrating Database=readarr-main;Host=postgres14;Username=mySecret;Password=mySecret;Port=5432;Enlist=False ***",
      "[Info] MigrationController: *** Migrating Database=readarr-main;Host=postgres14;Username=mySecret;Password=mySecret;Port=5432;token=mySecret;Enlist=False&username=mySecret;mypassword=mySecret;mypass=shouldkeep1;test_token=mySecret;password=123%@%_@!#^#@;use_password=mySecret;get_token=shouldkeep2;usetoken=shouldkeep3;passwrd=mySecret;",

      // Announce URLs (passkeys) Magnet & Tracker
      'magnet_uri":"magnet:?xt=urn:btih:9pr04sgkillroyimaveql2tyu8xyui&dn=&tr=https%3a%2f%2fxxx.yyy%2f9pr04sg601233210IMAveQL2tyu8xyui%2fannounce"}',
      'magnet_uri":"magnet:?xt=urn:btih:9pr04sgkillroyimaveql2tyu8xyui&dn=&tr=https%3a%2f%2fxxx.yyy%2ftracker.php%2f9pr04sg601233210IMAveQL2tyu8xyui%2fannounce"}',
      'magnet_uri":"magnet:?xt=urn:btih:9pr04sgkillroyimaveql2tyu8xyui&dn=&tr=https%3a%2f%2fxxx.yyy%2fannounce%2f9pr04sg601233210IMAveQL2tyu8xyui"}',
      'magnet_uri":"magnet:?xt=urn:btih:9pr04sgkillroyimaveql2tyu8xyui&dn=&tr=https%3a%2f%2fxxx.yyy%2fannounce.php%3fpasskey%3d9pr04sg601233210IMAveQL2tyu8xyui"}',
      'tracker":"https://xxx.yyy/9pr04sg601233210IMAveQL2tyu8xyui/announce"}',
      'tracker":"https://xxx.yyy/tracker.php/9pr04sg601233210IMAveQL2tyu8xyui/announce"}',
      'tracker":"https://xxx.yyy/announce/9pr04sg601233210IMAveQL2tyu8xyui"}',
      'tracker":"https://xxx.yyy/announce.php?passkey=9pr04sg601233210IMAveQL2tyu8xyui"}',
      'tracker":"http://xxx.yyy/announce.php?passkey=9pr04sg601233210IMAveQL2tyu8xyui","info":"http://xxx.yyy/info?a=b"',

      // Notifiarr
      "https://xxx.yyy/api/v1/notification/readarr/9pr04sg6-0123-3210-imav-eql2tyu8xyui",

      // Discord
      "https://discord.com/api/webhooks/mySecret",
      "https://discord.com/api/webhooks/mySecret/01233210",

      // Telegram
      "https://api.telegram.org/bot1234567890:mySecret/sendmessage: chat_id=123456&parse_mode=HTML&text=<text>",
      "https://api.telegram.org/bot1234567890:mySecret/",
    ];

    it.each(messages)("cleanses %s", (message) => {
      const cleansed = cleanse(message);

      expect(cleansed).not.toContain("mySecret");
      expect(cleansed).not.toContain("123%@%_@!#^#@");
      expect(cleansed).not.toContain("01233210");
    });
  });

  it("should_keep_message: only strips secrets, leaves unrelated tokens with 'keep'-like names intact", () => {
    const message =
      "[Info] MigrationController: *** Migrating Database=radarr-main;Host=postgres14;Username=mySecret;Password=mySecret;Port=5432;token=mySecret;Enlist=False&username=mySecret;mypassword=mySecret;mypass=shouldkeep1;test_token=mySecret;password=123%@%_@!#^#@;use_password=mySecret;get_token=shouldkeep2;usetoken=shouldkeep3;passwrd=mySecret;";

    const cleansed = cleanse(message);

    expect(cleansed).not.toContain("mySecret");
    expect(cleansed).not.toContain("123%@%_@!#^#@");
    expect(cleansed).not.toContain("01233210");

    expect(cleansed).toContain("shouldkeep1");
    expect(cleansed).toContain("shouldkeep2");
    expect(cleansed).toContain("shouldkeep3");
  });

  describe("should_cleanGoodRead_message", () => {
    const messages = [
      '{"signatureMethod": "hmacSha1","signatureTreatment": "escaped","type": "protectedResource","method": "GET","token": "mytoken","tokenSecret": "mytokensecret","requestUrl": "https://www.goodreads.com/review/list.xml","parameters": {  "_nc": "1",  "v": "2",  "id": "999999999",  "shelf": "currently-reading",  "per_page": "200",  "page": "1"}',
      "https://www.goodreads.com/series/311911?key=1234530f422f4aacb6b301233210aaaa&_nc=1&format=xml",
    ];

    it.each(messages)("cleanses %s", (message) => {
      const cleansed = cleanse(message);

      expect(cleansed).not.toContain("mytokensecret");
      expect(cleansed).not.toContain("mytoken");
    });
  });

  describe("should_clean_ipaddress", () => {
    const messages = [
      "Some message (from 32.2.3.5 user agent)",
      "Auth-Invalidated ip 32.2.3.5",
      "Auth-Success ip 32.2.3.5",
      "Auth-Logout ip 32.2.3.5",
    ];

    it.each(messages)("cleanses %s", (message) => {
      const cleansed = cleanse(message);

      expect(cleansed).not.toContain(".2.3.");
    });
  });

  describe("should_not_clean_ipaddress", () => {
    const messages = [
      "Some message (from 10.2.3.2 user agent)",
      "Auth-Unauthorized ip 32.2.3.5",
      "Auth-Failure ip 32.2.3.5",
    ];

    it.each(messages)("leaves %s unchanged", (message) => {
      expect(cleanse(message)).toBe(message);
    });
  });

  it("returns null/undefined/whitespace-only input unchanged", () => {
    expect(cleanse(null)).toBeNull();
    expect(cleanse(undefined)).toBeUndefined();
    expect(cleanse("   ")).toBe("   ");
    expect(cleanse("")).toBe("");
  });
});
