import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, collection, doc, addDoc, setDoc, updateDoc,
  deleteDoc, onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });

const kok = document.getElementById("uygulama");
const para = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sayi = (v) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v ?? "").trim().replace(/\s|₺/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (!/^\d*\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};
const sayiYaz = (n) => n ? String(n).replace(".", ",") : "";
const gun = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const bugun = () => gun(Date.now());
const tarihYaz = (s) => s ? new Date(s + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "";
const ayAdi = (s) => new Date(s + "-15T12:00:00").toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

let kullanici = null;
let hesaplar = [], islemler = [], alisverisler = [];
let yuklendi = { hesaplar: false, islemler: false, alisveris: false };
let sekme = "ozet";
let hata = "";
let dinleyiciler = [];
const yaziliyor = new Set();

// ---------- Giriş ----------
onAuthStateChanged(auth, (u) => {
  kullanici = u;
  dinleyiciler.forEach((d) => d()); dinleyiciler = [];
  hesaplar = []; islemler = []; alisverisler = [];
  yuklendi = { hesaplar: false, islemler: false, alisveris: false };
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
  dinleyiciler.push(onSnapshot(query(collection(db, "alisveris"), where("durum", "==", "bitti")), (s) => {
    alisverisler = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    yuklendi.alisveris = true; sonra();
  }, hataYakala));
  ciz();
});

function sonra() { alisverisleriAktar(); ciz(); }

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
      <p>Gelir, gider ve hesap bakiyeleriniz</p>
      <button id="giris">Google ile giriş yap</button>
    </main>`;
  document.getElementById("giris").onclick = girisYap;
}

// ---------- Alışveriş listesinden otomatik gider ----------
function varsayilanHesap(tur) {
  const uygun = hesaplar.filter((h) => h.tur === tur && !h.arsiv);
  return uygun.find((h) => h.varsayilan) || uygun[0] || null;
}

function bekleyenAlisverisler() {
  const aktarilan = new Set(islemler.map((i) => i.alisverisId).filter(Boolean));
  return alisverisler.filter((a) => !aktarilan.has(a.id));
}

function alisverisleriAktar() {
  if (!yuklendi.hesaplar || !yuklendi.islemler || !yuklendi.alisveris) return;
  for (const a of bekleyenAlisverisler()) {
    const hesap = varsayilanHesap(a.odeme === "nakit" ? "nakit" : "banka");
    if (!hesap || yaziliyor.has(a.id)) continue;
    yaziliyor.add(a.id);
    const tarih = a.bitis?.seconds ? gun(a.bitis.seconds * 1000) : bugun();
    setDoc(doc(db, "islemler", "alis_" + a.id), {
      tur: "gider", tutar: sayi(a.toplam), hesapId: hesap.id, tarih,
      kategori: "Alışveriş", aciklama: a.ad || "Alışveriş",
      kaynak: "alisveris", alisverisId: a.id, odeme: a.odeme || "kart",
      olusturma: serverTimestamp()
    }).catch((e) => console.error(e)).finally(() => yaziliyor.delete(a.id));
  }
}

// ---------- Hesaplamalar ----------
const gecerli = () => islemler.filter((i) => !i.iptal);
function bakiye(h) {
  let b = sayi(h.acilis);
  for (const i of gecerli()) {
    const t = sayi(i.tutar);
    if (i.tur === "gelir" && i.hesapId === h.id) b += t;
    if (i.tur === "gider" && i.hesapId === h.id) b -= t;
    if (i.tur === "transfer") { if (i.hesapId === h.id) b -= t; if (i.hedefHesapId === h.id) b += t; }
  }
  return b;
}
const hesapAdi = (id) => hesaplar.find((h) => h.id === id)?.ad || "Silinmiş hesap";

// ---------- Ekranlar ----------
function ciz() {
  if (!kullanici) return cizGiris();
  const icerik = hata ? `<div class="hata">${esc(hata)}</div>`
    : (!yuklendi.hesaplar || !yuklendi.islemler) ? `<p class="bos">Yükleniyor…</p>`
    : sekme === "ozet" ? ozet() : sekme === "islemler" ? islemListesi() : hesapListesi();
  kok.innerHTML = `
    <header><h1>Hesap Defteri</h1><button id="cikis">Çıkış</button></header>
    <main>
      <div class="sekmeler">
        <button data-s="ozet" class="${sekme === "ozet" ? "secili" : ""}">Özet</button>
        <button data-s="islemler" class="${sekme === "islemler" ? "secili" : ""}">İşlemler</button>
        <button data-s="hesaplar" class="${sekme === "hesaplar" ? "secili" : ""}">Hesaplar</button>
      </div>
      ${icerik}
    </main>
    ${hata ? "" : `<button class="yuzen" id="yeni" aria-label="Yeni">+</button>`}`;
  document.getElementById("cikis").onclick = () => signOut(auth);
  kok.querySelectorAll("[data-s]").forEach((b) => b.onclick = () => { sekme = b.dataset.s; ciz(); });
  const yeni = document.getElementById("yeni");
  if (yeni) yeni.onclick = () => sekme === "hesaplar" ? hesapPenceresi(null) : islemPenceresi(null);
  kok.querySelectorAll("[data-islem]").forEach((el) => el.onclick = () => islemPenceresi(islemler.find((i) => i.id === el.dataset.islem)));
  kok.querySelectorAll("[data-hesap]").forEach((el) => el.onclick = () => hesapPenceresi(hesaplar.find((h) => h.id === el.dataset.hesap)));
  const git = document.getElementById("hesaba-git");
  if (git) git.onclick = () => { sekme = "hesaplar"; ciz(); };
}

function islemSatiri(i) {
  const isaret = i.tur === "gelir" ? "arti" : i.tur === "gider" ? "eksi" : "";
  const alt = i.tur === "transfer"
    ? `${esc(hesapAdi(i.hesapId))} → ${esc(hesapAdi(i.hedefHesapId))}`
    : `${esc(hesapAdi(i.hesapId))}${i.kategori ? " · " + esc(i.kategori) : ""}`;
  return `
    <div class="kart satir liste-ogesi" data-islem="${i.id}">
      <div class="esnek">
        <div class="kalin">${esc(i.aciklama || i.kategori || (i.tur === "transfer" ? "Transfer" : i.tur === "gelir" ? "Gelir" : "Gider"))}
          ${i.kaynak === "alisveris" ? `<span class="rozet">Alışveriş</span>` : ""}</div>
        <div class="soluk">${tarihYaz(i.tarih)} · ${alt}</div>
      </div>
      <div class="tutar kalin ${isaret}">${i.tur === "gider" ? "−" : i.tur === "gelir" ? "+" : ""}${para.format(sayi(i.tutar))}</div>
    </div>`;
}

function ozet() {
  const aktif = hesaplar.filter((h) => !h.arsiv);
  if (!aktif.length) return `
    <div class="kart">
      <div class="kalin">Hoş geldiniz!</div>
      <p class="soluk">Önce hesaplarınızı ekleyin: örneğin <b>Nakit</b> (cüzdan) ve <b>banka hesabınız</b>.
      Alışveriş listesinde bitirdiğiniz alışverişler nakit ise Nakit'ten, kart ise banka hesabınızdan otomatik düşülür.</p>
      <button class="tam" id="hesaba-git">Hesap ekle</button>
    </div>`;
  const toplam = aktif.reduce((t, h) => t + bakiye(h), 0);
  const ay = bugun().slice(0, 7);
  const buAy = gecerli().filter((i) => String(i.tarih).startsWith(ay));
  const gelir = buAy.filter((i) => i.tur === "gelir").reduce((t, i) => t + sayi(i.tutar), 0);
  const gider = buAy.filter((i) => i.tur === "gider").reduce((t, i) => t + sayi(i.tutar), 0);
  const bekleyen = yuklendi.alisveris ? bekleyenAlisverisler().filter((a) => !varsayilanHesap(a.odeme === "nakit" ? "nakit" : "banka")) : [];
  return `
    ${bekleyen.length ? `<div class="uyari">${bekleyen.length} alışveriş düşülemedi: ${bekleyen.some((a) => a.odeme === "nakit") ? "Nakit" : "Banka"} türünde bir hesap ekleyin, otomatik düşülecek.</div>` : ""}
    <div class="kart">
      <div class="soluk">Toplam bakiye</div>
      <div class="toplam tutar ${toplam < 0 ? "eksi" : ""}">${para.format(toplam)}</div>
      <div class="satir" style="margin-top:10px">
        <div class="esnek"><div class="soluk">${esc(ayAdi(ay))} gelir</div><div class="tutar kalin arti">${para.format(gelir)}</div></div>
        <div class="esnek sag"><div class="soluk">${esc(ayAdi(ay))} gider</div><div class="tutar kalin eksi">${para.format(gider)}</div></div>
      </div>
    </div>
    <h2>Hesaplar</h2>
    ${aktif.map((h) => `
      <div class="kart satir liste-ogesi" data-hesap="${h.id}">
        <div class="esnek"><div class="kalin">${esc(h.ad)}</div><div class="soluk">${h.tur === "nakit" ? "Nakit" : "Banka"}${h.varsayilan ? " · varsayılan" : ""}</div></div>
        <div class="tutar kalin ${bakiye(h) < 0 ? "eksi" : ""}">${para.format(bakiye(h))}</div>
      </div>`).join("")}
    <h2>Son işlemler</h2>
    ${gecerli().length ? gecerli().slice(0, 5).map(islemSatiri).join("") : `<div class="bos">Henüz işlem yok.</div>`}`;
}

function islemListesi() {
  const liste = gecerli();
  if (!liste.length) return `<div class="bos">Henüz işlem yok. Eklemek için + düğmesine basın.</div>`;
  let html = "", sonAy = "";
  for (const i of liste) {
    const ay = String(i.tarih).slice(0, 7);
    if (ay !== sonAy) {
      const ayIslem = liste.filter((x) => String(x.tarih).startsWith(ay));
      const net = ayIslem.reduce((t, x) => t + (x.tur === "gelir" ? sayi(x.tutar) : x.tur === "gider" ? -sayi(x.tutar) : 0), 0);
      html += `<h2 class="satir"><span class="esnek">${esc(ayAdi(ay))}</span><span class="tutar ${net < 0 ? "eksi" : "arti"}">${para.format(net)}</span></h2>`;
      sonAy = ay;
    }
    html += islemSatiri(i);
  }
  return html;
}

function hesapListesi() {
  return `
    ${hesaplar.length ? hesaplar.map((h) => `
      <div class="kart satir liste-ogesi" data-hesap="${h.id}">
        <div class="esnek"><div class="kalin">${esc(h.ad)}${h.arsiv ? ` <span class="rozet">Arşiv</span>` : ""}</div>
          <div class="soluk">${h.tur === "nakit" ? "Nakit" : "Banka"}${h.varsayilan ? " · varsayılan" : ""}</div></div>
        <div class="tutar kalin ${bakiye(h) < 0 ? "eksi" : ""}">${para.format(bakiye(h))}</div>
      </div>`).join("") : `<div class="bos">Henüz hesap yok. Eklemek için + düğmesine basın.</div>`}
    <p class="soluk" style="padding:0 4px">Alışveriş listesinde <b>nakit</b> ödenen alışverişler varsayılan nakit hesabından,
    <b>kartla</b> ödenenler varsayılan banka hesabından otomatik düşülür.</p>`;
}

// ---------- Pencereler ----------
function hesapPenceresi(h) {
  const yeni = !h;
  h = h || { ad: "", tur: hesaplar.some((x) => x.tur === "nakit") ? "banka" : "nakit", acilis: 0, varsayilan: false };
  let tur = h.tur;
  pencere(`
    <h3>${yeni ? "Hesap ekle" : "Hesabı düzenle"}</h3>
    <label>Hesap adı</label><input id="ad" value="${esc(h.ad)}" placeholder="ör. Nakit, Ziraat Bankası">
    <label>Tür</label>
    <div class="secenekler"><button data-t="nakit" class="${tur === "nakit" ? "secili" : ""}">Nakit</button><button data-t="banka" class="${tur === "banka" ? "secili" : ""}">Banka</button></div>
    <label>Açılış bakiyesi (₺)</label><input id="acilis" inputmode="decimal" value="${esc(sayiYaz(h.acilis))}" placeholder="0,00">
    <label style="display:flex;gap:10px;align-items:center;color:inherit;margin-top:14px"><input type="checkbox" class="kutu" id="varsayilan" ${h.varsayilan ? "checked" : ""}> Bu türün varsayılan hesabı olsun</label>
    ${yeni ? "" : `<label style="display:flex;gap:10px;align-items:center;color:inherit;margin-top:10px"><input type="checkbox" class="kutu" id="arsiv" ${h.arsiv ? "checked" : ""}> Arşivle (artık kullanılmıyor)</label>`}
    <div class="dugmeler">
      ${yeni ? `<button class="ikincil" data-kapat>Vazgeç</button>` : `<button class="tehlike" id="sil">Sil</button>`}
      <button id="tamam">Kaydet</button>
    </div>`,
  (p, kapat) => {
    p.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
      tur = b.dataset.t;
      p.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("secili", x === b));
    });
    p.querySelector("#tamam").onclick = async () => {
      const ad = p.querySelector("#ad").value.trim();
      if (!ad) { p.querySelector("#ad").focus(); return; }
      const veri = {
        ad, tur, acilis: sayi(p.querySelector("#acilis").value),
        varsayilan: p.querySelector("#varsayilan").checked || !hesaplar.some((x) => x.tur === tur && x.id !== h.id),
        arsiv: yeni ? false : p.querySelector("#arsiv").checked
      };
      kapat();
      try {
        if (veri.varsayilan) {
          for (const x of hesaplar.filter((x) => x.tur === tur && x.varsayilan && x.id !== h.id)) await updateDoc(doc(db, "hesaplar", x.id), { varsayilan: false });
        }
        if (yeni) await addDoc(collection(db, "hesaplar"), { ...veri, sira: hesaplar.length, olusturma: serverTimestamp() });
        else await updateDoc(doc(db, "hesaplar", h.id), veri);
      } catch (e) { alert("Kaydedilemedi: " + e.message); }
    };
    const sil = p.querySelector("#sil");
    if (sil) sil.onclick = async () => {
      const kullanilan = islemler.some((i) => !i.iptal && (i.hesapId === h.id || i.hedefHesapId === h.id));
      if (kullanilan) { alert("Bu hesapta işlemler var, silinemez. Kullanmıyorsanız “Arşivle” seçeneğini işaretleyin."); return; }
      if (!confirm(`"${h.ad}" hesabı silinsin mi?`)) return;
      kapat();
      try { await deleteDoc(doc(db, "hesaplar", h.id)); } catch (e) { alert("Silinemedi: " + e.message); }
    };
  });
}

function islemPenceresi(i) {
  const aktif = hesaplar.filter((h) => !h.arsiv || (i && (h.id === i.hesapId || h.id === i.hedefHesapId)));
  if (!aktif.length) { alert("Önce Hesaplar sekmesinden bir hesap ekleyin."); sekme = "hesaplar"; ciz(); return; }
  const yeni = !i;
  const otomatik = i?.kaynak === "alisveris";
  i = i || { tur: "gider", tutar: "", hesapId: (varsayilanHesap("banka") || aktif[0]).id, hedefHesapId: "", kategori: "", aciklama: "", tarih: bugun() };
  let tur = i.tur;
  const kategoriler = [...new Set(["Alışveriş", "Fatura", "Kira", "Ulaşım", "Sağlık", "Eğitim", "Bağış", "Maaş", ...islemler.map((x) => x.kategori)].filter(Boolean))];
  const hesapSec = (id, sec) => `<select id="${id}">${aktif.map((h) => `<option value="${h.id}" ${h.id === sec ? "selected" : ""}>${esc(h.ad)}</option>`).join("")}</select>`;
  pencere(`
    <h3>${yeni ? "Yeni işlem" : "İşlemi düzenle"}</h3>
    ${otomatik ? `<div class="uyari">Bu gider alışveriş listesinden otomatik geldi. Tutarı ve hesabı değiştirebilirsiniz.</div>` : ""}
    ${otomatik ? "" : `<div class="secenekler">
      <button data-t="gider" class="${tur === "gider" ? "secili" : ""}">Gider</button>
      <button data-t="gelir" class="${tur === "gelir" ? "secili" : ""}">Gelir</button>
      <button data-t="transfer" class="${tur === "transfer" ? "secili" : ""}">Transfer</button></div>`}
    <label>Tutar (₺)</label><input id="tutar" inputmode="decimal" value="${esc(sayiYaz(i.tutar))}" placeholder="0,00">
    <label id="hesap-etiket">${tur === "transfer" ? "Hangi hesaptan" : "Hesap"}</label>${hesapSec("hesap", i.hesapId)}
    <div id="hedef-alan" style="display:${tur === "transfer" ? "block" : "none"}"><label>Hangi hesaba</label>${hesapSec("hedef", i.hedefHesapId || aktif.find((h) => h.id !== i.hesapId)?.id)}</div>
    <div id="kategori-alan" style="display:${tur === "transfer" ? "none" : "block"}"><label>Kategori</label><input id="kategori" list="kategoriler" value="${esc(i.kategori)}" placeholder="ör. Fatura">
      <datalist id="kategoriler">${kategoriler.map((k) => `<option value="${esc(k)}">`).join("")}</datalist></div>
    <label>Açıklama</label><input id="aciklama" value="${esc(i.aciklama)}" placeholder="isteğe bağlı">
    <label>Tarih</label><input id="tarih" type="date" value="${esc(i.tarih)}">
    <div class="dugmeler">
      ${yeni ? `<button class="ikincil" data-kapat>Vazgeç</button>` : `<button class="tehlike" id="sil">Sil</button>`}
      <button id="tamam">Kaydet</button>
    </div>`,
  (p, kapat) => {
    p.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
      tur = b.dataset.t;
      p.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("secili", x === b));
      p.querySelector("#hedef-alan").style.display = tur === "transfer" ? "block" : "none";
      p.querySelector("#kategori-alan").style.display = tur === "transfer" ? "none" : "block";
      p.querySelector("#hesap-etiket").textContent = tur === "transfer" ? "Hangi hesaptan" : "Hesap";
    });
    if (yeni) setTimeout(() => p.querySelector("#tutar").focus(), 50);
    p.querySelector("#tamam").onclick = async () => {
      const tutar = sayi(p.querySelector("#tutar").value);
      if (!(tutar > 0)) { p.querySelector("#tutar").focus(); return; }
      const veri = {
        tur, tutar, hesapId: p.querySelector("#hesap").value,
        hedefHesapId: tur === "transfer" ? p.querySelector("#hedef").value : "",
        kategori: tur === "transfer" ? "" : p.querySelector("#kategori").value.trim(),
        aciklama: p.querySelector("#aciklama").value.trim(),
        tarih: p.querySelector("#tarih").value || bugun()
      };
      if (tur === "transfer" && veri.hesapId === veri.hedefHesapId) { alert("Transfer için iki farklı hesap seçin."); return; }
      kapat();
      try {
        if (yeni) await addDoc(collection(db, "islemler"), { ...veri, olusturma: serverTimestamp() });
        else await updateDoc(doc(db, "islemler", i.id), veri);
      } catch (e) { alert("Kaydedilemedi: " + e.message); }
    };
    const sil = p.querySelector("#sil");
    if (sil) sil.onclick = async () => {
      if (!confirm("Bu işlem silinsin mi?")) return;
      kapat();
      try {
        // Alışverişten gelen işlem tamamen silinirse tekrar eklenir; bu yüzden iptal olarak işaretlenir.
        if (otomatik) await updateDoc(doc(db, "islemler", i.id), { iptal: true });
        else await deleteDoc(doc(db, "islemler", i.id));
      } catch (e) { alert("Silinemedi: " + e.message); }
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
