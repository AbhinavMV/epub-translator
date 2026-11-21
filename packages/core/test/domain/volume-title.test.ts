import { describe, expect, it } from "vitest";
import { parseVolumeTitle } from "../../src/domain/volume-title.ts";

describe("parseVolumeTitle", () => {
  it.each<[string, string, number | null]>([
    ["Sword Art Online Vol. 3", "Sword Art Online", 3],
    ["Overlord, Volume 14", "Overlord", 14],
    ["Mushoku Tensei v12", "Mushoku Tensei", 12],
    ["Spice and Wolf vol.2", "Spice and Wolf", 2],
    ["とある魔術の禁書目録 第3巻", "とある魔術の禁書目録", 3],
    ["無職転生 ~異世界行ったら本気だす~ 12巻", "無職転生 ~異世界行ったら本気だす~", 12],
    ["ノーゲーム・ノーライフ　第１０巻", "ノーゲーム・ノーライフ", 10],
    ["本好きの下剋上 ５巻", "本好きの下剋上", 5],
    ["ロクでなし魔術講師と禁忌教典 3", "ロクでなし魔術講師と禁忌教典", 3],
    ["ロクでなし魔術講師と禁忌教典３", "ロクでなし魔術講師と禁忌教典", 3],
    ["Re:ゼロから始める異世界生活 2.5", "Re:ゼロから始める異世界生活", 2.5],
    ["The Rising of the Shield Hero Vol. 7.5", "The Rising of the Shield Hero", 7.5],
    ["とある魔術の禁書目録(3)", "とある魔術の禁書目録", 3],
    ["とある魔術の禁書目録 （３）", "とある魔術の禁書目録", 3],
    ["ゴブリンスレイヤー【3】", "ゴブリンスレイヤー", 3],
    ["86―エイティシックス―", "86―エイティシックス―", null],
    ["86―エイティシックス―Ep.2", "86―エイティシックス―", 2],
    ["涼宮ハルヒの分裂", "涼宮ハルヒの分裂", null],
    ["涼宮ハルヒの驚愕(上)", "涼宮ハルヒの驚愕", 1],
    ["涼宮ハルヒの驚愕（中）", "涼宮ハルヒの驚愕", 2],
    ["涼宮ハルヒの驚愕 下巻", "涼宮ハルヒの驚愕", 3],
    ["魔法科高校の劣等生 入学編 上", "魔法科高校の劣等生 入学編", 1],
    ["本好きの下剋上 短編集", "本好きの下剋上", null],
    ["本好きの下剋上 短編集2", "本好きの下剋上", null],
    ["ソードアート・オンライン 第8巻 アーリー・アンド・レイト", "ソードアート・オンライン", 8],
    ["Sword Art Online Vol. 2: Aincrad", "Sword Art Online", 2],
    ["Sword Art Online, Vol. 3 - Fairy Dance", "Sword Art Online", 3],
    ["ゴブリンスレイヤー 3 (GA文庫)", "ゴブリンスレイヤー", 3],
    ["ゴブリンスレイヤー【電子特典付き】", "ゴブリンスレイヤー", null],
    ["【推しの子】 ～一番星のスピカ～", "【推しの子】 ~一番星のスピカ~", null],
    ["Ｓｗｏｒｄ　Ａｒｔ　Ｏｎｌｉｎｅ　Ｖｏｌ．４", "Sword Art Online", 4],
    [
      "ブチ切れ令嬢は報復を誓いました。 4 ～魔導書の力で祖国を叩き潰します～",
      "ブチ切れ令嬢は報復を誓いました。",
      4,
    ],
    [
      "異世界帰りの勇者は、ダンジョンが出現した現実世界で、インフルエンサーになって金を稼ぎます！３ (電撃の新文芸)",
      "異世界帰りの勇者は、ダンジョンが出現した現実世界で、インフルエンサーになって金を稼ぎます!",
      3,
    ],
  ])("%s", (title, seriesTitle, volumeNumber) => {
    expect(parseVolumeTitle(title)).toEqual({ seriesTitle, volumeNumber });
  });

  it.each([
    ["Sword Art Online Vol. 1: Aincrad", "Sword Art Online, Vol. 3 - Fairy Dance"],
    ["とある魔術の禁書目録", "とある魔術の禁書目録（２２）"],
    ["ゴブリンスレイヤー 1 (GA文庫)", "ゴブリンスレイヤー【３】"],
    ["本好きの下剋上 第一部 1", "本好きの下剋上 第一部 短編集"],
    ["Spice and Wolf:", "Spice and Wolf, Vol. 2"],
  ])("groups %s with %s", (first, second) => {
    expect(parseVolumeTitle(first).seriesTitle).toBe(parseVolumeTitle(second).seriesTitle);
  });
});
