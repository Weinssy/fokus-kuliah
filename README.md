# Fokus Kuliah

Timer pomodoro 25/5 menit dan daftar deadline kuliah dalam satu halaman web. Tanpa akun, tanpa backend, dan semua data tersimpan di `localStorage` browser.

Project target mingguan: 1 project dan 2 konten (minggu 16-22 Nov 2026).

## Live demo

Coba langsung tanpa instalasi di [weinssy.github.io/fokus-kuliah](https://weinssy.github.io/fokus-kuliah/).

## Cara menjalankan

Tidak perlu menginstal dependensi apa pun:

1. Clone repo ini atau unduh sebagai ZIP.
2. Buka `index.html` langsung di browser.

Jika ingin menjalankan lewat server lokal:

```bash
npx serve .
# atau
python -m http.server
```

## Fitur

- **Timer Pomodoro:** mode Fokus 25 menit dan Istirahat 5 menit, tombol Mulai / Lanjutkan / Jeda / Reset, tampilan sisa waktu di judul tab browser, penghitung sesi fokus selesai beserta tombol nolkan hitungan, notifikasi browser saat sesi berakhir, serta perhitungan berbasis timestamp agar tetap akurat saat tab berada di latar.
- **Daftar deadline:** formulir tambah tugas (nama tugas, mata kuliah, batas waktu) dengan validasi input, tandai selesai, filter status (`Semua`, `Aktif`, `Selesai`), hapus per tugas atau hapus semua yang selesai, pengurutan otomatis dari deadline terdekat, dan pemulihan saat data `localStorage` rusak.
- **Desain dan aksesibilitas:** memakai arah visual Kertas & Tinta Kampus (lihat [DESIGN.md](DESIGN.md)), mendukung navigasi keyboard, indikator fokus terlihat, serta tata letak responsif untuk layar ponsel, tablet, dan desktop.

## Struktur file

```text
fokus-kuliah/
  index.html   struktur halaman, timer, dan daftar deadline
  style.css    tata letak responsif, tema kertas dan tinta, status komponen
  script.js    logika timer berbasis timestamp, filter, dan penyimpanan lokal
  DESIGN.md    catatan arah desain, dial, palet warna, dan keputusan UI
  README.md    dokumentasi proyek
```

## Checklist minggu ini

- [x] Kode awal: timer dan deadline berjalan
- [x] Polish tampilan dan aksesibilitas (`DESIGN.md`, kontras WCAG AA, tata letak responsif)
- [ ] Selasa-Rabu: tes sendiri pemakaian harian, perbaiki jika ada yang terasa janggal
- [ ] Kamis: ambil screenshot untuk README, rekam demo vertikal 30-45 detik
- [ ] Jumat: konten demo terbit (TikTok + YouTube Shorts)

## Sengaja ditunda (bukan bagian MVP)

Statistik belajar mingguan, sinkron kalender, akun pengguna, durasi custom, dan tema / dark mode.
