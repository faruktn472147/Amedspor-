import { describe, expect, it } from "vitest";
import { isValidTcKimlik, moderateFields, moderateText } from "@/lib/moderation";
import { normalizeText } from "@/lib/moderation/normalize";

describe("normalizeText", () => {
  it("leet, tekrar ve bölme varyasyonlarını birleştirir", () => {
    expect(normalizeText("S1KT1R").folded).toBe("siktir");
    expect(normalizeText("siiiiiktir").folded).toBe("siktir");
    expect(normalizeText("s i k t i r git").folded).toBe("siktir git");
    expect(normalizeText("s.i.k.t.i.r").folded).toBe("siktir");
    expect(normalizeText("İSTANBUL").preserved).toBe("istanbul");
    expect(normalizeText("si​ktir").folded).toBe("siktir");
  });
});

describe("moderateText — engellenmesi gerekenler", () => {
  const blocked = [
    "siktir git",
    "S1KT1R",
    "s i k t i r",
    "siiiiktir lan",
    "amk hakemi",
    "a.m.k",
    "AQ",
    "orospu çocuğu",
    "0r0spu",
    "piç",
    "seni öldüreceğim",
    "kafanı keserim senin",
    "adresini biliyorum dikkat et",
    "pis kürt",
    "ermeni köpeği",
    "suriyeliler pislik",
    "hepsini linç edin",
    "deneme bonusu veren bahis sitesi",
  ];
  for (const text of blocked) {
    it(`engeller: "${text}"`, () => {
      expect(moderateText(text).decision).toBe("block");
    });
  }

  it("telefon numarası paylaşımını engeller", () => {
    expect(moderateText("beni ara 0532 123 45 67").decision).toBe("block");
    expect(moderateText("+90 555 444 33 22").hits.some((h) => h.category === "kisisel_bilgi")).toBe(true);
  });

  it("geçerli TC kimlik numarasını engeller ama rastgele 11 haneyi engellemez", () => {
    expect(isValidTcKimlik("10000000146")).toBe(true);
    expect(moderateText("tc: 10000000146").decision).toBe("block");
    expect(moderateText("seyirci sayısı 12345678901").hits.some((h) => h.term === "tc_kimlik")).toBe(false);
  });

  it("kredi kartı numarasını (Luhn) engeller", () => {
    expect(moderateText("kart 4111 1111 1111 1111").decision).toBe("block");
  });
});

describe("moderateText — yanlış engelleme olmamalı", () => {
  const allowed = [
    "Amedspor bugün harika oynadı!",
    "Maç çok sıkıcıydı ama kazandık",
    "Bu sezon sıkıntı yaşıyoruz",
    "sikinti var gibi",
    "Sık sık stadyuma geliyorum",
    "Ağır siklet boks maçı",
    "Malzemeci abiye teşekkürler",
    "Amca ile maça gittik",
    "Ambalaj çok güzel",
    "Kürt, Türk, Arap hepimiz Amedspor taraftarıyız",
    "Diyarbakır'da muhteşem atmosfer",
    "Gol sonrası tribünler yıkıldı",
    "Kaleci harika kurtarış yaptı",
    "Picasso tablosu gibi bir gol",
  ];
  for (const text of allowed) {
    it(`izin verir: "${text}"`, () => {
      const r = moderateText(text);
      expect(r.decision, JSON.stringify(r.hits)).toBe("allow");
    });
  }
});

describe("moderateText — incelemeye alınması gerekenler", () => {
  it("hafif hakaret incelemeye alınır, engellenmez", () => {
    expect(moderateText("hakem salak mı").decision).toBe("review");
  });
  it("çok fazla bağlantı spam olarak incelemeye alınır", () => {
    expect(moderateText("https://a.com https://b.com https://c.com").decision).toBe("review");
  });
  it("tek başına ASCII 'sik' belirsizdir → inceleme", () => {
    expect(moderateText("sik").decision).toBe("review");
  });
});

describe("kullanıcı adı ve biyografi", () => {
  it("kullanıcı adında gizlenmiş küfür engellenir", () => {
    expect(moderateText("kral_orospu34", "username").decision).toBe("block");
    expect(moderateText("amedli_21", "username").decision).toBe("allow");
  });
  it("kullanıcı adında hafif hakaret de engellenir (incelemeye alınmaz)", () => {
    expect(moderateText("salak_adam", "username").decision).toBe("block");
  });
  it("birden fazla alanda en ağır karar döner", () => {
    const r = moderateFields({ display_name: "Ahmet", bio: "siktir" });
    expect(r.decision).toBe("block");
  });
});
