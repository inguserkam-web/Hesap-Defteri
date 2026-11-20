import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, collection, doc, setDoc, updateDoc,
  deleteDoc, onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });

// ---------- Yardımcılar ----------
const kok = document.getElementById("uygulama");
const para = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sayi = (v) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v ?? "").trim().replace(/\s|₺/g, "");
  const eksi = s.startsWith("-"); if (eksi) s = s.slice(1);
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (!/^\d*\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isFinite(n) ? (eksi ? -n : n) : 0;
};
const sayiYaz = (n) => n ? String(Math.round(n * 100) / 100).replace(".", ",") : "";
const yuvarla = (n) => Math.round(n * 100) / 100;
const gun = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const bugun = () => gun(Date.now());
const tarihYaz = (s) => s ? new Date(s + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "";
const kisaTarih = (s) => s ? new Date(s + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "";
const ayAdi = (ay) => new Date(ay + "-15T12:00:00").toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
const ayKaydir = (ay, n) => { const [y, m] = ay.split("-").map(Number); const d = new Date(y, m - 1 + n, 15); return gun(d).slice(0, 7); };
const ayNo = (s) => { const [y, m] = String(s).split("-").map(Number); return y * 12 + m; };
const yeniId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const HESAP_TURLERI = { nakit: "Nakit", banka: "Banka hesabı", kredi: "Kredi kartı" };

// ---------- Varsayılan kategoriler ----------
const VARSAYILAN_GIDER = {
  "Mutfak": ["Market", "Pazar", "Unlu Mamul", "Kasap", "Manav", "Dışarıda Yemek"],
  "Faturalar": ["Elektrik", "Su", "Doğalgaz", "İnternet", "Telefon"],
  "Ev": ["Kira", "Aidat", "Ev Eşyası", "Tamir - Bakım"],
  "Sağlık": ["Eczane", "Doktor - Hastane"],
  "Ulaşım": ["Yakıt", "Toplu Taşıma", "Araç Bakım", "Otopark - Köprü"],
  "Eğitim": ["Okul", "Kitap - Kırtasiye", "Kurs"],
  "Giyim": ["Giyim - Ayakkabı"],
  "Hayır": ["Sadaka - Bağış", "Zekat", "Kurban"],
  "Kişisel": ["Kişisel Bakım", "Hediye"],
  "Finans": ["Kredi Taksiti", "Banka Masrafı", "Borç Ödeme"],
  "Diğer": ["Diğer Gider"]
};
const VARSAYILAN_GELIR = ["Maaş", "Mesai", "Ek İş", "Kira Geliri", "Hediye", "Borç Tahsilatı", "Diğer Gelir"];
const ALISVERIS_KATEGORI = { pazar: "Pazar", firin: "Unlu Mamul", kasap: "Kasap", eczane: "Eczane", kirtasiye: "Kitap - Kırtasiye" };

let kullanici = null;
let hesaplar = [], islemler = [], alisverisler = [], kategoriler = [];
let yuklendi = {};
let sekme = "ozet";
let acikHesapId = null;
let raporAyi = bugun().slice(0, 7);
let filtre = { tur: "", hesap: "" };
let hata = "";
let dinleyiciler = [];
let tohumlandi = false;
const yaziliyor = new Set();

// ---------- Giriş ----------
onAuthStateChanged(auth, (u) => {
  kullanici = u;
  dinleyiciler.forEach((d) => d()); dinleyiciler = [];
  hesaplar = []; islemler = []; alisverisler = []; kategoriler = [];
  yuklendi = {};
  if (!u) { cizGiris(); return; }
  const hataYakala = (e) => {
    hata = e.code === "permission-denied"
      ? "Bu deftere erişim izniniz yok. Hesap Defteri'ni yalnızca sahibi açabilir."
      : "Bağlantı hatası: " + e.message;
    ciz();
  };
  dinleyiciler.push(onSnapshot(collection(db, "hesaplar"), (s) => {
    hesaplar = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0) || String(a.ad).localeCompare(b.ad, "tr"));
    yuklendi.hesaplar = true; hata = ""; sonra();
  }, hataYakala));
  dinleyiciler.push(onSnapshot(collection(db, "islemler"), (s) => {
    islemler = s.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)) || (b.olusturma?.seconds ?? 9e9) - (a.olusturma?.seconds ?? 9e9));
    yuklendi.islemler = true; sonra();
  }, hataYakala));
  dinleyiciler.push(onSnapshot(collection(db, "defterKategorileri"), { includeMetadataChanges: true }, (s) => {
    kategoriler = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    yuklendi.kategoriler = true;
    if (!s.metadata?.fromCache) tohumla(); // önbellekten gelen boş liste yanıltmasın
    sonra();
  }, hataYakala));
  dinleyiciler.push(onSnapshot(query(collection(db, "alisveris"), where("durum", "==", "bitti")), (s) => {
    alisverisler = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    yuklendi.alisveris = true; sonra();
  }, hataYakala));
  ciz();
});

function sonra() { alisverisleriAktar(); ciz(); }

function tohumla() {
  if (tohumlandi || kategoriler.length) return;
  tohumlandi = true;
  let i = 0;
  for (const [grup, adlar] of Object.entries(VARSAYILAN_GIDER)) for (const ad of adlar) {
    setDoc(doc(db, "defterKategorileri", "g" + String(i).padStart(3, "0")), { ad, tur: "gider", grup, sira: i++ }).catch(() => {});
  }
  VARSAYILAN_GELIR.forEach((ad, j) => setDoc(doc(db, "defterKategorileri", "e" + String(j).padStart(3, "0")), { ad, tur: "gelir", grup: "Gelir", sira: j }).catch(() => {}));
}

async function girisYap() {
  const saglayici = new GoogleAuthProvider();
  saglayici.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, saglayici); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, saglayici);
    } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      alert("Giriş yapılamadı: " + e.message);
    }
  }
}

function cizGiris() {
  kok.innerHTML = `
    <main class="giris">
      <img src="icons/icon-192.png" alt="">
      <h1>Hesap Defteri</h1>
      <p>Gelir, gider, hesaplar ve kartlar</p><p class="soluk" style="font-size:12px">Sürüm 4</p>
      <button id="giris">Google ile giriş yap</button>
    </main>`;
  document.getElementById("giris").onclick = girisYap;
}

const hataGoster = (e) => alert("Kaydedilemedi: " + e.message);

// ---------- Hesap ve işlem hesapları ----------
const aktifHesaplar = () => hesaplar.filter((h) => !h.arsiv);
const hesap = (id) => hesaplar.find((h) => h.id === id);
const hesapAdi = (id) => hesap(id)?.ad || "Silinmiş hesap";
const gecerli = () => islemler.filter((i) => !i.iptal);
const kartMi = (id) => hesap(id)?.tur === "kredi";

function varsayilanHesap(tur) {
  const uygun = aktifHesaplar().filter((h) => h.tur === tur);
  return uygun.find((h) => h.varsayilan) || uygun[0] || null;
}

function bakiye(h) {
  let b = sayi(h.acilis);
  for (const i of gecerli()) {
    const t = sayi(i.tutar);
    if (i.tur === "gelir" && i.hesapId === h.id) b += t;
    if (i.tur === "gider" && i.hesapId === h.id) b -= t;
    if (i.tur === "transfer") { if (i.hesapId === h.id) b -= t; if (i.hedefHesapId === h.id) b += t; }
  }
  return yuvarla(b);
}
const kartBorcu = (h) => Math.max(0, -bakiye(h));

// Taksitler: ilk taksit harcamadan sonraki ay ödenir varsayılır.
function taksitDurumu(i) {
  const n = Math.max(1, parseInt(i.taksit) || 1);
  const gecen = ayNo(bugun()) - ayNo(i.tarih);
  const odenen = Math.min(n, Math.max(0, gecen));
  const aylik = sayi(i.tutar) / n;
  return { n, odenen, kalan: n - odenen, aylik, kalanTutar: yuvarla(aylik * (n - odenen)) };
}
const aktifTaksitler = (kartId) => gecerli().filter((i) => i.tur === "gider" && i.hesapId === kartId && (parseInt(i.taksit) || 1) > 1 && taksitDurumu(i).kalan > 0);

function kategoriGrubu(ad) { return kategoriler.find((k) => k.ad === ad)?.grup || (ad ? "Diğer" : "Kategorisiz"); }
const katListesi = (tur) => kategoriler.filter((k) => k.tur === tur).sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0) || a.ad.localeCompare(b.ad, "tr"));

// ---------- Alışveriş listesinden otomatik gider ----------
const odemeTuru = (o) => o === "nakit" ? "nakit" : o === "kredi" ? "kredi" : "banka";
function bekleyenAlisverisler() {
  const aktarilan = new Set(islemler.map((i) => i.alisverisId).filter(Boolean));
  return alisverisler.filter((a) => !aktarilan.has(a.id) && sayi(a.toplam) > 0);
}
function alisverisleriAktar() {
  if (!yuklendi.hesaplar || !yuklendi.islemler || !yuklendi.alisveris) return;
  for (const a of bekleyenAlisverisler()) {
    const h = varsayilanHesap(odemeTuru(a.odeme));
    if (!h || yaziliyor.has(a.id)) continue;
    yaziliyor.add(a.id);
    const tarih = a.bitis?.seconds ? gun(a.bitis.seconds * 1000) : bugun();
    setDoc(doc(db, "islemler", "alis_" + a.id), {
      tur: "gider", tutar: sayi(a.toplam), hesapId: h.id, tarih, taksit: 1,
      kategori: ALISVERIS_KATEGORI[a.magazaTur] || "Market",
      aciklama: a.magazaAd ? `${a.magazaAd} alışverişi` : (a.ad || "Alışveriş"),
      kaynak: "alisveris", alisverisId: a.id, odeme: a.odeme || "",
      olusturma: serverTimestamp()
    }).catch((e) => console.error(e)).finally(() => yaziliyor.delete(a.id));
  }
}

// ---------- Ana çizim ----------
function ciz() {
  if (!kullanici) return cizGiris();
  if (acikHesapId && hesap(acikHesapId) && !hata) return cizHesapDetay(hesap(acikHesapId));
  acikHesapId = null;
  const yukleniyor = !yuklendi.hesaplar || !yuklendi.islemler;
  const icerik = hata ? `<div class="hata">${esc(hata)}</div>`
    : yukleniyor ? `<p class="bos">Yükleniyor…</p>`
    : sekme === "ozet" ? ozet() : sekme === "islemler" ? islemEkrani() : sekme === "hesaplar" ? hesapEkrani()
    : sekme === "rapor" ? raporEkrani() : kategoriEkrani();
  kok.innerHTML = `
    <header><h1>${sekme === "kategoriler" ? "Kategoriler" : "Hesap Defteri"}</h1>
      ${sekme === "kategoriler" ? `<button id="kapat-kat">Tamam</button>` : `<button id="ayar" aria-label="Kategoriler">Kategoriler</button><button id="cikis">Çıkış</button>`}</header>
    <main>
      ${sekme === "kategoriler" ? "" : `<div class="sekmeler">
        ${[["ozet", "Özet"], ["islemler", "İşlemler"], ["hesaplar", "Hesaplar"], ["rapor", "Rapor"]].map(([k, v]) =>
          `<button data-s="${k}" class="${sekme === k ? "secili" : ""}">${v}</button>`).join("")}
      </div>`}
      ${icerik}
    </main>
    ${hata || yukleniyor || sekme === "rapor" ? "" : `<button class="yuzen" id="yeni" aria-label="Yeni">+</button>`}`;
  baglaGenel();
}

function baglaGenel() {
  const on = (id, f) => { const el = document.getElementById(id); if (el) el.onclick = f; };
  on("cikis", () => signOut(auth));
  on("ayar", () => { sekme = "kategoriler"; ciz(); });
  on("kapat-kat", () => { sekme = "ozet"; ciz(); });
  on("yeni", () => sekme === "hesaplar" ? hesapPenceresi(null) : sekme === "kategoriler" ? kategoriPenceresi(null) : islemPenceresi(null));
  on("hesaba-git", () => { sekme = "hesaplar"; ciz(); hesapPenceresi(null); });
  on("onceki-ay", () => { raporAyi = ayKaydir(raporAyi, -1); ciz(); });
  on("sonraki-ay", () => { raporAyi = ayKaydir(raporAyi, 1); ciz(); });
  kok.querySelectorAll("[data-s]").forEach((b) => b.onclick = () => { sekme = b.dataset.s; ciz(); window.scrollTo(0, 0); });
  kok.querySelectorAll("[data-islem]").forEach((el) => el.onclick = () => islemPenceresi(islemler.find((i) => i.id === el.dataset.islem)));
  kok.querySelectorAll("[data-hesap]").forEach((el) => el.onclick = () => { acikHesapId = el.dataset.hesap; ciz(); window.scrollTo(0, 0); });
  kok.querySelectorAll("[data-kat]").forEach((el) => el.onclick = () => kategoriPenceresi(kategoriler.find((k) => k.id === el.dataset.kat)));
  kok.querySelectorAll("[data-hizli]").forEach((b) => b.onclick = () => hizliIslem(b.dataset.hizli));
  kok.querySelectorAll("[data-filtre]").forEach((b) => b.onclick = () => { filtre.tur = b.dataset.filtre; ciz(); });
  const fh = document.getElementById("filtre-hesap");
  if (fh) fh.onchange = () => { filtre.hesap = fh.value; ciz(); };
}

function hizliIslem(tur) {
  if (!aktifHesaplar().length) { alert("Önce Hesaplar sekmesinden bir hesap ekleyin."); sekme = "hesaplar"; ciz(); return; }
  if (tur === "kart") {
    const kartlar = aktifHesaplar().filter((h) => h.tur === "kredi");
    if (!kartlar.length) { alert("Henüz kredi kartı eklemediniz. Hesaplar sekmesinden ekleyebilirsiniz."); return; }
    const kart = kartlar.sort((a, b) => kartBorcu(b) - kartBorcu(a))[0];
    return kartOdePenceresi(kart);
  }
  islemPenceresi(null, { tur });
}

// ---------- Satır görünümleri ----------
function islemSatiri(i, bakisHesabi) {
  const kartOdeme = i.tur === "transfer" && kartMi(i.hedefHesapId);
  let isaret = i.tur === "gelir" ? "arti" : i.tur === "gider" ? "eksi" : "";
  let onEk = i.tur === "gider" ? "−" : i.tur === "gelir" ? "+" : "";
  if (bakisHesabi && i.tur === "transfer") { const giren = i.hedefHesapId === bakisHesabi; isaret = giren ? "arti" : "eksi"; onEk = giren ? "+" : "−"; }
  const t = (parseInt(i.taksit) || 1) > 1 ? taksitDurumu(i) : null;
  const baslik = i.aciklama || (kartOdeme ? "Kart ödemesi" : i.tur === "transfer" ? "Transfer" : i.kategori || (i.tur === "gelir" ? "Gelir" : "Gider"));
  const alt = i.tur === "transfer"
    ? `${esc(hesapAdi(i.hesapId))} → ${esc(hesapAdi(i.hedefHesapId))}`
    : `${i.kategori && i.kategori !== baslik ? esc(i.kategori) + " · " : ""}${esc(hesapAdi(i.hesapId))}`;
  return `
    <div class="kart satir liste-ogesi" data-islem="${i.id}">
      <div class="esnek">
        <div class="kalin">${esc(baslik)}
          ${i.kaynak === "alisveris" ? `<span class="rozet">Alışveriş</span>` : ""}
          ${kartOdeme ? `<span class="rozet">Kart ödemesi</span>` : ""}
          ${t ? `<span class="rozet">${t.n} taksit</span>` : ""}</div>
        <div class="soluk">${kisaTarih(i.tarih)} · ${alt}</div>
      </div>
      <div class="tutar kalin ${isaret}">${onEk}${para.format(sayi(i.tutar))}</div>
    </div>`;
}

function hesapSatiri(h) {
  const b = bakiye(h);
  if (h.tur === "kredi") {
    const borc = kartBorcu(h); const limit = sayi(h.limit);
    return `
    <div class="kart liste-ogesi" data-hesap="${h.id}">
      <div class="satir"><div class="esnek"><div class="kalin">${esc(h.ad)}</div>
        <div class="soluk">Kredi kartı${h.varsayilan ? " · varsayılan" : ""}${h.sonOdemeGunu ? ` · son ödeme ayın ${esc(h.sonOdemeGunu)}'i` : ""}</div></div>
        <div class="sag"><div class="soluk">Borç</div><div class="tutar kalin ${borc ? "eksi" : ""}">${para.format(borc)}</div></div></div>
      ${limit ? `<div class="cubuk"><div style="width:${Math.min(100, borc / limit * 100)}%;background:${borc / limit > .8 ? "var(--kirmizi)" : "var(--ana)"}"></div></div>
        <div class="soluk" style="margin-top:4px">Kullanılabilir: ${para.format(Math.max(0, limit - borc))} / ${para.format(limit)}</div>` : ""}
    </div>`;
  }
  return `
    <div class="kart satir liste-ogesi" data-hesap="${h.id}">
      <div class="esnek"><div class="kalin">${esc(h.ad)}</div><div class="soluk">${HESAP_TURLERI[h.tur] || "Banka hesabı"}${h.varsayilan ? " · varsayılan" : ""}</div></div>
      <div class="tutar kalin ${b < 0 ? "eksi" : ""}">${para.format(b)}</div>
    </div>`;
}

// ---------- Özet ----------
function ozet() {
  const aktif = aktifHesaplar();
  if (!aktif.length) return `
    <div class="kart">
      <div class="kalin">Hoş geldiniz!</div>
      <p class="soluk">Önce hesaplarınızı ekleyin: <b>Nakit</b> (cüzdan), <b>banka hesaplarınız</b> ve varsa <b>kredi kartlarınız</b>.
      Alışveriş listesinde bitirdiğiniz alışverişler ödeme şekline göre bu hesaplardan otomatik düşülür.</p>
      <button class="tam" id="hesaba-git">Hesap ekle</button>
    </div>`;
  const varlik = aktif.filter((h) => h.tur !== "kredi").reduce((t, h) => t + bakiye(h), 0);
  const borc = aktif.filter((h) => h.tur === "kredi").reduce((t, h) => t + kartBorcu(h), 0);
  const ay = bugun().slice(0, 7);
  const buAy = gecerli().filter((i) => String(i.tarih).startsWith(ay));
  const gelir = buAy.filter((i) => i.tur === "gelir").reduce((t, i) => t + sayi(i.tutar), 0);
  const gider = buAy.filter((i) => i.tur === "gider").reduce((t, i) => t + sayi(i.tutar), 0);
  const bekleyen = yuklendi.alisveris ? bekleyenAlisverisler().filter((a) => !varsayilanHesap(odemeTuru(a.odeme))) : [];
  const eksikTurler = [...new Set(bekleyen.map((a) => HESAP_TURLERI[odemeTuru(a.odeme)]))];
  const taksitYuku = aktif.filter((h) => h.tur === "kredi").reduce((t, h) => t + aktifTaksitler(h.id).reduce((x, i) => x + taksitDurumu(i).aylik, 0), 0);
  const grup = (tur, baslik) => { const hs = aktif.filter((h) => tur === "kredi" ? h.tur === "kredi" : tur === "nakit" ? h.tur === "nakit" : h.tur !== "kredi" && h.tur !== "nakit"); return hs.length ? `<h2>${baslik}</h2>${hs.map(hesapSatiri).join("")}` : ""; };
  return `
    <div class="hizli">
      <button data-hizli="gider" class="tehlike">− Gider</button>
      <button data-hizli="gelir" class="ikincil">+ Gelir</button>
      <button data-hizli="transfer" class="ikincil">⇄ Transfer</button>
      <button data-hizli="kart" class="ikincil">Kart öde</button>
    </div>
    ${bekleyen.length ? `<div class="uyari">${bekleyen.length} alışveriş düşülemedi. ${esc(eksikTurler.join(", "))} türünde bir hesap ekleyin, otomatik düşülecek.</div>` : ""}
    <div class="kart">
      <div class="satir">
        <div class="esnek"><div class="soluk">Nakit + banka</div><div class="tutar kalin">${para.format(varlik)}</div></div>
        ${borc ? `<div class="esnek sag"><div class="soluk">Kart borcu</div><div class="tutar kalin eksi">${para.format(borc)}</div></div>` : ""}
      </div>
      <div class="soluk" style="margin-top:10px">Net durum</div>
      <div class="toplam tutar ${varlik - borc < 0 ? "eksi" : ""}">${para.format(varlik - borc)}</div>
      <div class="satir" style="margin-top:10px">
        <div class="esnek"><div class="soluk">${esc(ayAdi(ay))} gelir</div><div class="tutar kalin arti">${para.format(gelir)}</div></div>
        <div class="esnek sag"><div class="soluk">Gider</div><div class="tutar kalin eksi">${para.format(gider)}</div></div>
      </div>
      ${taksitYuku ? `<div class="soluk" style="margin-top:8px">Aylık kart taksit yükü: <b>${para.format(taksitYuku)}</b></div>` : ""}
    </div>
    ${grup("nakit", "Nakit")}${grup("banka", "Banka hesapları")}${grup("kredi", "Kredi kartları")}
    <h2>Son işlemler</h2>
    ${gecerli().length ? gecerli().slice(0, 6).map((i) => islemSatiri(i)).join("") : `<div class="bos">Henüz işlem yok.</div>`}`;
}

// ---------- İşlemler ----------
function islemEkrani() {
  let liste = gecerli();
  if (filtre.tur) liste = liste.filter((i) => i.tur === filtre.tur);
  if (filtre.hesap) liste = liste.filter((i) => i.hesapId === filtre.hesap || i.hedefHesapId === filtre.hesap);
  let html = `
    <div class="cipler">${[["", "Tümü"], ["gider", "Gider"], ["gelir", "Gelir"], ["transfer", "Transfer"]].map(([k, v]) =>
      `<button class="cip ${filtre.tur === k ? "secili" : ""}" data-filtre="${k}">${v}</button>`).join("")}</div>
    <select id="filtre-hesap" style="margin-bottom:6px"><option value="">Tüm hesaplar</option>${hesaplar.map((h) => `<option value="${h.id}" ${h.id === filtre.hesap ? "selected" : ""}>${esc(h.ad)}</option>`).join("")}</select>`;
  if (!liste.length) return html + `<div class="bos">İşlem yok. Eklemek için + düğmesine basın.</div>`;
  let sonAy = "";
  for (const i of liste.slice(0, 300)) {
    const ay = String(i.tarih).slice(0, 7);
    if (ay !== sonAy) {
      const ayIslem = liste.filter((x) => String(x.tarih).startsWith(ay));
      const net = ayIslem.reduce((t, x) => t + (x.tur === "gelir" ? sayi(x.tutar) : x.tur === "gider" ? -sayi(x.tutar) : 0), 0);
      html += `<h2 class="satir"><span class="esnek">${esc(ayAdi(ay))}</span>${filtre.tur === "transfer" ? "" : `<span class="tutar ${net < 0 ? "eksi" : "arti"}">${para.format(net)}</span>`}</h2>`;
      sonAy = ay;
    }
    html += islemSatiri(i, filtre.hesap);
  }
  return html;
}

// ---------- Hesaplar ----------
function hesapEkrani() {
  const grup = (f, b) => { const hs = hesaplar.filter(f); return hs.length ? `<h2>${b}</h2>${hs.map(hesapSatiri).join("")}` : ""; };
  return `
    ${hesaplar.length ? "" : `<div class="bos">Henüz hesap yok. Eklemek için + düğmesine basın.</div>`}
    ${grup((h) => !h.arsiv && h.tur === "nakit", "Nakit")}
    ${grup((h) => !h.arsiv && (h.tur === "banka" || !h.tur), "Banka hesapları")}
    ${grup((h) => !h.arsiv && h.tur === "kredi", "Kredi kartları")}
    ${grup((h) => h.arsiv, "Arşiv")}
    <p class="soluk" style="padding:0 4px">Alışveriş listesinde <b>nakit</b> ödenenler varsayılan nakit hesabından, <b>banka kartıyla</b> ödenenler
    varsayılan banka hesabından, <b>kredi kartıyla</b> ödenenler varsayılan kredi kartından otomatik düşülür.</p>`;
}

function cizHesapDetay(h) {
  const kart = h.tur === "kredi";
  const ilgili = gecerli().filter((i) => i.hesapId === h.id || i.hedefHesapId === h.id);
  const taksitler = kart ? aktifTaksitler(h.id) : [];
  const buAyTaksit = taksitler.reduce((t, i) => t + taksitDurumu(i).aylik, 0);
  const borc = kartBorcu(h); const limit = sayi(h.limit);
  kok.innerHTML = `
    <header><button id="geri">‹</button><h1>${esc(h.ad)}</h1><button id="duzenle">Düzenle</button></header>
    <main>
      <div class="kart">
        <div class="soluk">${HESAP_TURLERI[h.tur] || "Banka hesabı"}${h.arsiv ? " · arşivde" : ""}</div>
        ${kart ? `
          <div class="soluk" style="margin-top:6px">Güncel borç</div>
          <div class="toplam tutar ${borc ? "eksi" : ""}">${para.format(borc)}</div>
          ${limit ? `<div class="cubuk"><div style="width:${Math.min(100, borc / limit * 100)}%"></div></div>
            <div class="soluk" style="margin-top:4px">Limit ${para.format(limit)} · Kullanılabilir ${para.format(Math.max(0, limit - borc))}</div>` : ""}
          ${h.kesimGunu || h.sonOdemeGunu ? `<div class="soluk" style="margin-top:4px">${h.kesimGunu ? `Hesap kesim: ayın ${esc(h.kesimGunu)}'i` : ""}${h.kesimGunu && h.sonOdemeGunu ? " · " : ""}${h.sonOdemeGunu ? `Son ödeme: ayın ${esc(h.sonOdemeGunu)}'i` : ""}</div>` : ""}
          ${bakiye(h) > 0 ? `<div class="soluk" style="margin-top:4px">Kartta ${para.format(bakiye(h))} fazla ödeme var.</div>` : ""}
          <button class="tam" id="kart-ode" style="margin-top:12px" ${borc ? "" : "disabled"}>Kart borcunu öde</button>`
        : `<div class="soluk" style="margin-top:6px">Bakiye</div><div class="toplam tutar ${bakiye(h) < 0 ? "eksi" : ""}">${para.format(bakiye(h))}</div>`}
      </div>
      ${kart && taksitler.length ? `
        <h2 class="satir"><span class="esnek">Devam eden taksitler</span><span class="tutar">${para.format(buAyTaksit)}/ay</span></h2>
        ${taksitler.map((i) => { const t = taksitDurumu(i); return `
          <div class="kart liste-ogesi" data-islem="${i.id}">
            <div class="satir"><div class="esnek"><div class="kalin">${esc(i.aciklama || i.kategori || "Taksitli harcama")}</div>
              <div class="soluk">${kisaTarih(i.tarih)} · ${t.odenen}/${t.n} ödendi · aylık ${para.format(t.aylik)}</div></div>
              <div class="sag"><div class="soluk">Kalan</div><div class="tutar kalin">${para.format(t.kalanTutar)}</div></div></div>
            <div class="cubuk"><div style="width:${t.odenen / t.n * 100}%"></div></div>
          </div>`; }).join("")}` : ""}
      <h2>Hareketler</h2>
      ${ilgili.length ? ilgili.slice(0, 200).map((i) => islemSatiri(i, h.id)).join("") : `<div class="bos">Bu hesapta henüz hareket yok.</div>`}
    </main>
    <button class="yuzen" id="yeni" aria-label="Yeni">+</button>`;
  document.getElementById("geri").onclick = () => { acikHesapId = null; ciz(); };
  document.getElementById("duzenle").onclick = () => hesapPenceresi(h);
  document.getElementById("yeni").onclick = () => islemPenceresi(null, { tur: "gider", hesapId: h.id });
  const ko = document.getElementById("kart-ode"); if (ko) ko.onclick = () => kartOdePenceresi(h);
  kok.querySelectorAll("[data-islem]").forEach((el) => el.onclick = () => islemPenceresi(islemler.find((i) => i.id === el.dataset.islem)));
}

// ---------- Rapor ----------
function raporEkrani() {
  const ay = raporAyi;
  const liste = gecerli().filter((i) => String(i.tarih).startsWith(ay));
  const gelirler = liste.filter((i) => i.tur === "gelir");
  const giderler = liste.filter((i) => i.tur === "gider");
  const gelir = gelirler.reduce((t, i) => t + sayi(i.tutar), 0);
  const gider = giderler.reduce((t, i) => t + sayi(i.tutar), 0);
  const kartOdemeleri = liste.filter((i) => i.tur === "transfer" && kartMi(i.hedefHesapId)).reduce((t, i) => t + sayi(i.tutar), 0);
  const gruplar = {};
  for (const i of giderler) {
    const g = kategoriGrubu(i.kategori);
    gruplar[g] ||= { toplam: 0, kat: {} };
    gruplar[g].toplam += sayi(i.tutar);
    const k = i.kategori || "Kategorisiz";
    gruplar[g].kat[k] = (gruplar[g].kat[k] || 0) + sayi(i.tutar);
  }
  const gelirKat = {};
  for (const i of gelirler) { const k = i.kategori || "Kategorisiz"; gelirKat[k] = (gelirKat[k] || 0) + sayi(i.tutar); }
  const sirali = Object.entries(gruplar).sort((a, b) => b[1].toplam - a[1].toplam);
  const enBuyuk = sirali[0]?.[1].toplam || 1;
  return `
    <div class="kart satir">
      <button class="ikincil" id="onceki-ay">‹</button>
      <div class="esnek" style="text-align:center;font-weight:700">${esc(ayAdi(ay))}</div>
      <button class="ikincil" id="sonraki-ay" ${ay >= bugun().slice(0, 7) ? "disabled" : ""}>›</button>
    </div>
    <div class="kart">
      <div class="satir">
        <div class="esnek"><div class="soluk">Gelir</div><div class="tutar kalin arti">${para.format(gelir)}</div></div>
        <div class="esnek"><div class="soluk">Gider</div><div class="tutar kalin eksi">${para.format(gider)}</div></div>
        <div class="esnek sag"><div class="soluk">Fark</div><div class="tutar kalin ${gelir - gider < 0 ? "eksi" : "arti"}">${para.format(gelir - gider)}</div></div>
      </div>
      ${kartOdemeleri ? `<div class="soluk" style="margin-top:8px">Bu ay yapılan kart ödemeleri: ${para.format(kartOdemeleri)} (gidere sayılmaz, harcamalar zaten gider olarak yazıldı)</div>` : ""}
    </div>
    <h2>Giderler</h2>
    ${sirali.length ? sirali.map(([g, v]) => `
      <div class="kart">
        <div class="satir"><div class="esnek kalin">${esc(g)}</div><div class="tutar kalin">${para.format(v.toplam)}</div>
          <div class="soluk" style="width:44px;text-align:right">%${Math.round(v.toplam / (gider || 1) * 100)}</div></div>
        <div class="cubuk"><div style="width:${v.toplam / enBuyuk * 100}%;background:var(--kirmizi)"></div></div>
        ${Object.entries(v.kat).sort((a, b) => b[1] - a[1]).map(([k, t]) => `<div class="satir soluk" style="margin-top:6px"><span class="esnek">${esc(k)}</span><span class="tutar">${para.format(t)}</span></div>`).join("")}
      </div>`).join("") : `<div class="bos">Bu ay gider yok.</div>`}
    ${Object.keys(gelirKat).length ? `<h2>Gelirler</h2><div class="kart">${Object.entries(gelirKat).sort((a, b) => b[1] - a[1]).map(([k, t]) =>
      `<div class="satir" style="padding:4px 0"><span class="esnek">${esc(k)}</span><span class="tutar arti kalin">${para.format(t)}</span></div>`).join("")}</div>` : ""}
    <p class="soluk" style="padding:0 4px">Taksitli harcamalar, yapıldığı ayda toplam tutarıyla sayılır.</p>`;
}

// ---------- Kategoriler ----------
function kategoriEkrani() {
  const giderGruplari = {};
  katListesi("gider").forEach((k) => (giderGruplari[k.grup || "Diğer"] ||= []).push(k));
  const satir = (k) => `<div class="satir liste-ogesi" data-kat="${k.id}"><span class="esnek">${esc(k.ad)}</span><span class="soluk">›</span></div>`;
  return `
    <p class="soluk" style="margin:0 4px 6px">Kategoriye dokunarak adını ya da grubunu değiştirebilirsiniz. Yeni kategori için + düğmesine basın.</p>
    <h2>Gider kategorileri</h2>
    ${Object.entries(giderGruplari).map(([g, ks]) => `<div class="grup-baslik">${esc(g)}</div><div class="kart tablo">${ks.map(satir).join("")}</div>`).join("")}
    <h2>Gelir kategorileri</h2>
    <div class="kart tablo">${katListesi("gelir").map(satir).join("")}</div>`;
}

// ---------- Pencereler ----------
function hesapSecimi(id, secili, filtreFn = () => true) {
  const hs = hesaplar.filter((h) => (!h.arsiv || h.id === secili) && filtreFn(h));
  const og = (tur, b) => { const x = hs.filter((h) => (h.tur || "banka") === tur); return x.length ? `<optgroup label="${b}">${x.map((h) => `<option value="${h.id}" ${h.id === secili ? "selected" : ""}>${esc(h.ad)}</option>`).join("")}</optgroup>` : ""; };
  return `<select id="${id}">${og("nakit", "Nakit")}${og("banka", "Banka hesapları")}${og("kredi", "Kredi kartları")}</select>`;
}

function kategoriSecimi(tur, secili) {
  const ks = katListesi(tur);
  let html = `<select id="kategori"><option value="">Kategori seçin…</option>`;
  if (tur === "gider") {
    const gruplar = {};
    ks.forEach((k) => (gruplar[k.grup || "Diğer"] ||= []).push(k));
    for (const [g, list] of Object.entries(gruplar)) html += `<optgroup label="${esc(g)}">${list.map((k) => `<option ${k.ad === secili ? "selected" : ""}>${esc(k.ad)}</option>`).join("")}</optgroup>`;
  } else html += ks.map((k) => `<option ${k.ad === secili ? "selected" : ""}>${esc(k.ad)}</option>`).join("");
  if (secili && !ks.some((k) => k.ad === secili)) html += `<option selected>${esc(secili)}</option>`;
  return html + `</select>`;
}

function islemPenceresi(i, on = {}) {
  if (!aktifHesaplar().length) { alert("Önce Hesaplar sekmesinden bir hesap ekleyin."); sekme = "hesaplar"; acikHesapId = null; ciz(); return; }
  const yeni = !i;
  const otomatik = i?.kaynak === "alisveris";
  const varsayilanKaynak = (varsayilanHesap("banka") || varsayilanHesap("nakit") || aktifHesaplar()[0]).id;
  i = i || { tur: "gider", tutar: "", hesapId: varsayilanKaynak, hedefHesapId: "", kategori: "", aciklama: "", tarih: bugun(), taksit: 1, ...on };
  let tur = i.tur;
  pencere(`
    <h3>${yeni ? "Yeni işlem" : "İşlemi düzenle"}</h3>
    ${otomatik ? `<div class="uyari">Bu gider alışveriş listesinden otomatik geldi. Tutarı, hesabı ve kategoriyi değiştirebilirsiniz.</div>` : ""}
    ${otomatik ? "" : `<div class="secenekler">
      <button data-t="gider" class="${tur === "gider" ? "secili" : ""}">Gider</button>
      <button data-t="gelir" class="${tur === "gelir" ? "secili" : ""}">Gelir</button>
      <button data-t="transfer" class="${tur === "transfer" ? "secili" : ""}">Transfer</button></div>`}
    <label>Tutar (₺)</label><input id="tutar" inputmode="decimal" value="${esc(sayiYaz(sayi(i.tutar)))}" placeholder="0,00">
    <label id="hesap-etiket"></label>${hesapSecimi("hesap", i.hesapId)}
    <div id="hedef-alan"><label>Hangi hesaba</label>${hesapSecimi("hedef", i.hedefHesapId || aktifHesaplar().find((h) => h.id !== i.hesapId)?.id)}</div>
    <div id="taksit-alan"><label>Taksit</label><select id="taksit">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map((n) =>
      `<option value="${n}" ${n === (parseInt(i.taksit) || 1) ? "selected" : ""}>${n === 1 ? "Peşin" : n + " taksit"}</option>`).join("")}</select>
      <div class="soluk" id="taksit-bilgi" style="margin-top:4px"></div></div>
    <div id="kategori-alan"><label>Kategori</label><div id="kategori-kutu"></div></div>
    <label>Açıklama</label><input id="aciklama" value="${esc(i.aciklama)}" placeholder="isteğe bağlı, ör. Ekim faturası">
    <label>Tarih</label><input id="tarih" type="date" value="${esc(i.tarih)}">
    <div class="dugmeler">
      ${yeni ? `<button class="ikincil" data-kapat>Vazgeç</button>` : `<button class="tehlike" id="sil">Sil</button>`}
      <button id="tamam">Kaydet</button>
    </div>`,
  (p, kapat) => {
    const $ = (s) => p.querySelector(s);
    let sonKat = i.kategori;
    const guncelle = () => {
      const kredi = kartMi($("#hesap").value);
      $("#hedef-alan").style.display = tur === "transfer" ? "block" : "none";
      $("#kategori-alan").style.display = tur === "transfer" ? "none" : "block";
      $("#taksit-alan").style.display = tur === "gider" && kredi ? "block" : "none";
      $("#hesap-etiket").textContent = tur === "transfer" ? "Hangi hesaptan" : tur === "gelir" ? "Hangi hesaba" : "Hangi hesaptan / karttan";
      const n = parseInt($("#taksit").value) || 1; const t = sayi($("#tutar").value);
      $("#taksit-bilgi").textContent = n > 1 && t ? `Aylık ${para.format(t / n)} × ${n} ay` : "";
      if (tur !== "transfer") {
        const k = $("#kategori"); if (k) sonKat = k.value;
        const kategoriTuru = $("#kategori-kutu").dataset.tur;
        if (kategoriTuru !== tur) { $("#kategori-kutu").innerHTML = kategoriSecimi(tur, kategoriTuru ? "" : sonKat); $("#kategori-kutu").dataset.tur = tur; }
      }
    };
    p.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
      tur = b.dataset.t;
      p.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("secili", x === b));
      guncelle();
    });
    $("#hesap").onchange = guncelle; $("#taksit").onchange = guncelle; $("#tutar").oninput = guncelle;
    guncelle();
    if (yeni) setTimeout(() => $("#tutar").focus(), 60);
    $("#tamam").onclick = () => {
      const tutar = sayi($("#tutar").value);
      if (!(tutar > 0)) { $("#tutar").focus(); return; }
      const kredi = kartMi($("#hesap").value);
      const veri = {
        tur, tutar, hesapId: $("#hesap").value,
        hedefHesapId: tur === "transfer" ? $("#hedef").value : "",
        kategori: tur === "transfer" ? "" : ($("#kategori")?.value || ""),
        taksit: tur === "gider" && kredi ? (parseInt($("#taksit").value) || 1) : 1,
        aciklama: $("#aciklama").value.trim(),
        tarih: $("#tarih").value || bugun()
      };
      if (tur === "transfer" && veri.hesapId === veri.hedefHesapId) { alert("Transfer için iki farklı hesap seçin."); return; }
      kapat();
      if (yeni) setDoc(doc(collection(db, "islemler")), { ...veri, olusturma: serverTimestamp() }).catch(hataGoster);
      else updateDoc(doc(db, "islemler", i.id), veri).catch(hataGoster);
    };
    const sil = $("#sil");
    if (sil) sil.onclick = () => {
      if (!confirm("Bu işlem silinsin mi?")) return;
      kapat();
      // Alışverişten gelen işlem tamamen silinirse tekrar eklenir; bu yüzden iptal olarak işaretlenir.
      if (otomatik) updateDoc(doc(db, "islemler", i.id), { iptal: true }).catch(hataGoster);
      else deleteDoc(doc(db, "islemler", i.id)).catch(hataGoster);
    };
  });
}

function kartOdePenceresi(kart) {
  const kaynaklar = aktifHesaplar().filter((h) => h.tur !== "kredi");
  if (!kaynaklar.length) { alert("Ödeme yapacak bir nakit ya da banka hesabı ekleyin."); return; }
  const borc = kartBorcu(kart);
  const taksitAylik = aktifTaksitler(kart.id).reduce((t, i) => t + taksitDurumu(i).aylik, 0);
  pencere(`
    <h3>${esc(kart.ad)} borcunu öde</h3>
    <div class="soluk">Güncel toplam borç: <b>${para.format(borc)}</b>${taksitAylik ? ` · bu ayın taksitleri ${para.format(taksitAylik)}` : ""}</div>
    <label>Ödenecek tutar (₺)</label><input id="tutar" inputmode="decimal" value="${esc(sayiYaz(borc))}">
    <div class="cipler" style="margin-top:8px">
      <button class="cip" data-v="${borc}">Tamamı</button>
      ${taksitAylik ? "" : `<button class="cip" data-v="${yuvarla(borc * 0.4)}">Asgari (%40)</button>`}
    </div>
    <label>Hangi hesaptan</label>${hesapSecimi("hesap", (varsayilanHesap("banka") || kaynaklar[0]).id, (h) => h.tur !== "kredi")}
    <label>Tarih</label><input id="tarih" type="date" value="${bugun()}">
    <div class="dugmeler"><button class="ikincil" data-kapat>Vazgeç</button><button id="tamam">Öde</button></div>`,
  (p, kapat) => {
    p.querySelectorAll("[data-v]").forEach((b) => b.onclick = () => { p.querySelector("#tutar").value = sayiYaz(sayi(b.dataset.v)); });
    p.querySelector("#tamam").onclick = () => {
      const tutar = sayi(p.querySelector("#tutar").value);
      if (!(tutar > 0)) return;
      kapat();
      setDoc(doc(collection(db, "islemler")), {
        tur: "transfer", tutar, hesapId: p.querySelector("#hesap").value, hedefHesapId: kart.id,
        kategori: "", aciklama: `${kart.ad} kart ödemesi`, tarih: p.querySelector("#tarih").value || bugun(),
        olusturma: serverTimestamp()
      }).catch(hataGoster);
    };
  });
}

function hesapPenceresi(h) {
  const yeni = !h;
  h = h || { ad: "", tur: hesaplar.some((x) => x.tur === "nakit") ? "banka" : "nakit", acilis: 0, varsayilan: false };
  let tur = h.tur || "banka";
  const kartAcilis = tur === "kredi" ? -sayi(h.acilis) : sayi(h.acilis);
  pencere(`
    <h3>${yeni ? "Hesap ekle" : "Hesabı düzenle"}</h3>
    <label>Tür</label>
    <div class="secenekler">${Object.entries(HESAP_TURLERI).map(([k, v]) => `<button data-t="${k}" class="${tur === k ? "secili" : ""}">${v.replace(" hesabı", "")}</button>`).join("")}</div>
    <label>Adı</label><input id="ad" value="${esc(h.ad)}" placeholder="">
    <label id="acilis-etiket"></label><input id="acilis" inputmode="decimal" value="${esc(sayiYaz(kartAcilis))}" placeholder="0,00">
    <div id="kart-alan">
      <label>Kart limiti (₺)</label><input id="limit" inputmode="decimal" value="${esc(sayiYaz(sayi(h.limit)))}" placeholder="isteğe bağlı">
      <div class="satir">
        <div class="esnek"><label>Hesap kesim günü</label><input id="kesim" inputmode="numeric" value="${esc(h.kesimGunu || "")}" placeholder="ör. 15"></div>
        <div class="esnek"><label>Son ödeme günü</label><input id="sonodeme" inputmode="numeric" value="${esc(h.sonOdemeGunu || "")}" placeholder="ör. 25"></div>
      </div>
    </div>
    <label class="onay"><input type="checkbox" class="kutu" id="varsayilan" ${h.varsayilan ? "checked" : ""}> <span id="varsayilan-yazi"></span></label>
    ${yeni ? "" : `<label class="onay"><input type="checkbox" class="kutu" id="arsiv" ${h.arsiv ? "checked" : ""}> Arşivle (artık kullanılmıyor)</label>`}
    <div class="dugmeler">
      ${yeni ? `<button class="ikincil" data-kapat>Vazgeç</button>` : `<button class="tehlike" id="sil">Sil</button>`}
      <button id="tamam">Kaydet</button>
    </div>`,
  (p, kapat) => {
    const $ = (s) => p.querySelector(s);
    const guncelle = () => {
      $("#kart-alan").style.display = tur === "kredi" ? "block" : "none";
      $("#acilis-etiket").textContent = tur === "kredi" ? "Şu anki kart borcu (₺)" : "Şu anki bakiye (₺)";
      $("#ad").placeholder = tur === "nakit" ? "ör. Cüzdan" : tur === "kredi" ? "ör. Bonus Kart" : "ör. Ziraat maaş hesabı";
      $("#varsayilan-yazi").textContent = tur === "kredi" ? "Alışverişlerde kredi kartı seçilince bu kart kullanılsın"
        : tur === "nakit" ? "Alışverişlerde nakit seçilince bu hesap kullanılsın" : "Alışverişlerde banka kartı seçilince bu hesap kullanılsın";
    };
    p.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
      tur = b.dataset.t;
      p.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("secili", x === b));
      guncelle();
    });
    guncelle();
    $("#tamam").onclick = async () => {
      const ad = $("#ad").value.trim();
      if (!ad) { $("#ad").focus(); return; }
      const girilen = sayi($("#acilis").value);
      const veri = {
        ad, tur, acilis: tur === "kredi" ? -Math.abs(girilen) : girilen,
        varsayilan: $("#varsayilan").checked || !hesaplar.some((x) => x.tur === tur && x.id !== h.id && !x.arsiv),
        arsiv: yeni ? false : $("#arsiv").checked,
        limit: tur === "kredi" ? sayi($("#limit").value) : 0,
        kesimGunu: tur === "kredi" ? $("#kesim").value.trim() : "",
        sonOdemeGunu: tur === "kredi" ? $("#sonodeme").value.trim() : ""
      };
      kapat();
      try {
        if (veri.varsayilan) for (const x of hesaplar.filter((x) => x.tur === tur && x.varsayilan && x.id !== h.id)) await updateDoc(doc(db, "hesaplar", x.id), { varsayilan: false });
        if (yeni) await setDoc(doc(collection(db, "hesaplar")), { ...veri, sira: hesaplar.length, olusturma: serverTimestamp() });
        else await updateDoc(doc(db, "hesaplar", h.id), veri);
      } catch (e) { hataGoster(e); }
    };
    const sil = $("#sil");
    if (sil) sil.onclick = () => {
      const kullanilan = islemler.some((i) => !i.iptal && (i.hesapId === h.id || i.hedefHesapId === h.id));
      if (kullanilan) { alert("Bu hesapta işlemler var, silinemez. Kullanmıyorsanız “Arşivle” seçeneğini işaretleyin."); return; }
      if (!confirm(`"${h.ad}" silinsin mi?`)) return;
      kapat(); acikHesapId = null;
      deleteDoc(doc(db, "hesaplar", h.id)).catch(hataGoster);
    };
  });
}

function kategoriPenceresi(k) {
  const yeni = !k;
  k = k || { ad: "", tur: "gider", grup: "" };
  let tur = k.tur;
  const gruplar = [...new Set(kategoriler.filter((x) => x.tur === "gider").map((x) => x.grup).filter(Boolean))];
  pencere(`
    <h3>${yeni ? "Yeni kategori" : "Kategoriyi düzenle"}</h3>
    <div class="secenekler"><button data-t="gider" class="${tur === "gider" ? "secili" : ""}">Gider</button><button data-t="gelir" class="${tur === "gelir" ? "secili" : ""}">Gelir</button></div>
    <label>Adı</label><input id="ad" value="${esc(k.ad)}" placeholder="ör. Kasap">
    <div id="grup-alan"><label>Grup</label><input id="grup" list="gruplar" value="${esc(k.grup === "Gelir" ? "" : k.grup)}" placeholder="ör. Mutfak">
      <datalist id="gruplar">${gruplar.map((g) => `<option value="${esc(g)}">`).join("")}</datalist></div>
    <div class="dugmeler">
      ${yeni ? `<button class="ikincil" data-kapat>Vazgeç</button>` : `<button class="tehlike" id="sil">Sil</button>`}
      <button id="tamam">Kaydet</button>
    </div>`,
  (p, kapat) => {
    const guncelle = () => { p.querySelector("#grup-alan").style.display = tur === "gider" ? "block" : "none"; };
    p.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
      tur = b.dataset.t; p.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("secili", x === b)); guncelle();
    });
    guncelle();
    p.querySelector("#tamam").onclick = () => {
      const ad = p.querySelector("#ad").value.trim();
      if (!ad) return;
      const veri = { ad, tur, grup: tur === "gelir" ? "Gelir" : (p.querySelector("#grup").value.trim() || "Diğer") };
      kapat();
      if (yeni) setDoc(doc(collection(db, "defterKategorileri")), { ...veri, sira: 1000 + kategoriler.length }).catch(hataGoster);
      else {
        updateDoc(doc(db, "defterKategorileri", k.id), veri).catch(hataGoster);
        // Ad değiştiyse eski işlemlerdeki kategori adını da güncelle
        if (ad !== k.ad) islemler.filter((i) => i.kategori === k.ad).forEach((i) => updateDoc(doc(db, "islemler", i.id), { kategori: ad }).catch(() => {}));
      }
    };
    const sil = p.querySelector("#sil");
    if (sil) sil.onclick = () => {
      const say = islemler.filter((i) => i.kategori === k.ad).length;
      if (!confirm(say ? `"${k.ad}" silinsin mi? ${say} işlem bu kategoride kalmaya devam eder.` : `"${k.ad}" silinsin mi?`)) return;
      kapat(); deleteDoc(doc(db, "defterKategorileri", k.id)).catch(hataGoster);
    };
  });
}

function pencere(html, kur) {
  const perde = document.createElement("div");
  perde.className = "perde";
  perde.innerHTML = `<div class="pencere">${html}</div>`;
  const kapat = () => perde.remove();
  perde.onclick = (e) => { if (e.target === perde) kapat(); };
  perde.querySelectorAll("[data-kapat]").forEach((b) => b.onclick = kapat);
  document.body.appendChild(perde);
  kur(perde, kapat);
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
